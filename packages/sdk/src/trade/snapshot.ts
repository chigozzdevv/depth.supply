import type * as anchor from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";
import { DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import type { MarketState } from "@/client/types";

export async function quoteSnapshot(
  connection: Connection,
  program: anchor.Program,
  address: PublicKey,
  initial: MarketState,
) {
  let market = initial;
  for (let attempt = 0; attempt < 4; attempt++) {
    const quotes = market.activeQuotes.slice(0, market.activeQuoteCount);
    const keys = [market.backstopOffer, ...quotes];
    const [account, ...records] = await connection.getMultipleAccountsInfo(
      [address, ...keys],
      "confirmed",
    );
    if (!account?.owner.equals(DEPTH_PROGRAM_ID))
      throw new Error("Market account is unavailable");
    const latest = program.coder.accounts.decode<MarketState>(
      "market",
      account.data,
    );
    if (
      !latest.backstopOffer.equals(market.backstopOffer) ||
      latest.activeQuoteCount !== quotes.length ||
      latest.activeQuotes
        .slice(0, latest.activeQuoteCount)
        .some((key, index) => !key.equals(quotes[index]))
    ) {
      market = latest;
      continue;
    }
    if (market.activeQuoteCount === 0)
      throw new Error("Waiting for maker liquidity");
    for (const [index, record] of records.entries()) {
      if (!record?.owner.equals(DEPTH_PROGRAM_ID))
        throw new Error(`Market quote snapshot missing account ${index}`);
      if (index === 0) continue;
      const quote = program.coder.accounts.decode<{
        status: Record<string, unknown>;
        expiry: anchor.BN;
        market: PublicKey;
      }>("quoteRecord", record.data);
      if (
        !("active" in quote.status) ||
        quote.expiry.toNumber() <= Math.floor(Date.now() / 1000) ||
        !quote.market.equals(address)
      )
        throw new Error("Waiting for maker liquidity");
    }
    return { market: latest, keys };
  }
  throw new Error("Market is processing another order");
}
