import * as anchor from "@anchor-lang/core";
import {
  balanceAddress,
  depositAddress,
  marketAccountAddress,
  marketAddress,
  protocolAddress,
  recoveryConfigAddress,
  transferAddress,
} from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import { u64 } from "@/trade/input";

type Queue = (
  name: string,
  offset: anchor.BN,
) => Promise<Record<string, PublicKey>>;
type Variant = Record<string, unknown>;
type NumberValue = { toString(): string };

type Receipt = { owner: PublicKey; status: Variant; amount: NumberValue };
type Transfer = {
  owner: PublicKey;
  market: PublicKey;
  status: Variant;
  toMarket: boolean;
  amount: NumberValue;
};
type Balance = {
  owner: PublicKey;
  status: Variant;
  version: NumberValue;
  pendingAmount: NumberValue;
  pendingDestination: PublicKey;
};
type MarketAccount = { owner: PublicKey; market: PublicKey; status: Variant };
type Protocol = { settlementMint: PublicKey; vault: PublicKey };
type Recovery = { market: PublicKey; recoveryKey: number[] };

function nonce(): bigint {
  return randomBytes(8).readBigUInt64LE();
}

function offset(): anchor.BN {
  return new anchor.BN(randomBytes(8), "le");
}

function status(value: Variant): string {
  return Object.keys(value)[0] ?? "unknown";
}

export class FundingClient {
  readonly market: PublicKey;
  readonly protocol: PublicKey;
  readonly balance: PublicKey;
  readonly marketAccount: PublicKey;

  constructor(
    readonly program: anchor.Program,
    readonly connection: Connection,
    readonly owner: PublicKey,
    private readonly queue: Queue,
  ) {
    this.market = marketAddress(program.programId);
    this.protocol = protocolAddress(program.programId);
    this.balance = balanceAddress(owner, program.programId);
    this.marketAccount = marketAccountAddress(owner, program.programId);
  }

  private assertOwner(): void {
    const wallet = (this.program.provider as anchor.AnchorProvider).wallet;
    if (!wallet.publicKey.equals(this.owner)) {
      throw new Error("Only the account owner can move collateral");
    }
  }

  async read<T>(name: string, address: PublicKey): Promise<T | undefined> {
    const info = await this.connection.getAccountInfo(address, "confirmed");
    if (!info) return undefined;
    if (!info.owner.equals(this.program.programId)) {
      throw new Error(`${name} is not owned by Depth`);
    }
    return this.program.coder.accounts.decode<T>(name, info.data);
  }

  private async recoveryKey(): Promise<number[]> {
    const config = await this.read<Recovery>(
      "RecoveryConfig",
      recoveryConfigAddress(this.program.programId),
    );
    if (
      !config ||
      !config.market.equals(this.market) ||
      config.recoveryKey.length !== 32
    ) {
      throw new Error("Market recovery configuration is unavailable");
    }
    return config.recoveryKey;
  }

  async openBalance(): Promise<{ address: PublicKey; signature: string }> {
    this.assertOwner();
    if (await this.read<Balance>("BalanceAccount", this.balance)) {
      throw new Error("Balance account already exists");
    }
    const computationOffset = offset();
    const signature = await this.program.methods
      .openBalance(computationOffset, await this.recoveryKey())
      .accountsPartial({
        ...(await this.queue("open_balance", computationOffset)),
        payer: this.owner,
        protocol: this.protocol,
        balance: this.balance,
      })
      .rpc({ commitment: "confirmed" });
    return { address: this.balance, signature };
  }

  async openMarket(): Promise<{ address: PublicKey; signature: string }> {
    this.assertOwner();
    if (await this.read<MarketAccount>("MarketAccount", this.marketAccount)) {
      throw new Error("Market account already exists");
    }
    const computationOffset = offset();
    const signature = await this.program.methods
      .openMarketAccount(computationOffset, await this.recoveryKey())
      .accountsPartial({
        ...(await this.queue("open_market", computationOffset)),
        payer: this.owner,
        protocol: this.protocol,
        market: this.market,
        recoveryConfig: recoveryConfigAddress(this.program.programId),
        marketAccount: this.marketAccount,
      })
      .rpc({ commitment: "confirmed" });
    return { address: this.marketAccount, signature };
  }

  async deposit(source: PublicKey, amount: bigint): Promise<DepositHandle> {
    this.assertOwner();
    u64(amount, "amount");
    if (amount === 0n) throw new RangeError("Deposit amount must be positive");
    const depositNonce = nonce();
    const receipt = depositAddress(
      this.owner,
      depositNonce,
      this.program.programId,
    );
    const protocol = await this.read<Protocol>("Protocol", this.protocol);
    if (!protocol) throw new Error("Protocol is unavailable");
    const signature = await this.program.methods
      .deposit(u64(depositNonce, "nonce"), u64(amount, "amount"))
      .accountsPartial({
        owner: this.owner,
        protocol: this.protocol,
        settlementMint: protocol.settlementMint,
        source,
        vault: protocol.vault,
        receipt,
      })
      .rpc({ commitment: "confirmed" });
    return new DepositHandle(this, depositNonce, signature);
  }

