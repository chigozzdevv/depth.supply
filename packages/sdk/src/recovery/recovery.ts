import { Buffer } from "buffer";
import * as anchor from "@anchor-lang/core";
import {
  DEPTH_PROGRAM_ID,
  marketAddress,
  protocolAddress,
} from "@depthhq/bindings";
import { Connection, PublicKey } from "@solana/web3.js";

type WinddownState = {
  market: PublicKey;
  expectedAccounts: number;
  revealedAccounts: number;
  paidAccounts: number;
  payoutPool: anchor.BN;
  grossPositive: anchor.BN;
  finalized: boolean;
};

type ClaimState = {
  winddown: PublicKey;
  marketAccount: PublicKey;
  owner: PublicKey;
  positiveEquity: anchor.BN;
  paid: boolean;
};

type ProtocolState = { settlementMint: PublicKey; vault: PublicKey };

export type RecoverySnapshot = {
  status: "unavailable" | "revealing" | "claimable" | "claimed";
  winddown: PublicKey;
  claim: PublicKey;
  expectedAccounts?: number;
  revealedAccounts?: number;
  paidAccounts?: number;
  positiveEquity?: bigint;
  payout?: bigint;
  slot: number;
};

export class DepthRecovery {
  readonly market = marketAddress();
  readonly winddown = PublicKey.findProgramAddressSync(
    [Buffer.from("winddown"), this.market.toBuffer()],
    DEPTH_PROGRAM_ID,
  )[0];
  readonly marketAccount: PublicKey;
  readonly claim: PublicKey;

  constructor(
    private readonly program: anchor.Program,
    private readonly connection: Connection,
    private readonly owner: PublicKey,
  ) {
    this.marketAccount = PublicKey.findProgramAddressSync(
      [Buffer.from("market-account"), this.market.toBuffer(), owner.toBuffer()],
      DEPTH_PROGRAM_ID,
    )[0];
    this.claim = PublicKey.findProgramAddressSync(
      [Buffer.from("winddown-claim"), this.marketAccount.toBuffer()],
      DEPTH_PROGRAM_ID,
    )[0];
  }

  private async read<T>(address: PublicKey, name: string) {
    const result = await this.connection.getAccountInfoAndContext(
      address,
      "confirmed",
    );
    if (!result.value) return undefined;
    if (!result.value.owner.equals(DEPTH_PROGRAM_ID)) {
      throw new Error(`${name} is not owned by Depth`);
    }
    return {
      value: this.program.coder.accounts.decode<T>(
        name[0].toLowerCase() + name.slice(1),
        result.value.data,
      ),
      slot: result.context.slot,
    };
  }

  async status(): Promise<RecoverySnapshot> {
    const winddown = await this.read<WinddownState>(this.winddown, "Winddown");
    if (!winddown) {
      return {
        status: "unavailable",
        winddown: this.winddown,
        claim: this.claim,
        slot: 0,
      };
    }
    if (!winddown.value.market.equals(this.market)) {
      throw new Error("Winddown belongs to another market");
    }
    const base = {
      winddown: this.winddown,
      claim: this.claim,
      expectedAccounts: winddown.value.expectedAccounts,
      revealedAccounts: winddown.value.revealedAccounts,
      paidAccounts: winddown.value.paidAccounts,
      slot: winddown.slot,
    };
    const claim = await this.read<ClaimState>(this.claim, "WinddownClaim");
    if (!claim) {
      const account = await this.connection.getAccountInfo(
        this.marketAccount,
        "confirmed",
      );
      return { ...base, status: account ? "revealing" : "unavailable" };
    }
    if (
      !claim.value.winddown.equals(this.winddown) ||
      !claim.value.marketAccount.equals(this.marketAccount) ||
      !claim.value.owner.equals(this.owner)
    ) {
      throw new Error("Recovery claim does not match this account");
    }
    const positiveEquity = BigInt(claim.value.positiveEquity.toString());
    if (!winddown.value.finalized) {
      return { ...base, status: "revealing", positiveEquity };
    }
    const pool = BigInt(winddown.value.payoutPool.toString());
    const gross = BigInt(winddown.value.grossPositive.toString());
    const payout =
      gross <= pool ? positiveEquity : (positiveEquity * pool) / gross;
    return {
      ...base,
      status: claim.value.paid ? "claimed" : "claimable",
      positiveEquity,
      payout,
    };
  }

  async claimTo(destination: PublicKey): Promise<string> {
    const wallet = (this.program.provider as anchor.AnchorProvider).wallet;
    if (!wallet.publicKey.equals(this.owner)) {
      throw new Error("Only the market account owner can claim its payout");
    }
    if ((await this.status()).status !== "claimable") {
      throw new Error("The market payout is not claimable yet");
    }
    const protocol = await this.read<ProtocolState>(
      protocolAddress(),
      "Protocol",
    );
    if (!protocol) throw new Error("Protocol account is unavailable");
    return this.program.methods
      .claimWinddown()
      .accountsPartial({
        owner: this.owner,
        protocol: protocolAddress(),
        settlementMint: protocol.value.settlementMint,
        vault: protocol.value.vault,
        market: this.market,
        winddown: this.winddown,
        marketAccount: this.marketAccount,
        claim: this.claim,
        destination,
      })
      .rpc({ commitment: "confirmed" });
  }
}
