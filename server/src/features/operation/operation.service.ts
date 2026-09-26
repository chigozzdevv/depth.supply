import { marketAddress, SOL_USD_MARKET_ID } from "@depth/bindings";
import type { OperationSnapshot } from "@depth/schema";
import { PublicKey } from "@solana/web3.js";
import type { ChainClient } from "@/shared/chain/chain.client";
import { variant } from "@/shared/chain/chain.format";
import {
  operationAccounts,
  type DepositAccount,
  type MarginAccount,
  type OrderAccount,
  type QuoteAccount,
} from "@/features/operation/operation.model";

export class OperationService {
  constructor(private readonly chain: ChainClient) {}

  async get(address: PublicKey): Promise<OperationSnapshot | undefined> {
    const account = await this.chain.identify(address, operationAccounts);
    if (!account) return undefined;
    const base = { id: address.toBase58(), slot: account.slot };
    if (account.name === "OrderRecord") {
      const order = account.value as OrderAccount;
      this.checkMarket(order.market);
      const status = variant(order.status);
      return {
        ...base,
        kind: variant(order.kind) === "liquidation" ? "risk" : "trade",
        owner: order.trader.toBase58(),
        market_id: SOL_USD_MARKET_ID,
        status:
          status === "filled" || status === "cancelled"
            ? "finalized"
            : status === "rejected"
              ? "rejected"
              : "queued",
        ...(status === "filled" ? { outcome: "filled" as const } : {}),
        ...(status === "cancelled" ? { outcome: "cancelled" as const } : {}),
      };
    }
    if (account.name === "DepositReceipt") {
      const receipt = account.value as DepositAccount;
      const status = variant(receipt.status);
      return {
        ...base,
        kind: "deposit",
        owner: receipt.owner.toBase58(),
        status:
          status === "credited" || status === "refunded"
            ? "finalized"
            : "queued",
        ...(status === "refunded" ? { outcome: "cancelled" as const } : {}),
      };
    }
    if (account.name === "QuoteRecord") {
      const quote = account.value as QuoteAccount;
      this.checkMarket(quote.market);
      const status = variant(quote.status);
      return {
        ...base,
        kind: "quote",
        owner: quote.maker.toBase58(),
        market_id: SOL_USD_MARKET_ID,
        status: ["active", "filled", "cancelled"].includes(status)
          ? "finalized"
          : status === "rejected"
            ? "rejected"
            : "queued",
        ...(status === "active" ? { outcome: "active" as const } : {}),
        ...(status === "cancelled" ? { outcome: "cancelled" as const } : {}),
      };
    }
    const transfer = account.value as MarginAccount;
    this.checkMarket(transfer.market);
    const status = variant(transfer.status);
    return {
      ...base,
      kind: "margin",
      owner: transfer.owner.toBase58(),
      market_id: SOL_USD_MARKET_ID,
      status:
        status === "settled" || status === "refunded"
          ? "finalized"
          : status === "rejected"
            ? "rejected"
            : "queued",
      ...(status === "refunded" ? { outcome: "cancelled" as const } : {}),
    };
  }

  private checkMarket(value: PublicKey): void {
    if (!value.equals(marketAddress(this.chain.programId))) {
      throw new Error("Operation belongs to another market");
    }
  }
}
