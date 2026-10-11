import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicKey } from "@solana/web3.js";
import type { MarketView } from "@/shared/depth/market";
import type { AccountView } from "@/shared/depth/account";

const owner = new PublicKey("8fB17UvuSQSnAyvBjRwwgQgdhwHLQMqCrfQ7tqfGF5BJ");
let session: {
  connected: boolean;
  verifying: boolean;
  busy: string;
  local?: boolean;
  error?: string;
  retry?: () => void;
  trader?: object;
  maker?: object;
} = { connected: false, verifying: false, busy: "" };
const { mock } = createRequire(import.meta.url)("bun:test") as {
  mock: { module: (name: string, factory: () => unknown) => void };
};
mock.module("@/shared/depth/session", () => ({
  useDepth: () => ({ ...session, config: { environment: "devnet" } }),
}));
mock.module("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    publicKey: session.connected ? owner : null,
    connected: session.connected,
    connecting: false,
    wallet: {
      adapter: { name: "Phantom", icon: "data:image/png;base64,AAAA" },
    },
    wallets: [
      {
        readyState: "Installed",
        adapter: { name: "Phantom", icon: "data:image/png;base64,AAAA" },
      },
    ],
  }),
}));
const { Ticket } = await import("@/components/trade/ticket");
const { QuoteTicket } = await import("@/components/maker/ticket");
const { WalletButton } = await import("@/components/demo/wallet");
const { Funds } = await import("@/components/demo/funds");
const { Shell } = await import("@/components/demo/shell");
const { AccountPrompt } = await import("@/components/demo/prompt");
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
const account = {
  balance: { status: "ready", amount: 125_000_000n },
  loaded: true,
  empty: false,
  outdated: false,
  checking: false,
  error: "",
  read: async () => {},
} as unknown as AccountView;

function buttons(): string[] {
  return [
    renderToStaticMarkup(<Ticket view={view} account={account} />),
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

test("wallet logos belong to selection options and deployment preloading has no banner", () => {
  session = { connected: true, verifying: true, busy: "" };
  const connected = renderToStaticMarkup(<WalletButton />);
  const trigger = connected.match(
    /<button[^>]*class="terminal-wallet"[^>]*>.*?<\/button>/s,
  )![0];
  assert.match(trigger, /8fB17…F5BJ/);
  assert.doesNotMatch(trigger, /<img/);
  assert.match(connected, /class="wallet-identity"><img/);
  const shell = renderToStaticMarkup(
    <Shell role="trade" market={<span>SOL / USDC</span>}>
      {null}
    </Shell>,
  );
  assert.doesNotMatch(shell, /Verifying the Depth deployment|terminal-notice/);
  session = { connected: false, verifying: false, busy: "" };
  const disconnected = renderToStaticMarkup(<WalletButton />);
  assert.match(
    disconnected,
    /class="wallet-option"[^>]*><img[^>]*class="wallet-icon"/,
  );
});

test("funds show a proven empty account without requesting balance decryption", () => {
  session = { connected: true, verifying: false, busy: "", trader: {} };
  const account = {
    balance: { status: "uninitialized", amount: 0n },
    empty: true,
    loaded: true,
    outdated: false,
    checking: false,
    error: "",
    read: async () => {},
  } as unknown as AccountView;
  const html = renderToStaticMarkup(<Funds account={account} />);
  assert.match(html, /0\.00/);
  assert.match(html, /Retry connection/);
  assert.doesNotMatch(html, /View balances|Reveal balances/);
  const privateAccount = renderToStaticMarkup(
    <Funds
      account={{ ...account, empty: false, loaded: false, balance: undefined }}
    />,
  );
  assert.match(privateAccount, /aria-label="Refresh balances"/);
  assert.match(privateAccount, /Decrypt balances with wallet approval/);
  assert.doesNotMatch(privateAccount, /Reveal/);
});

test("inline fund operations do not create a strip above the chart", () => {
  session = {
    connected: true,
    verifying: false,
    busy: "Depositing USDC",
    local: true,
  };
  const local = renderToStaticMarkup(
    <Shell role="trade" market={<span>SOL / USDC</span>}>
      {null}
    </Shell>,
  );
  assert.doesNotMatch(local, /Depositing USDC|terminal-toast|terminal-notice/);
  session = {
    connected: true,
    verifying: false,
    busy: "",
    error: "Connection interrupted.",
  };
  const global = renderToStaticMarkup(
    <Shell role="trade" market={<span>SOL / USDC</span>}>
      {null}
    </Shell>,
  );
  assert.match(global, /terminal-toast/);
  assert.doesNotMatch(global, /terminal-notice/);
});

test("trade availability uses a fresh private balance and never substitutes zero for unknown data", () => {
  session = { connected: true, verifying: false, busy: "", trader: {} };
  const render = (value: AccountView) =>
    renderToStaticMarkup(<Ticket view={view} account={value} />);
  assert.match(render(account), /Available: 125\.00 USDC/);
  assert.match(render({ ...account, outdated: true }), /Available: — USDC/);
  assert.match(render({ ...account, checking: true }), /Available: — USDC/);
  const failed = render({
    ...account,
    error: "Wallet approval rejected",
    loaded: false,
    balance: undefined,
  });
  assert.match(failed, /Retry balance/);
  assert.match(failed, /Wallet approval rejected/);
  assert.doesNotMatch(failed, /Available: 0\.00/);
  const empty = render({
    ...account,
    empty: true,
    balance: { status: "uninitialized", amount: 0n } as AccountView["balance"],
  });
  assert.match(empty, /Available: 0\.00 USDC/);
});

test("connected account records do not ask the wallet to connect again", () => {
  session = { connected: true, verifying: true, busy: "" };
  const html = renderToStaticMarkup(
    <AccountPrompt>Connect wallet to view positions.</AccountPrompt>,
  );
  assert.match(html, /Loading account/);
  assert.doesNotMatch(html, /Connect wallet/);
});
