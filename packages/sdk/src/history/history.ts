import * as anchor from "@anchor-lang/core";
import { Buffer } from "buffer";
import {
  accountOffsets,
  marketAddress,
  transferAddress,
} from "@depthhq/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import type { DepthView, FillSnapshot } from "@/view/view";
import {
  settlementTransaction,
  type SettlementTransaction,
} from "@/chain/settlement";
import {
  receiptTransaction,
  type ReceiptTransaction,
} from "@/chain/transaction";
import { replayFill, replayMargin, type ReplayState } from "@/history/replay";
import type { PositionPnl } from "@/position/pnl";

type Order = {
  trader: PublicKey;
  maker: PublicKey;
  market: PublicKey;
  nonce: anchor.BN;
  traderVersion?: anchor.BN;
  makerVersion?: anchor.BN;
  fundingIndex: anchor.BN;
  status: Record<string, unknown>;
  kind: Record<string, unknown>;
};
type Transfer = {
  owner: PublicKey;
  market: PublicKey;
  nonce: anchor.BN;
  amount: anchor.BN;
  toMarket: boolean;
  status: Record<string, unknown>;
};
type Event = { id: PublicKey; transaction: ReceiptTransaction } & (
  { order: Order } | { transfer: Transfer }
);
export type ExecutionDetail = {
  id: PublicKey;
  fill: FillSnapshot;
  pnl?: PositionPnl;
  transaction: SettlementTransaction;
};

export class ExecutionHistory {
  private readonly views = new Map<string, Promise<DepthView>>();
  private readonly fills = new Map<string, FillSnapshot>();
  private readonly transactions = new Map<string, ReceiptTransaction>();

  constructor(
    private readonly program: anchor.Program,
    private readonly connection: Connection,
    private readonly owner: PublicKey,
    private readonly requestView: (id: PublicKey) => Promise<DepthView>,
  ) {}

