import { Buffer } from "buffer";
import * as anchor from "@anchor-lang/core";
import {
  accountOffsets,
  depositAddress,
  marketAddress,
  transferAddress,
  withdrawalAddress,
} from "@depthhq/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  receiptTransaction,
  type ReceiptTransaction,
} from "@/chain/transaction";
import { settlementTransaction } from "@/chain/settlement";

export type PendingKind =
  "deposit" | "allocation" | "release" | "withdrawal" | "trade" | "risk";

export type PendingItem = {
  id: PublicKey;
  kind: PendingKind;
  status: string;
  nonce: bigint;
};

export type PendingPage = {
  items: PendingItem[];
  nextCursor?: string;
};

export type ReceiptDetail = ReceiptTransaction & { amount?: bigint };

export type UnpairedAllocation = {
  id: PublicKey;
  nonce: bigint;
  amount: bigint;
  status: string;
  orderId: PublicKey;
};

type AccountName =
  "depositReceipt" | "marginTransfer" | "withdrawalReceipt" | "orderRecord";

type AccountState = {
  owner?: PublicKey;
  trader?: PublicKey;
  market?: PublicKey;
  nonce: anchor.BN;
  status: Record<string, unknown>;
  kind?: Record<string, unknown>;
  toMarket?: boolean;
  amount?: anchor.BN;
};

function status(state: AccountState): string {
  return Object.keys(state.status)[0] ?? "unknown";
}

export class FundingDiscovery {
  constructor(
    private readonly program: anchor.Program,
    private readonly connection: Connection,
    private readonly owner: PublicKey,
  ) {}

  async transaction(item: PendingItem) {
    return this.detail(item);
  }

  async detail(item: PendingItem): Promise<ReceiptDetail> {
    const name: AccountName =
      item.kind === "deposit"
        ? "depositReceipt"
        : item.kind === "withdrawal"
          ? "withdrawalReceipt"
          : item.kind === "allocation" || item.kind === "release"
            ? "marginTransfer"
            : "orderRecord";
    const info = await this.connection.getAccountInfo(item.id, "confirmed");
    if (!info?.owner.equals(this.program.programId))
      throw new Error("Receipt is unavailable");
    const state = this.program.coder.accounts.decode<AccountState>(
      name,
      info.data,
    );
    const canonical = this.project(name, item.id, state, true);
    if (
      !canonical ||
      canonical.kind !== item.kind ||
      canonical.nonce !== item.nonce
    )
      throw new Error("Receipt does not match this wallet and operation");
    if (
      (canonical.kind === "trade" || canonical.kind === "risk") &&
      canonical.status === "filled"
    )
      return settlementTransaction(this.connection, this.program, item.id, {
        orderId: item.id,
      });
    const transaction = await receiptTransaction(
      this.connection,
      this.program,
      item.id,
    );
    return {
      ...transaction,
      ...(state.amount === undefined
        ? {}
        : { amount: BigInt(state.amount.toString()) }),
    };
  }

