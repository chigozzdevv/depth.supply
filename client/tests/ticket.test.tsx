import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicKey } from "@solana/web3.js";
import type { MarketView } from "@/shared/depth/market";

const owner = new PublicKey("8fB17UvuSQSnAyvBjRwwgQgdhwHLQMqCrfQ7tqfGF5BJ");
let session: {
  connected: boolean;
  verifying: boolean;
  busy: string;
  retry?: () => void;
  trader?: object;
  maker?: object;
} = { connected: false, verifying: false, busy: "" };
const { mock } = createRequire(import.meta.url)("bun:test") as {
  mock: { module: (name: string, factory: () => unknown) => void };
};
mock.module("@/shared/depth/session", () => ({ useDepth: () => session }));
mock.module("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    publicKey: session.connected ? owner : null,
    connected: session.connected,
    connecting: false,
    wallets: [],
  }),
}));
const { Ticket } = await import("@/components/trade/ticket");
const { QuoteTicket } = await import("@/components/maker/ticket");
const view = {
  ready: true,
  stale: false,
  error: "",
  fundingOverdue: false,
  market: {
    initial_margin_bps: 1000,
    status: "active",
    incident: "none",
    fee_bps: 5,
    insurance_fee_bps: 1,
  },
  app: { fee_bps: 1 },
} as unknown as MarketView;

function buttons(): string[] {
  return [
    renderToStaticMarkup(<Ticket view={view} />),
    renderToStaticMarkup(<QuoteTicket view={view} quotes={[]} />),
  ].map(
    (html) =>
      [
        ...html.matchAll(
          /<button[^>]*class="terminal-button primary full"[^>]*>.*?<\/button>/gs,
        ),
      ].at(-1)![0],
  );
}

test("trade and quote actions reflect connection readiness without showing a wallet address", () => {
  const address = "8fB17…F5BJ";
  session = { connected: true, verifying: true, busy: "", retry: () => {} };
  for (const button of buttons()) {
    assert.match(button, /Verifying…/);
    assert.match(button, /disabled/);
    assert.doesNotMatch(button, new RegExp(address));
  }
  session = { connected: true, verifying: false, busy: "", retry: () => {} };
  for (const button of buttons()) {
    assert.match(button, /Retry connection/);
    assert.doesNotMatch(button, /disabled/);
    assert.doesNotMatch(button, new RegExp(address));
  }
  session = {
    connected: true,
    verifying: false,
    busy: "",
    trader: {},
    maker: {},
  };
  const [trade, quote] = buttons();
  assert.match(trade, /Review long/);
  assert.match(quote, /Review quote/);
  for (const button of [trade, quote]) {
    assert.doesNotMatch(button, /disabled/);
    assert.doesNotMatch(button, new RegExp(address));
  }
  session = { connected: true, verifying: false, busy: "" };
  for (const button of buttons()) {
    assert.match(button, /Wallet unavailable/);
    assert.match(button, /disabled/);
  }
});

test("the connect-wallet control is shown only before a wallet connects", () => {
  session = { connected: false, verifying: false, busy: "" };
  const [trade, quote] = buttons();
  assert.match(trade, /Connect wallet to trade/);
  assert.match(quote, /Connect maker wallet/);
});
