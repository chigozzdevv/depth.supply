import { marketAddress, SOL_USD_MARKET_ID } from "@depth/bindings";
import type { PublicQuote } from "@depth/schema";
import { PublicKey } from "@solana/web3.js";
import type { ChainClient } from "@/shared/chain/chain.client";
import { integer, variant } from "@/shared/chain/chain.format";
import type { QuoteAccount } from "@/features/quote/quote.model";

export class QuoteService {
  constructor(private readonly chain: ChainClient) {}

  async get(address: PublicKey): Promise<PublicQuote | undefined> {
    const account = await this.chain.read<QuoteAccount>(address, "QuoteRecord");
    if (!account) return undefined;
    const { value, slot } = account;
    if (!value.market.equals(marketAddress(this.chain.programId))) {
      throw new Error("Quote belongs to another market");
    }
    return {
      id: address.toBase58(),
      maker: value.maker.toBase58(),
      operator: value.operator.toBase58(),
      market_id: SOL_USD_MARKET_ID,
      status: variant(value.status),
      capacity: integer(value.capacity),
      remaining_capacity: integer(value.remainingCapacity),
      tier_count: value.tierCount,
      expiry: integer(value.expiry),
      slot,
    };
  }
}