  depositHandle(depositNonce: bigint): DepositHandle {
    u64(depositNonce, "nonce");
    return new DepositHandle(this, depositNonce);
  }

  async withdraw(
    destination: PublicKey,
    amount: bigint,
  ): Promise<WithdrawalHandle> {
    this.assertOwner();
    u64(amount, "amount");
    if (amount === 0n)
      throw new RangeError("Withdrawal amount must be positive");
    const before = await this.read<Balance>("BalanceAccount", this.balance);
    if (
      !before ||
      !before.owner.equals(this.owner) ||
      status(before.status) !== "ready"
    ) {
      throw new Error("Balance is unavailable or busy");
    }
    const computationOffset = offset();
    const signature = await this.program.methods
      .requestWithdrawal(computationOffset, u64(amount, "amount"))
      .accountsPartial({
        ...(await this.queue("debit_balance", computationOffset)),
        payer: this.owner,
        protocol: this.protocol,
        destination,
        balance: this.balance,
      })
      .rpc({ commitment: "confirmed" });
    return new WithdrawalHandle(
      this,
      BigInt(before.version.toString()),
      amount,
      destination,
      signature,
    );
  }

  async cancelWithdrawal(): Promise<string> {
    this.assertOwner();
    return this.program.methods
      .cancelWithdrawal()
      .accountsPartial({ owner: this.owner, balance: this.balance })
      .rpc({ commitment: "confirmed" });
  }

  async allocate(amount: bigint): Promise<TransferHandle> {
    return this.beginTransfer("allocation", amount);
  }

  async release(amount: bigint): Promise<TransferHandle> {
    return this.beginTransfer("release", amount);
  }

  transferHandle(transferNonce: bigint): TransferHandle {
    u64(transferNonce, "nonce");
    return new TransferHandle(this, transferNonce);
  }

  private async beginTransfer(
    kind: "allocation" | "release",
    amount: bigint,
  ): Promise<TransferHandle> {
    this.assertOwner();
    u64(amount, "amount");
    if (amount === 0n) throw new RangeError("Margin amount must be positive");
    const transferNonce = nonce();
    const transfer = transferAddress(
      this.owner,
      transferNonce,
      this.program.programId,
    );
    const computationOffset = offset();
    const queue = await this.queue(
      kind === "allocation" ? "debit_free" : "debit_market",
      computationOffset,
    );
    const accounts = {
      ...queue,
      payer: this.owner,
      protocol: this.protocol,
      market: this.market,
      ...(kind === "allocation"
        ? { balance: this.balance }
        : { marketAccount: this.marketAccount }),
      transfer,
    };
    const method =
      kind === "allocation"
        ? this.program.methods.beginAllocation
        : this.program.methods.beginRelease;
    const signature = await method(
      computationOffset,
      u64(transferNonce, "nonce"),
      u64(amount, "amount"),
    )
      .accountsPartial(accounts)
      .rpc({ commitment: "confirmed" });
    return new TransferHandle(this, transferNonce, signature);
  }

  async settleTransfer(id: PublicKey, toMarket: boolean): Promise<string> {
    this.assertOwner();
    const computationOffset = offset();
    const name = toMarket ? "credit_market" : "credit_free";
    const method = toMarket
      ? this.program.methods.settleAllocation
      : this.program.methods.settleRelease;
    return method(computationOffset)
      .accountsPartial({
        ...(await this.queue(name, computationOffset)),
        payer: this.owner,
        protocol: this.protocol,
        market: this.market,
        transfer: id,
        ...(toMarket
          ? { marketAccount: this.marketAccount }
          : { balance: this.balance }),
      })
      .rpc({ commitment: "confirmed" });
  }

  async refundTransfer(id: PublicKey, destination: PublicKey): Promise<string> {
    this.assertOwner();
    const protocol = await this.read<Protocol>("Protocol", this.protocol);
    if (!protocol) throw new Error("Protocol is unavailable");
    return this.program.methods
      .refundEscrow()
      .accountsPartial({
        owner: this.owner,
        protocol: this.protocol,
        settlementMint: protocol.settlementMint,
        vault: protocol.vault,
        destination,
        transfer: id,
      })
      .rpc({ commitment: "confirmed" });
  }

