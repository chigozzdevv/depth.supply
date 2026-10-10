import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicKey } from "@solana/web3.js";
import type { AccountView } from "@/shared/depth/account";
import type { MarketView } from "@/shared/depth/market";

const owner = PublicKey.unique();
const { mock } = createRequire(import.meta.url)("bun:test") as {
  mock: { module: (name: string, factory: () => unknown) => void };
};
mock.module("@/shared/depth/session", () => ({
  useDepth: () => ({
    trader: { options: { wallet: { publicKey: owner } } },
    busy: "",
    config: { environment: "devnet" },
  }),
}));
const { Positions } = await import("@/components/trade/positions");
const position = {
  id: "sample",
  status: "ready" as const,
  slot: 1,
  version: 1n,
  position: 1_000_000_000n,
  entryPriceE8: 10_000_000_000n,
  collateral: 200_000_000n,
  reserved: 0n,
  fundingCheckpoint: 0n,
};
const account = { loaded: true, outdated: false, position } as AccountView;
const market = {
  market: { oracle_price_e8: "12000000000", funding_index: "0" },
  stale: false,
} as unknown as MarketView;

test("positions display PnL directly while sharing remains a separate action", () => {
  const html = renderToStaticMarkup(
    <Positions account={account} view={market} />,
  );
  assert.match(html, /\+20\.00 USDC/);
  assert.match(html, /aria-label="Share position PnL"/);
  assert.doesNotMatch(html, />PnL card</);
  assert.doesNotMatch(html, /<dialog[^>]*\sopen/);
  const stale = renderToStaticMarkup(
    <Positions account={account} view={{ ...market, stale: true }} />,
  );
  assert.doesNotMatch(stale, /\+20\.00 USDC/);
  const outdated = renderToStaticMarkup(
    <Positions account={{ ...account, outdated: true }} view={market} />,
  );
  assert.doesNotMatch(outdated, /\+20\.00 USDC/);
});
