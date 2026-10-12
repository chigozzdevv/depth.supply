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
const { Pnl } = await import("@/components/trade/pnl");
const { positionPnl } = await import("@depthhq/sdk");
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

test("collateral without exposure is not presented as a closable position", () => {
  const html = renderToStaticMarkup(
    <Positions
      account={{
        ...account,
        position: { ...position, position: 0n, collateral: 20_000_000n },
      }}
      view={market}
    />,
  );
  assert.match(html, /No open positions/);
  assert.match(html, /20\.00.*?USDC/);
  assert.match(html, /Release margin/);
  assert.doesNotMatch(html, /Close position|Review operation|Entry price/);
});

test("the position table and share card retain a sub-cent loss and its collateral return", () => {
  const small = {
    ...position,
    position: 27_750_000n,
    entryPriceE8: 10_808_000_000n,
    collateral: 1_000_000n,
  };
  const view = {
    ...market,
    market: { ...market.market!, oracle_price_e8: "10804000000" },
  };
  const result = positionPnl(small, 10_804_000_000n, 0n);
  assert.equal(result.net, -1_110n);
  assert.equal(result.returnBps, -11n);
  const table = renderToStaticMarkup(
    <Positions account={{ ...account, position: small }} view={view} />,
  );
  const card = renderToStaticMarkup(
    <Pnl
      card={{
        result,
        environment: "devnet",
        transaction: async () => {
          throw new Error("Not requested during rendering");
        },
      }}
      open={false}
      onClose={() => {}}
    />,
  );
  assert.match(table, /-0\.00111 USDC/);
  assert.match(card, /-0\.00111 USDC/);
  assert.match(card, /-0\.11<span class="pnl-percent">%<\/span>/);
  assert.doesNotMatch(table, /-0\.00 USDC/);
  assert.doesNotMatch(card, /-0\.00 USDC/);
});
