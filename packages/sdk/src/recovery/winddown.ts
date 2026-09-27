import * as anchor from "@anchor-lang/core";
import {
  marketAddress,
  marketAccountAddress,
  protocolAddress,
  recoveryConfigAddress,
} from "@depth/bindings";
import { PublicKey, Transaction } from "@solana/web3.js";

export type ClearingWitness = {
  insurance: bigint;
  openInterest: bigint;
  protocolFees: bigint;
  appFees: bigint;
  salt: bigint;
};
export type MarketWitness = {
  collateral: bigint;
  reserved: bigint;
  position: bigint;
  entryPrice: bigint;
  fundingCheckpoint: bigint;
  salt: bigint;
};
export type FeeWitness = { protocolFee: bigint; appFee: bigint; salt: bigint };

function integer(value: bigint, bits: number, signed = false): anchor.BN {
  const minimum = signed ? -(1n << BigInt(bits - 1)) : 0n;
  const maximum = (1n << BigInt(signed ? bits - 1 : bits)) - 1n;
  if (typeof value !== "bigint" || value < minimum || value > maximum)
    throw new RangeError("Recovery witness field is outside its integer range");
  return new anchor.BN(value.toString());
}

export class WinddownOperator {
  private readonly provider: anchor.AnchorProvider;
  readonly market: PublicKey;
  readonly protocol: PublicKey;
  readonly winddown: PublicKey;
  readonly clearing: PublicKey;

  constructor(private readonly program: anchor.Program) {
    this.provider = program.provider as anchor.AnchorProvider;
    this.market = marketAddress(program.programId);
    this.protocol = protocolAddress(program.programId);
    this.winddown = this.pda("winddown", this.market);
    this.clearing = this.pda("clearing", this.market);
  }

  private pda(seed: string, key: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(seed), key.toBuffer()],
      this.program.programId,
    )[0];
  }

  private async read<T>(name: string, address: PublicKey): Promise<T> {
    const info = await this.provider.connection.getAccountInfo(
      address,
      "confirmed",
    );
    if (!info?.owner.equals(this.program.programId))
      throw new Error(`${name} is unavailable`);
    return this.program.coder.accounts.decode<T>(
      name[0].toLowerCase() + name.slice(1),
      info.data,
    );
  }

  async start(
    witness: ClearingWitness,
    signers: PublicKey[],
  ): Promise<Transaction> {
    const config = await this.read<{ signers: PublicKey[]; market: PublicKey }>(
      "RecoveryConfig",
      recoveryConfigAddress(this.program.programId),
    );
    if (
      !config.market.equals(this.market) ||
      new Set(signers.map((key) => key.toBase58())).size !== signers.length ||
      signers.length < 3 ||
      signers.some(
        (key) => !config.signers.some((member) => member.equals(key)),
      )
    ) {
      throw new Error(
        "Winddown requires at least three distinct registered committee signers",
      );
    }
    const protocol = await this.read<{ vault: PublicKey }>(
      "Protocol",
      this.protocol,
    );
    const transaction = await this.program.methods
      .startWinddown(
        integer(witness.insurance, 64),
        integer(witness.openInterest, 64),
        integer(witness.protocolFees, 64),
        integer(witness.appFees, 64),
        integer(witness.salt, 128),
      )
      .accountsPartial({
        payer: this.provider.wallet.publicKey,
        protocol: this.protocol,
        market: this.market,
        recoveryConfig: recoveryConfigAddress(this.program.programId),
        clearing: this.clearing,
        vault: protocol.vault,
        winddown: this.winddown,
      })
      .remainingAccounts(
        signers.map((pubkey) => ({
          pubkey,
          isSigner: true,
          isWritable: false,
        })),
      )
      .transaction();
    transaction.feePayer = this.provider.wallet.publicKey;
    const block = await this.provider.connection.getLatestBlockhash(
      "confirmed",
    );
    transaction.recentBlockhash = block.blockhash;
    transaction.lastValidBlockHeight = block.lastValidBlockHeight;
    return transaction;
  }

  private async assertRevealing(): Promise<void> {
    const winddown = await this.read<{ finalized: boolean; market: PublicKey }>(
      "Winddown",
      this.winddown,
    );
    if (winddown.finalized || !winddown.market.equals(this.market))
      throw new Error("Winddown is not accepting reveals");
  }

  async reveal(
    owner: PublicKey,
    witness: MarketWitness,
  ): Promise<string | undefined> {
    await this.assertRevealing();
    const account = marketAccountAddress(owner, this.program.programId);
    const claim = this.pda("winddown-claim", account);
    if (await this.provider.connection.getAccountInfo(claim, "confirmed")) {
      const saved = await this.read<{
        owner: PublicKey;
        marketAccount: PublicKey;
        winddown: PublicKey;
      }>("WinddownClaim", claim);
      if (
        !saved.owner.equals(owner) ||
        !saved.marketAccount.equals(account) ||
        !saved.winddown.equals(this.winddown)
      )
        throw new Error("Recovery claim does not match its account");
      return;
    }
    return this.program.methods
      .revealWinddown(
        integer(witness.collateral, 64),
        integer(witness.reserved, 64),
        integer(witness.position, 64, true),
        integer(witness.entryPrice, 64),
        integer(witness.fundingCheckpoint, 128, true),
        integer(witness.salt, 128),
      )
      .accountsPartial({
        payer: this.provider.wallet.publicKey,
        market: this.market,
        winddown: this.winddown,
        marketAccount: account,
        claim,
      })
      .rpc({ commitment: "confirmed" });
  }

  async revealFee(
    order: PublicKey,
    witness: FeeWitness,
  ): Promise<string | undefined> {
    await this.assertRevealing();
    const claim = this.pda("winddown-fee", order);
    if (await this.provider.connection.getAccountInfo(claim, "confirmed")) {
      const saved = await this.read<{ order: PublicKey; winddown: PublicKey }>(
        "WinddownFeeClaim",
        claim,
      );
      if (!saved.order.equals(order) || !saved.winddown.equals(this.winddown))
        throw new Error("Recovery fee claim does not match its order");
      return;
    }
    return this.program.methods
      .revealWinddownFee(
        integer(witness.protocolFee, 64),
        integer(witness.appFee, 64),
        integer(witness.salt, 128),
      )
      .accountsPartial({
        payer: this.provider.wallet.publicKey,
        market: this.market,
        winddown: this.winddown,
        order,
        feeRecovery: this.pda("fee-recovery", order),
        claim,
      })
      .rpc({ commitment: "confirmed" });
  }

  async finalize(): Promise<string> {
    await this.assertRevealing();
    const protocol = await this.read<{ vault: PublicKey }>(
      "Protocol",
      this.protocol,
    );
    return this.program.methods
      .finalizeWinddown()
      .accountsPartial({
        protocol: this.protocol,
        market: this.market,
        winddown: this.winddown,
        vault: protocol.vault,
      })
      .rpc({ commitment: "confirmed" });
  }
}
