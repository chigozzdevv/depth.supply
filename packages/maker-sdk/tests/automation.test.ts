import assert from "node:assert/strict";
import { test } from "node:test";
import * as anchor from "@anchor-lang/core";
import {
  Keypair,
  PublicKey,
  SystemInstruction,
  Transaction,
} from "@solana/web3.js";
import { MakerAutomation } from "@/automation/automation";
import {
  automationView,
  automationWire,
  automationConfig,
  type AutomationView,
} from "@/automation/types";
import { accessMessage } from "@/hedge/access";
import { connect_hyperliquid } from "@/hedge/wallet";
import type { MakerClient } from "@/client/client";

const config = {
  quote: {
    maxCapacity: 100_000_000n,
    maxInventoryNotional: 1000_000_000n,
    spreadBps: 20,
    repriceBps: 10,
    lifetimeSeconds: 120,
    refreshSeconds: 60,
  },
};
test("the public automation flow signs its scope, reviews persisted identities, funds only its operator, and grants no collateral authority", async () => {
  const ownerKey = Keypair.generate();
  const owner = ownerKey.publicKey;
  const operator = Keypair.generate().publicKey;
  const profile: AutomationView = {
    owner: owner.toBase58(),
    operator: operator.toBase58(),
    agent: `0x${"1".repeat(40)}`,
    environment: "devnet",
    revision: 1,
    config: automationWire(automationConfig(automationWire(config))),
    desired: "paused",
    phase: "configured",
    updatedAt: Date.now(),
    hedge: { maker: owner.toBase58(), enabled: false, snapshot: null },
  };
  let granted: Record<string, unknown> | undefined;
  let funded = 0n;
  let fundingHash = "";
  let scope = "";
  let revision = 1;
  const requests: string[] = [];
  const maker = {
    options: {
      maker: owner,
      environment: "devnet",
      serviceUrl: "https://depth.example",
      wallet: {
        publicKey: owner,
        signMessage: async (value: Uint8Array) => {
          scope = new TextDecoder().decode(value);
          return new Uint8Array(64);
        },
        signTransaction: async (transaction: Transaction) => {
          transaction.partialSign(ownerKey);
          return transaction;
        },
      },
      connection: {
        getBalance: async () => 10_000_000,
        getLatestBlockhash: async () => ({
          blockhash: PublicKey.unique().toBase58(),
          lastValidBlockHeight: 250,
        }),
      },
    },
    operator: {
      authorize: async (input: Record<string, unknown>) => {
        granted = input;
        return "grant-signature";
      },
    },
  } as unknown as MakerClient;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    if (url.pathname.endsWith("challenge")) {
      const nonce = "a".repeat(64);
      const expiresAt = Date.now() + 60000;
      return Response.json({
        wallet: owner.toBase58(),
        nonce,
        expiresAt,
        message: accessMessage(
          owner.toBase58(),
          nonce,
          expiresAt,
          "Manage maker automation",
        ),
      });
    }
    if (url.pathname.endsWith("session"))
      return Response.json({
        token: "b".repeat(64),
        expiresAt: Date.now() + 900000,
      });
    assert.equal(
      (init!.headers as Record<string, string>).authorization,
      `Bearer ${"b".repeat(64)}`,
    );
    if (url.pathname.endsWith("configure"))
      assert.deepEqual(JSON.parse(String(init!.body)), {
        revision: 0,
        config: automationWire(config),
      });
    if (url.pathname.endsWith("fund")) {
      const body = JSON.parse(String(init!.body));
      if (body.transaction) {
        const transaction = Transaction.from(
          Buffer.from(body.transaction, "base64"),
        );
        assert.equal(transaction.verifySignatures(), true);
        const transfer = SystemInstruction.decodeTransfer(
          transaction.instructions[0],
        );
        assert.ok(transfer.fromPubkey.equals(owner));
        assert.ok(transfer.toPubkey.equals(operator));
        funded += transfer.lamports;
        fundingHash = anchor.utils.bytes.bs58.encode(transaction.signature!);
      }
      return Response.json({
        ...profile,
        revision,
        ...(fundingHash
          ? {
              funding: {
                signature: fundingHash,
                lamports: funded.toString(),
                status: "confirmed",
              },
            }
          : {}),
      });
    }
    if (url.pathname.endsWith("start") || url.pathname.endsWith("pause"))
      assert.deepEqual(JSON.parse(String(init!.body)), { revision: 1 });
    return Response.json({ ...profile, revision });
  }) as typeof fetch;
  try {
    const automation = new MakerAutomation(maker);
    await assert.rejects(automation.summary(), /Authorize/);
    assert.equal(
      (await automation.configure(config, 0)).operator,
      operator.toBase58(),
    );
    assert.ok(scope.includes("Scope: Manage maker automation"));
    const result = await automation.approve(profile);
    assert.equal(funded, 240_000_000n);
    assert.deepEqual(result.signatures, [fundingHash, "grant-signature"]);
    assert.deepEqual(Object.keys(granted!).sort(), [
      "canView",
      "expiresAt",
      "maxCapacity",
      "operator",
    ]);
    assert.equal(granted!.canView, true);
    assert.equal(granted!.maxCapacity, 100_000_000n);
    await automation.start(1);
    await automation.pause(1);
    await automation.resume(1);
    revision = 2;
    funded = 0n;
    granted = undefined;
    await assert.rejects(automation.approve(profile), /changed/);
    assert.equal(funded, 0n);
    assert.equal(granted, undefined);
    automation.disconnect();
    await assert.rejects(automation.summary(), /Authorize/);
    assert.ok(
      requests.every((path) => path.startsWith("/v1/maker/automation")),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("automation responses and configuration reject wallet mismatches, unknown fields, unsafe amounts, and invalid risk timing", () => {
  const owner = Keypair.generate().publicKey.toBase58();
  assert.throws(
    () =>
      automationView(
        { owner: PublicKey.default.toBase58(), environment: "devnet" },
        owner,
        "devnet",
      ),
    /another wallet/,
  );
  assert.throws(
    () => automationConfig({ ...automationWire(config), key: "private" }),
    /invalid/,
  );
  assert.throws(
    () =>
      automationConfig({
        quote: {
          ...automationWire(config).quote,
          maxCapacity: "18446744073709551616",
        },
      }),
    /integer amount/,
  );
  assert.throws(
    () =>
      automationConfig({
        quote: { ...automationWire(config).quote, refreshSeconds: 120 },
      }),
    /precede/,
  );
});

test("injected hedge wallets sign canonical typed data and stop when the selected account changes", async () => {
  const account = `0x${"1".repeat(40)}`;
  let selected = account;
  let calls = 0;
  const wallet = await connect_hyperliquid({
    async request(input) {
      if (
        input.method === "eth_requestAccounts" ||
        input.method === "eth_accounts"
      )
        return [selected];
      if (input.method === "eth_chainId") return "0xa4b1";
      assert.equal(input.method, "eth_signTypedData_v4");
      assert.equal(input.params![0], account);
      const data = JSON.parse(input.params![1] as string);
      assert.equal(data.types.EIP712Domain.length, 4);
      assert.equal(data.primaryType, "Test");
      calls++;
      return `0x${"a".repeat(130)}`;
    },
  });
  assert.deepEqual(await wallet.getAddresses(), [account]);
  assert.equal(await wallet.getChainId(), 42161);
  const data = {
    domain: {
      name: "Test",
      version: "1",
      chainId: 1,
      verifyingContract: `0x${"0".repeat(40)}` as `0x${string}`,
    },
    types: { Test: [{ name: "value", type: "string" }] },
    primaryType: "Test",
    message: { value: "test" },
  };
  await wallet.signTypedData(data);
  selected = `0x${"2".repeat(40)}`;
  await assert.rejects(wallet.signTypedData(data), /account changed/);
  assert.equal(calls, 1);
});
