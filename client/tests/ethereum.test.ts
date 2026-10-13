import assert from "node:assert/strict";
import { test } from "node:test";
import {
  discoverEthereum,
  ethereumError,
  type EthereumWallet,
} from "@/shared/depth/ethereum";

const provider = () => ({
  request: async () => {
    throw new Error("Discovery must not request an account");
  },
});
const uuid = "11111111-1111-4111-8111-111111111111";
function announce(target: EventTarget, value: object, info: object = {}) {
  target.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: {
        provider: value,
        info: {
          uuid,
          name: "Phantom",
          icon: "data:image/png;base64,AAAA",
          rdns: "app.phantom",
          ...info,
        },
      },
    }),
  );
}

test("Ethereum discovery combines legacy and announced providers without requesting accounts", () => {
  const phantom = provider();
  const metamask = Object.assign(provider(), { isMetaMask: true });
  const target = Object.assign(new EventTarget(), {
    ethereum: Object.assign(metamask, { providers: [metamask, phantom] }),
    phantom: { ethereum: phantom },
  });
  target.addEventListener("eip6963:requestProvider", () =>
    announce(target, phantom),
  );
  let wallets: EthereumWallet[] = [];
  const stop = discoverEthereum(target, (value) => {
    wallets = value;
  });
  assert.deepEqual(
    wallets.map(({ name }) => name),
    ["MetaMask", "Phantom"],
  );
  const selected = wallets.find(({ name }) => name === "Phantom")!;
  assert.equal(selected.provider, phantom);
  assert.equal(selected.icon, "data:image/png;base64,AAAA");
  announce(target, phantom);
  assert.equal(wallets.length, 2);
  stop();
});

test("late wallet announcements reach active subscribers but not closed views", () => {
  const target = new EventTarget();
  let count = 0;
  let wallets: EthereumWallet[] = [];
  const stop = discoverEthereum(target, (value) => {
    count++;
    wallets = value;
  });
  announce(target, provider());
  assert.equal(wallets.length, 1);
  stop();
  const closedCount = count;
  announce(target, provider(), {
    uuid: "22222222-2222-4222-8222-222222222222",
    name: "Rabby",
  });
  assert.equal(count, closedCount);
  const next = discoverEthereum(target, (value) => {
    wallets = value;
  });
  assert.deepEqual(
    wallets.map(({ name }) => name),
    ["Phantom", "Rabby"],
  );
  next();
});

test("announced wallets replace ambiguous legacy wrappers without merging distinct sessions", () => {
  const wrapper = Object.assign(provider(), { isMetaMask: true });
  const metamask = provider();
  const rabby = Object.assign(provider(), { isRabby: true, isMetaMask: true });
  const target = Object.assign(new EventTarget(), { ethereum: wrapper });
  let wallets: EthereumWallet[] = [];
  const stop = discoverEthereum(target, (value) => {
    wallets = value;
  });
  assert.equal(wallets[0].provider, wrapper);
  announce(target, metamask, { name: "MetaMask" });
  announce(target, rabby, {
    uuid: "22222222-2222-4222-8222-222222222222",
    name: "Rabby Wallet",
  });
  assert.deepEqual(
    wallets.map(({ name }) => name),
    ["MetaMask", "Rabby Wallet"],
  );
  assert.equal(wallets[0].provider, metamask);
  announce(target, provider(), {
    uuid: "33333333-3333-4333-8333-333333333333",
    name: "MetaMask",
  });
  assert.equal(wallets.filter(({ name }) => name === "MetaMask").length, 2);
  stop();
});

test("Rabby compatibility flags do not label its legacy provider as MetaMask", () => {
  const rabby = Object.assign(provider(), { isRabby: true, isMetaMask: true });
  const target = Object.assign(new EventTarget(), { ethereum: rabby });
  let wallets: EthereumWallet[] = [];
  const stop = discoverEthereum(target, (value) => {
    wallets = value;
  });
  assert.equal(wallets[0].name, "Rabby Wallet");
  announce(target, provider(), { name: "Phantom" });
  assert.deepEqual(
    wallets.map(({ name }) => name),
    ["Phantom"],
  );
  stop();
});

test("invalid or colliding announcements cannot replace a selected provider", () => {
  const target = new EventTarget();
  let wallets: EthereumWallet[] = [];
  const stop = discoverEthereum(target, (value) => {
    wallets = value;
  });
  const selected = provider();
  announce(target, selected, { icon: "javascript:alert(1)" });
  assert.equal(wallets[0].icon, undefined);
  announce(target, provider());
  assert.equal(wallets.length, 1);
  assert.equal(wallets[0].provider, selected);
  announce(target, {}, { uuid: "22222222-2222-4222-8222-222222222222" });
  announce(target, provider(), { uuid: "invalid" });
  assert.equal(wallets.length, 1);
  stop();
});

test("a pending Ethereum approval has a distinct actionable error", () => {
  assert.match(ethereumError({ code: -32002 }), /already pending/);
  assert.equal(ethereumError({ code: 4001 }), "Wallet connection declined.");
  assert.equal(
    ethereumError(new Error("Wallet did not respond")),
    "Wallet did not respond",
  );
});

test("Ethereum RPC errors retain their message and hide endpoint credentials", () => {
  assert.equal(
    ethereumError({ code: -32603, message: "Unlock your Ethereum wallet." }),
    "Unlock your Ethereum wallet.",
  );
  assert.equal(
    ethereumError({
      message: "Provider rejected https://example.com/private-key",
    }),
    "Provider rejected [endpoint]",
  );
  assert.match(ethereumError({ code: 4200 }), /does not support Ethereum/);
  assert.match(ethereumError({ code: 4100 }), /allow this site/);
  assert.match(ethereumError({ code: 4900 }), /disconnected/);
});