  private orderAddress(trader: PublicKey, nonce: anchor.BN) {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        marketAddress(this.program.programId).toBuffer(),
        trader.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      this.program.programId,
    )[0];
  }

  async fill(id: PublicKey): Promise<FillSnapshot> {
    const key = id.toBase58();
    if (this.fills.has(key) && !this.views.has(key))
      return this.fills.get(key)!;
    if (!this.views.has(key)) this.views.set(key, this.requestView(id));
    let view: DepthView;
    try {
      view = await this.views.get(key)!;
    } catch (error) {
      this.views.delete(key);
      throw error;
    }
    const result =
      this.fills.get(key) ??
      ((await view.wait({ timeoutMs: 180_000 })) as FillSnapshot);
    if (result.status === "stale") {
      await view.close();
      this.views.delete(key);
      throw new Error(
        "Historical private execution changed; retry with the same wallet",
      );
    }
    if (result.status !== "ready")
      throw new Error(
        "Historical private execution is still pending; retry with the same wallet",
      );
    this.fills.set(key, result);
    try {
      await view.close();
    } catch (error) {
      if (await this.connection.getAccountInfo(view.id, "confirmed"))
        throw error;
    }
    this.views.delete(key);
    return result;
  }

  async execution(nonce: bigint): Promise<ExecutionDetail> {
    if (nonce < 0n || nonce > (1n << 64n) - 1n)
      throw new RangeError("Trade nonce is invalid");
    const target = this.orderAddress(
      this.owner,
      new anchor.BN(nonce.toString()),
    );
    const market = marketAddress(this.program.programId);
    const scans = await Promise.all([
      this.scan("orderRecord", accountOffsets.OrderRecord.trader),
      this.scan("orderRecord", accountOffsets.OrderRecord.maker),
      this.scan("marginTransfer", accountOffsets.MarginTransfer.owner),
    ]);
    const orders = new Map<string, { id: PublicKey; state: Order }>();
    for (const account of [...scans[0], ...scans[1]]) {
      const state = this.program.coder.accounts.decode<Order>(
        "orderRecord",
        account.account.data,
      );
      if (
        !state.market.equals(market) ||
        (!state.trader.equals(this.owner) && !state.maker.equals(this.owner)) ||
        !account.pubkey.equals(this.orderAddress(state.trader, state.nonce))
      )
        throw new Error("Historical order identity is invalid");
      if ("filled" in state.status)
        orders.set(account.pubkey.toBase58(), { id: account.pubkey, state });
    }
    const selected = orders.get(target.toBase58());
    if (
      !selected ||
      !("trade" in selected.state.kind) ||
      !selected.state.trader.equals(this.owner)
    )
      throw new Error(
        "Historical trade is not a filled execution by this wallet",
      );
    const targetTx = await this.settlement(target);
    const events: Event[] = [];
    for (const order of orders.values()) {
      const version = order.state.trader.equals(this.owner)
        ? order.state.traderVersion
        : order.state.makerVersion;
      if (
        version &&
        selected.state.traderVersion &&
        version.gt(selected.state.traderVersion)
      )
        continue;
      const transaction = order.id.equals(target)
        ? targetTx
        : await this.settlement(order.id);
      if (transaction.slot <= targetTx.slot)
        events.push({ id: order.id, order: order.state, transaction });
    }
    for (const account of scans[2]) {
      const state = this.program.coder.accounts.decode<Transfer>(
        "marginTransfer",
        account.account.data,
      );
      if (
        !state.owner.equals(this.owner) ||
        !state.market.equals(market) ||
        !account.pubkey.equals(
          transferAddress(
            this.owner,
            BigInt(state.nonce.toString()),
            this.program.programId,
          ),
        )
      )
        throw new Error("Historical margin identity is invalid");
      if (
        (!("settled" in state.status) &&
          (state.toMarket ||
            (!("escrow" in state.status) && !("crediting" in state.status)))) ||
        state.amount.isZero()
      )
        continue;
      const key = account.pubkey.toBase58();
      const transaction =
        this.transactions.get(key) ??
        (await receiptTransaction(
          this.connection,
          this.program,
          account.pubkey,
          state.toMarket
            ? ["creditMarketCallback"]
            : ["debitMarketV2Callback", "debitMarketCallback"],
        ));
      this.transactions.set(key, transaction);
      if (transaction.slot <= targetTx.slot)
        events.push({ id: account.pubkey, transfer: state, transaction });
    }
    const indexes = new Map<number, Map<string, number>>();
    const counts = new Map<number, number>();
    for (const event of events)
      counts.set(
        event.transaction.slot,
        (counts.get(event.transaction.slot) ?? 0) + 1,
      );
    for (const [slot, count] of counts)
      if (count > 1) {
        const block = await this.connection.getBlockSignatures(
          slot,
          "confirmed",
        );
        if (!block)
          throw new Error(
            "Block ordering is unavailable; use an archival RPC for execution history",
          );
        indexes.set(
          slot,
          new Map(
            block.signatures.map((signature, index) => [signature, index]),
          ),
        );
        if (
          events.some(
            (event) =>
              event.transaction.slot === slot &&
              !indexes.get(slot)!.has(event.transaction.signature),
          )
        )
          throw new Error(
            "Historical transaction is missing from its canonical block",
          );
      }
    events.sort(
      (a, b) =>
        a.transaction.slot - b.transaction.slot ||
        (indexes.get(a.transaction.slot)?.get(a.transaction.signature) ?? 0) -
          (indexes.get(b.transaction.slot)?.get(b.transaction.signature) ?? 0),
    );
    let state: ReplayState = {
      position: 0n,
      entryPriceE8: 0n,
      fundingCheckpoint: 0n,
      collateral: 0n,
    };
    for (const event of events) {
      if ("transfer" in event) {
        state = replayMargin(
          state,
          BigInt(event.transfer.amount.toString()),
          event.transfer.toMarket,
        );
        continue;
      }
      if ("liquidation" in event.order.kind) {
        if (!event.order.trader.equals(this.owner))
          throw new Error(
            "Historical backstop exposure requires an authorized historical position view",
          );
        state = {
          position: 0n,
          entryPriceE8: 0n,
          fundingCheckpoint: BigInt(event.order.fundingIndex.toString()),
        };
        continue;
      }
      const fill = await this.fill(event.id);
      const result = replayFill(
        state,
        fill,
        BigInt(event.order.fundingIndex.toString()),
        event.order.maker.equals(this.owner),
      );
      state = result.state;
      if (event.id.equals(target))
        return { id: target, fill, pnl: result.pnl, transaction: targetTx };
    }
    throw new Error("Historical execution could not be reconciled");
  }

  private async settlement(id: PublicKey): Promise<SettlementTransaction> {
    const key = id.toBase58();
    const cached = this.transactions.get(key);
    if (cached) return { ...cached, orderId: id };
    const result = await settlementTransaction(
      this.connection,
      this.program,
      id,
      { orderId: id },
    );
    this.transactions.set(key, result);
    return result;
  }

  private async scan(name: string, offset: number) {
    const accounts = await this.connection.getProgramAccounts(
      this.program.programId,
      {
        commitment: "confirmed",
        filters: [
          { memcmp: this.program.coder.accounts.memcmp(name) },
          { memcmp: { offset, bytes: this.owner.toBase58() } },
        ],
      },
    );
    if (
      accounts.some(
        (item) => !item.account.owner.equals(this.program.programId),
      )
    )
      throw new Error("History account owner is invalid");
    return accounts;
  }
}
