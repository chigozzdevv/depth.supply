import * as anchor from "@anchor-lang/core";
import {
  balanceAddress,
  depositAddress,
  marketAccountAddress,
  marketAddress,
  protocolAddress,
  recoveryConfigAddress,
  transferAddress,
  withdrawalAddress,
} from "@depthhq/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import { randomBytes } from "@/chain/random";
import { submissionError } from "@/operation/error";
import { DepthError } from "@/operation/error";
import { confirmReceipt } from "@/account/confirm";
import type { ConfirmOptions } from "@/account/confirm";
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
    readonly settlement: "keeper" | "wallet" = "wallet",
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
    return this.program.coder.accounts.decode<T>(
      name[0].toLowerCase() + name.slice(1),
      info.data,
    );
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

  async cancelOpenBalance(): Promise<string> {
    this.assertOwner();
    return this.program.methods
      .cancelOpenBalance()
      .accountsPartial({ owner: this.owner, balance: this.balance })
      .rpc({ commitment: "confirmed" });
  }

  async cancelOpenMarket(): Promise<string> {
    this.assertOwner();
    return this.program.methods
      .cancelOpenMarket()
      .accountsPartial({ owner: this.owner, marketAccount: this.marketAccount })
      .rpc({ commitment: "confirmed" });
  }

  async cancelDeposit(id: PublicKey): Promise<string> {
    this.assertOwner();
    return this.program.methods
      .cancelCredit()
      .accountsPartial({
        owner: this.owner,
        balance: this.balance,
        receipt: id,
      })
      .rpc({ commitment: "confirmed" });
  }

  async cancelTransfer(
    id: PublicKey,
    toMarket: boolean,
    phase: "debiting" | "crediting",
  ): Promise<string> {
    this.assertOwner();
    const free = phase === "debiting" ? toMarket : !toMarket;
    const method =
      phase === "debiting"
        ? free
          ? this.program.methods.cancelFreeDebit
          : this.program.methods.cancelMarketDebit
        : free
          ? this.program.methods.cancelFreeCredit
          : this.program.methods.cancelMarketCredit;
    return method()
      .accountsPartial({
        owner: this.owner,
        transfer: id,
        ...(free
          ? { balance: this.balance }
          : { marketAccount: this.marketAccount }),
      })
      .rpc({ commitment: "confirmed" });
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

  async deposit(
    source: PublicKey,
    amount: bigint,
    clientNonce: bigint,
  ): Promise<DepositHandle> {
    this.assertOwner();
    u64(amount, "amount");
    if (amount === 0n) throw new RangeError("Deposit amount must be positive");
    const depositNonce = clientNonce;
    u64(clientNonce, "clientNonce");
    const receipt = depositAddress(
      this.owner,
      depositNonce,
      this.program.programId,
    );
    const existing = await this.read<Receipt>("DepositReceipt", receipt);
    if (existing) {
      if (
        !existing.owner.equals(this.owner) ||
        BigInt(existing.amount.toString()) !== amount
      ) {
        throw new Error("Deposit nonce is already bound to another request");
      }
      return this.depositHandle(clientNonce);
    }
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
      .rpc({ commitment: "confirmed" })
      .catch((error) => submissionError(receipt.toBase58(), error));
    return new DepositHandle(this, depositNonce, signature);
  }

  depositHandle(depositNonce: bigint): DepositHandle {
    u64(depositNonce, "nonce");
    return new DepositHandle(this, depositNonce);
  }

  async withdraw(
    destination: PublicKey,
    amount: bigint,
    clientNonce: bigint,
  ): Promise<WithdrawalHandle> {
    this.assertOwner();
    u64(amount, "amount");
    u64(clientNonce, "clientNonce");
    if (amount === 0n)
      throw new RangeError("Withdrawal amount must be positive");
    const handle = this.withdrawalHandle(clientNonce);
    const existing = await this.read<Withdrawal>(
      "WithdrawalReceipt",
      handle.id,
    );
    if (existing) {
      if (
        !existing.owner.equals(this.owner) ||
        !existing.destination.equals(destination) ||
        BigInt(existing.amount.toString()) !== amount
      ) {
        throw new Error("Withdrawal nonce is already bound to another request");
      }
      return handle;
    }
    const computationOffset = offset();
    const signature = await this.program.methods
      .requestWithdrawal(
        computationOffset,
        u64(clientNonce, "clientNonce"),
        u64(amount, "amount"),
      )
      .accountsPartial({
        ...(await this.queue("debit_balance", computationOffset)),
        payer: this.owner,
        protocol: this.protocol,
        destination,
        balance: this.balance,
        receipt: handle.id,
      })
      .rpc({ commitment: "confirmed" })
      .catch((error) => submissionError(handle.id.toBase58(), error));
    return new WithdrawalHandle(this, clientNonce, signature);
  }

  withdrawalHandle(clientNonce: bigint): WithdrawalHandle {
    u64(clientNonce, "clientNonce");
    return new WithdrawalHandle(this, clientNonce);
  }

  async cancelWithdrawal(receipt: PublicKey): Promise<string> {
    this.assertOwner();
    return this.program.methods
      .cancelWithdrawal()
      .accountsPartial({ owner: this.owner, balance: this.balance, receipt })
      .rpc({ commitment: "confirmed" });
  }

  async allocate(amount: bigint, clientNonce: bigint): Promise<TransferHandle> {
    return this.beginTransfer("allocation", amount, clientNonce);
  }

  async release(amount: bigint, clientNonce: bigint): Promise<TransferHandle> {
    return this.beginTransfer("release", amount, clientNonce);
  }

  transferHandle(transferNonce: bigint): TransferHandle {
    u64(transferNonce, "nonce");
    return new TransferHandle(this, transferNonce);
  }

  private async beginTransfer(
    kind: "allocation" | "release",
    amount: bigint,
    clientNonce: bigint,
  ): Promise<TransferHandle> {
    this.assertOwner();
    u64(amount, "amount");
    if (amount === 0n) throw new RangeError("Margin amount must be positive");
    const transferNonce = clientNonce;
    u64(clientNonce, "clientNonce");
    const transfer = transferAddress(
      this.owner,
      transferNonce,
      this.program.programId,
    );
    const existing = await this.read<Transfer>("MarginTransfer", transfer);
    if (existing) {
      if (
        !existing.owner.equals(this.owner) ||
        !existing.market.equals(this.market) ||
        existing.toMarket !== (kind === "allocation") ||
        BigInt(existing.amount.toString()) !== amount
      ) {
        throw new Error("Transfer nonce is already bound to another request");
      }
      return this.transferHandle(clientNonce);
    }
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
      .rpc({ commitment: "confirmed" })
      .catch((error) => submissionError(transfer.toBase58(), error));
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

  async confirm(options?: ConfirmOptions): Promise<"credited"> {
    await confirmReceipt(
      this.id.toBase58(),
      () => this.status(),
      async (state) => {
        if (state === "credited") return true;
        if (state === "refunded")
          throw new DepthError(
            "DEPOSIT_REFUNDED",
            "confirmation",
            "Deposit was refunded",
            false,
            "Read the receipt before funding again",
            this.id.toBase58(),
          );
        if (state === "pending") {
          try {
            await this.credit();
          } catch (error) {
            if ((await this.status()) === "pending") throw error;
          }
        }
        return false;
      },
      options,
    );
    return "credited";
  }

  async credit(): Promise<string> {
    if ((await this.status()) !== "pending") {
      throw new Error("Deposit is not pending credit");
    }
    return this.client.creditDeposit(this.id);
  }

  async cancel(): Promise<string> {
    if ((await this.status()) !== "crediting")
      throw new Error("Deposit credit is not pending");
    return this.client.cancelDeposit(this.id);
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

  async confirm(
    options?: ConfirmOptions,
  ): Promise<{ state: "settled"; toMarket: boolean; amount: bigint }> {
    const settled = await confirmReceipt(
      this.id.toBase58(),
      () => this.status(),
      async (transfer) => {
        if (transfer.state === "settled") return true;
        if (
          transfer.state === "rejected" ||
          transfer.state === "refunded" ||
          transfer.state === "cancelled"
        )
          throw new DepthError(
            "MARGIN_REJECTED",
            "confirmation",
            `Margin transfer ${transfer.state}`,
            false,
            "Read the receipt and private account before retrying",
            this.id.toBase58(),
          );
        if (
          transfer.state === "escrow" &&
          this.client.settlement === "wallet"
        ) {
          try {
            await this.settle();
          } catch (error) {
            if ((await this.status()).state === "escrow") throw error;
          }
        }
        return false;
      },
      options,
    );
    return { ...settled, state: "settled" };
  }

  async settle(): Promise<string> {
    const transfer = await this.status();
    if (transfer.state !== "escrow") {
      throw new Error("Margin transfer is not ready to settle");
    }
    return this.client.settleTransfer(this.id, transfer.toMarket);
  }

  async cancel(): Promise<string> {
    const transfer = await this.status();
    if (transfer.state !== "debiting" && transfer.state !== "crediting")
      throw new Error("Transfer computation is not pending");
    return this.client.cancelTransfer(
      this.id,
      transfer.toMarket,
      transfer.state,
    );
  }

  async refund(destination: PublicKey): Promise<string> {
    const transfer = await this.status();
    if (transfer.state !== "escrow") {
      throw new Error("Margin transfer is not refundable");
    }
    return this.client.refundTransfer(this.id, destination);
  }
}

type Withdrawal = {
  owner: PublicKey;
  balance: PublicKey;
  destination: PublicKey;
  amount: NumberValue;
  status: Variant;
};

export class WithdrawalHandle {
  readonly id: PublicKey;

  constructor(
    readonly client: FundingClient,
    readonly nonce: bigint,
    readonly signature?: string,
  ) {
    this.id = withdrawalAddress(client.owner, nonce, client.program.programId);
  }

  async status(): Promise<"queued" | "paid" | "rejected" | "cancelled"> {
    const receipt = await this.client.read<Withdrawal>(
      "WithdrawalReceipt",
      this.id,
    );
    if (
      !receipt ||
      !receipt.owner.equals(this.client.owner) ||
      !receipt.balance.equals(this.client.balance)
    ) {
      throw new Error("Withdrawal receipt is unavailable");
    }
    const state = status(receipt.status);
    if (!["queued", "paid", "rejected", "cancelled"].includes(state)) {
      throw new Error("Unknown withdrawal status");
    }
    return state as "queued" | "paid" | "rejected" | "cancelled";
  }

  async confirm(options?: ConfirmOptions): Promise<"paid"> {
    await confirmReceipt(
      this.id.toBase58(),
      () => this.status(),
      async (state) => {
        if (state === "paid") return true;
        if (state === "rejected" || state === "cancelled")
          throw new DepthError(
            "WITHDRAWAL_REJECTED",
            "confirmation",
            `Withdrawal ${state}`,
            false,
            "Read the receipt and private balance before retrying",
            this.id.toBase58(),
          );
        return false;
      },
      options,
    );
    return "paid";
  }

  async cancel(): Promise<string> {
    if ((await this.status()) !== "queued")
      throw new Error("Withdrawal is not queued");
    return this.client.cancelWithdrawal(this.id);
  }
}