  async creditDeposit(id: PublicKey): Promise<string> {
    this.assertOwner();
    const balance = await this.read<Balance>("BalanceAccount", this.balance);
    if (
      !balance ||
      !balance.owner.equals(this.owner) ||
      status(balance.status) !== "ready"
    ) {
      throw new Error("Balance is unavailable or busy");
    }
    const computationOffset = offset();
    return this.program.methods
      .creditDeposit(computationOffset)
      .accountsPartial({
        ...(await this.queue("credit_balance", computationOffset)),
        payer: this.owner,
        protocol: this.protocol,
        balance: this.balance,
        receipt: id,
      })
      .rpc({ commitment: "confirmed" });
  }

  async refundDeposit(id: PublicKey, destination: PublicKey): Promise<string> {
    this.assertOwner();
    const protocol = await this.read<Protocol>("Protocol", this.protocol);
    if (!protocol) throw new Error("Protocol is unavailable");
    return this.program.methods
      .refundDeposit()
      .accountsPartial({
        owner: this.owner,
        protocol: this.protocol,
        settlementMint: protocol.settlementMint,
        vault: protocol.vault,
        destination,
        receipt: id,
      })
      .rpc({ commitment: "confirmed" });
  }
}

export class DepositHandle {
  readonly id: PublicKey;

  constructor(
    readonly client: FundingClient,
    readonly nonce: bigint,
    readonly signature?: string,
  ) {
    this.id = depositAddress(client.owner, nonce, client.program.programId);
  }

  async status(): Promise<"pending" | "crediting" | "credited" | "refunded"> {
    const receipt = await this.client.read<Receipt>("DepositReceipt", this.id);
    if (!receipt || !receipt.owner.equals(this.client.owner)) {
      throw new Error("Deposit receipt is unavailable");
    }
    const current = status(receipt.status);
    if (!["pending", "crediting", "credited", "refunded"].includes(current)) {
      throw new Error("Unknown deposit status");
    }
    return current as "pending" | "crediting" | "credited" | "refunded";
  }

  async credit(): Promise<string> {
    if ((await this.status()) !== "pending") {
      throw new Error("Deposit is not pending credit");
    }
    return this.client.creditDeposit(this.id);
  }

  async refund(destination: PublicKey): Promise<string> {
    if ((await this.status()) !== "pending") {
      throw new Error("Deposit is not refundable");
    }
    return this.client.refundDeposit(this.id, destination);
  }
}

export class TransferHandle {
  readonly id: PublicKey;

  constructor(
    readonly client: FundingClient,
    readonly nonce: bigint,
    readonly signature?: string,
  ) {
    this.id = transferAddress(client.owner, nonce, client.program.programId);
  }

  async status(): Promise<{
    state: string;
    toMarket: boolean;
    amount: bigint;
  }> {
    const transfer = await this.client.read<Transfer>(
      "MarginTransfer",
      this.id,
    );
    if (
      !transfer ||
      !transfer.owner.equals(this.client.owner) ||
      !transfer.market.equals(this.client.market)
    ) {
      throw new Error("Margin transfer is unavailable");
    }
    return {
      state: status(transfer.status),
      toMarket: transfer.toMarket,
      amount: BigInt(transfer.amount.toString()),
    };
  }

  async settle(): Promise<string> {
    const transfer = await this.status();
    if (transfer.state !== "escrow") {
      throw new Error("Margin transfer is not ready to settle");
    }
    return this.client.settleTransfer(this.id, transfer.toMarket);
  }

  async refund(destination: PublicKey): Promise<string> {
    const transfer = await this.status();
    if (transfer.state !== "escrow") {
      throw new Error("Margin transfer is not refundable");
    }
    return this.client.refundTransfer(this.id, destination);
  }
}

export class WithdrawalHandle {
  constructor(
    readonly client: FundingClient,
    readonly previousVersion: bigint,
    readonly amount: bigint,
    readonly destination: PublicKey,
    readonly signature: string,
  ) {}

  async status(): Promise<"queued" | "balance_advanced" | "rejected"> {
    const balance = await this.client.read<Balance>(
      "BalanceAccount",
      this.client.balance,
    );
    if (!balance || !balance.owner.equals(this.client.owner)) {
      throw new Error("Balance is unavailable");
    }
    if (BigInt(balance.version.toString()) > this.previousVersion)
      return "balance_advanced";
    if (status(balance.status) === "withdrawing") {
      if (
        BigInt(balance.pendingAmount.toString()) !== this.amount ||
        !balance.pendingDestination.equals(this.destination)
      ) {
        throw new Error("Balance is processing another withdrawal");
      }
      return "queued";
    }
    return "rejected";
  }

  async cancel(): Promise<string> {
    if ((await this.status()) !== "queued") {
      throw new Error("Withdrawal is not queued");
    }
    return this.client.cancelWithdrawal();
  }
}