  async unpairedAllocations(
    options: {
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<{ items: UnpairedAllocation[]; nextCursor: string | null }> {
    const limit = options.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new RangeError("limit must be an integer from 1 to 100");
    const cursor = options.cursor
      ? new PublicKey(options.cursor).toBase58()
      : undefined;
    const accounts = await this.connection.getProgramAccounts(
      this.program.programId,
      {
        commitment: "confirmed",
        dataSlice: { offset: 0, length: 0 },
        filters: [
          { memcmp: this.program.coder.accounts.memcmp("marginTransfer") },
          {
            memcmp: {
              offset: accountOffsets.MarginTransfer.owner,
              bytes: this.owner.toBase58(),
            },
          },
        ],
      },
    );
    const keys = accounts
      .map(({ pubkey }) => pubkey)
      .filter((id) => !cursor || id.toBase58() > cursor)
      .sort((a, b) =>
        a.toBase58() < b.toBase58() ? -1 : a.toBase58() > b.toBase58() ? 1 : 0,
      );
    const items: UnpairedAllocation[] = [];
    let checked = 0;
    while (checked < keys.length && items.length < limit) {
      const chunk = keys.slice(checked, checked + 100);
      const infos = await this.connection.getMultipleAccountsInfo(
        chunk,
        "confirmed",
      );
      const candidates: UnpairedAllocation[] = [];
      infos.forEach((info, index) => {
        const id = chunk[index];
        if (!info?.owner.equals(this.program.programId))
          throw new Error("Allocation changed during discovery");
        const state = this.program.coder.accounts.decode<AccountState>(
          "marginTransfer",
          info.data,
        );
        const nonce = BigInt(state.nonce.toString());
        if (
          !state.owner?.equals(this.owner) ||
          !state.market?.equals(marketAddress(this.program.programId)) ||
          !id.equals(transferAddress(this.owner, nonce, this.program.programId))
        )
          throw new Error("Allocation identity changed during discovery");
        const current = status(state);
        if (!state.toMarket || current !== "settled") return;
        const orderId = PublicKey.findProgramAddressSync(
          [
            Buffer.from("order"),
            state.market.toBuffer(),
            this.owner.toBuffer(),
            state.nonce.toArrayLike(Buffer, "le", 8),
          ],
          this.program.programId,
        )[0];
        if (!state.amount) throw new Error("Allocation amount is unavailable");
        candidates.push({
          id,
          nonce,
          amount: BigInt(state.amount.toString()),
          status: current,
          orderId,
        });
      });
      const orders = candidates.length
        ? await this.connection.getMultipleAccountsInfo(
            candidates.map((item) => item.orderId),
            "confirmed",
          )
        : [];
      const available = candidates.filter((item, index) => {
        const order = orders[index];
        if (order && !order.owner.equals(this.program.programId))
          throw new Error("Order identity changed during discovery");
        return !order;
      });
      const remaining = limit - items.length;
      items.push(...available.slice(0, remaining));
      if (available.length > remaining) {
        const last = available[remaining - 1];
        checked += chunk.findIndex((id) => id.equals(last.id)) + 1;
        break;
      }
      checked += chunk.length;
    }
    return {
      items: items.slice(0, limit),
      nextCursor: checked < keys.length ? keys[checked - 1].toBase58() : null,
    };
  }

  async pending(
    options: {
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<PendingPage> {
    return this.list(options, false);
  }

  async history(
    options: { cursor?: string; limit?: number } = {},
  ): Promise<PendingPage> {
    return this.list(options, true);
  }

  private async list(
    options: { cursor?: string; limit?: number },
    includeFinal: boolean,
  ): Promise<PendingPage> {
    const limit = options.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new RangeError("limit must be an integer from 1 to 100");
    const cursor = options.cursor
      ? new PublicKey(options.cursor).toBase58()
      : undefined;
    const types: Array<{ name: AccountName; ownerOffset: number }> = [
      {
        name: "depositReceipt",
        ownerOffset: accountOffsets.DepositReceipt.owner,
      },
      {
        name: "marginTransfer",
        ownerOffset: accountOffsets.MarginTransfer.owner,
      },
      {
        name: "withdrawalReceipt",
        ownerOffset: accountOffsets.WithdrawalReceipt.owner,
      },
      {
        name: "orderRecord",
        ownerOffset: accountOffsets.OrderRecord.trader,
      },
    ];
    const scans = await Promise.all(
      types.map(async (type) => ({
        name: type.name,
        accounts: await this.connection.getProgramAccounts(
          this.program.programId,
          {
            commitment: "confirmed",
            dataSlice: { offset: 0, length: 0 },
            filters: [
              { memcmp: this.program.coder.accounts.memcmp(type.name) },
              {
                memcmp: {
                  offset: type.ownerOffset,
                  bytes: this.owner.toBase58(),
                },
              },
            ],
          },
        ),
      })),
    );
    const keys = scans
      .flatMap(({ name, accounts }) =>
        accounts.map(({ pubkey }) => ({ name, id: pubkey })),
      )
      .filter(({ id }) => !cursor || id.toBase58() > cursor)
      .sort((a, b) =>
        a.id.toBase58() < b.id.toBase58()
          ? -1
          : a.id.toBase58() > b.id.toBase58()
            ? 1
            : 0,
      );
    const items: PendingItem[] = [];
    let checked = 0;
    while (checked < keys.length && items.length < limit) {
      const chunk = keys.slice(checked, checked + 100);
      const accounts = await this.connection.getMultipleAccountsInfo(
        chunk.map(({ id }) => id),
        "confirmed",
      );
      for (let index = 0; index < chunk.length; index += 1) {
        const entry = chunk[index];
        const account = accounts[index];
        checked += 1;
        if (!account || !account.owner.equals(this.program.programId))
          throw new Error("Pending account changed during discovery");
        const state = this.program.coder.accounts.decode<AccountState>(
          entry.name,
          account.data,
        );
        const item = this.project(entry.name, entry.id, state, includeFinal);
        if (item) items.push(item);
        if (items.length === limit) break;
      }
    }
    return {
      items,
      ...(checked < keys.length
        ? { nextCursor: keys[checked - 1].id.toBase58() }
        : {}),
    };
  }

  private project(
    name: AccountName,
    id: PublicKey,
    state: AccountState,
    includeFinal = false,
  ): PendingItem | undefined {
    const nonce = BigInt(state.nonce.toString());
    const current = status(state);
    let canonical: PublicKey;
    let kind: PendingKind;
    if (name === "depositReceipt") {
      if (!state.owner?.equals(this.owner))
        throw new Error("Deposit owner changed during discovery");
      canonical = depositAddress(this.owner, nonce, this.program.programId);
      kind = "deposit";
      if (!includeFinal && current !== "pending" && current !== "crediting")
        return undefined;
    } else if (name === "marginTransfer") {
      if (
        !state.owner?.equals(this.owner) ||
        !state.market?.equals(marketAddress(this.program.programId))
      )
        throw new Error("Margin transfer changed during discovery");
      canonical = transferAddress(this.owner, nonce, this.program.programId);
      kind = state.toMarket ? "allocation" : "release";
      if (
        !includeFinal &&
        !["debiting", "escrow", "crediting"].includes(current)
      )
        return undefined;
    } else if (name === "withdrawalReceipt") {
      if (!state.owner?.equals(this.owner))
        throw new Error("Withdrawal owner changed during discovery");
      canonical = withdrawalAddress(this.owner, nonce, this.program.programId);
      kind = "withdrawal";
      if (!includeFinal && current !== "queued") return undefined;
    } else {
      if (
        !state.trader?.equals(this.owner) ||
        !state.market?.equals(marketAddress(this.program.programId))
      )
        throw new Error("Order changed during discovery");
      const bytes = Buffer.alloc(8);
      bytes.writeBigUInt64LE(nonce);
      canonical = PublicKey.findProgramAddressSync(
        [
          Buffer.from("order"),
          state.market.toBuffer(),
          this.owner.toBuffer(),
          bytes,
        ],
        this.program.programId,
      )[0];
      kind =
        Object.keys(state.kind ?? {})[0] === "liquidation" ? "risk" : "trade";
      if (["filled", "rejected", "cancelled"].includes(current)) {
        if (!includeFinal) return undefined;
      } else if (
        ![
          "matching",
          "matched",
          "settling",
          "riskApproved",
          "sealingTrader",
          "traderSealed",
          "sealingMaker",
          "makerSealed",
          "sealingClearing",
        ].includes(current)
      )
        throw new Error("Unknown pending order status");
    }
    if (!id.equals(canonical))
      throw new Error("Pending account address is not canonical");
    return { id, kind, status: current, nonce };
  }
}
