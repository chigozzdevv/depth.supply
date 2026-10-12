import assert from "node:assert/strict";
import { createPrivateKey, randomBytes, sign } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import Fastify from "fastify";
import { Keypair } from "@solana/web3.js";
import {
  automationWire,
  automationConfig,
  MakerAutomation,
  type MakerClient,
} from "@depthhq/maker-sdk";
import { AutomationStore } from "@/features/automation/automation.store";
import { AutomationService } from "@/features/automation/automation.service";
import {
  AutomationRunner,
  type AutomationBot,
} from "@/features/automation/automation.runner";
import { automationRoute } from "@/features/automation/automation.route";
import { WalletAccess } from "@/shared/http/access";

const config = automationWire({
  quote: {
    maxCapacity: 100_000_000n,
    maxInventoryNotional: 1000_000_000n,
    spreadBps: 20,
    repriceBps: 10,
    lifetimeSeconds: 120,
    refreshSeconds: 60,
  },
});
const hedge = {
  account: `0x${"1".repeat(40)}` as `0x${string}`,
  policy: {
    ratioBps: 10000,
    thresholdNotional: "10000000",
    maxUnhedgedNotional: "100000000",
    maxOrderNotional: "100000000",
    batchMs: 5000,
    maxUnhedgedMs: 15000,
    maxSlippageBps: 10,
    maxPriceAgeMs: 5000,
    orderTtlMs: 10000,
    maxLeverage: 3,
  },
};
const signature = (wallet: Keypair, message: string) =>
  sign(
    null,
    Buffer.from(message),
    createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        Buffer.from(wallet.secretKey.subarray(0, 32)),
      ]),
      format: "der",
      type: "pkcs8",
    }),
  ).toString("base64");

test("the public Maker SDK authenticates and manages automation through the real HTTP routes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-automation-sdk-"));
  const store = await AutomationStore.open(
    directory,
    randomBytes(32).toString("hex"),
    "devnet",
  );
  const app = Fastify();
  automationRoute(app, new AutomationService(store, () => false));
  const owner = Keypair.generate();
  const automation = new MakerAutomation({
    options: {
      maker: owner.publicKey,
      environment: "devnet",
      serviceUrl: "https://depth.example",
      wallet: {
        publicKey: owner.publicKey,
        signMessage: async (message: Uint8Array) =>
          Buffer.from(
            signature(owner, new TextDecoder().decode(message)),
            "base64",
          ),
      },
    },
  } as unknown as MakerClient);
  const original = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    const response = await app.inject({
      method: (init?.method ?? "GET") as "GET" | "POST",
      url: `${url.pathname}${url.search}`,
      headers: init?.headers as Record<string, string>,
      payload: init?.body as string | undefined,
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await assert.rejects(automation.summary(), /Authorize/);
    const profile = await automation.configure(automationConfig(config));
    assert.equal(profile.owner, owner.publicKey.toBase58());
    assert.equal((await automation.summary())?.operator, profile.operator);
    assert.equal((await automation.start()).desired, "running");
    assert.equal((await automation.pause()).phase, "paused");
    assert.equal((await automation.resume()).desired, "running");
  } finally {
    globalThis.fetch = original;
    await app.close();
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("automation sessions bind each maker and scope, omit credentials, and reject stale changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-automation-"));
  const store = await AutomationStore.open(
    directory,
    randomBytes(32).toString("hex"),
    "devnet",
  );
  const service = new AutomationService(store, () => false);
  const app = Fastify();
  automationRoute(app, service);
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  async function session(wallet: Keypair) {
    const challenge = (
      await app.inject({
        url: `/v1/maker/automation/challenge?wallet=${wallet.publicKey}`,
      })
    ).json();
    assert.ok(challenge.message.includes("Manage maker automation"));
    const response = await app.inject({
      method: "POST",
      url: "/v1/maker/automation/session",
      payload: {
        nonce: challenge.nonce,
        signature: signature(wallet, challenge.message),
      },
    });
    assert.equal(response.statusCode, 200);
    return { authorization: `Bearer ${response.json().token}` };
  }
  try {
    assert.equal(
      (await app.inject({ url: "/v1/maker/automation" })).statusCode,
      401,
    );
    const aliceHeaders = await session(alice);
    const bobHeaders = await session(bob);
    const read = new WalletAccess(alice.publicKey);
    const challenge = read.challenge(alice.publicKey.toBase58())!;
    const readSession = read.session(
      challenge.nonce,
      signature(alice, challenge.message),
    )!;
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/maker/automation/configure",
          headers: { authorization: `Bearer ${readSession.token}` },
          payload: { revision: 0, config },
        })
      ).statusCode,
      401,
    );
    const a = await app.inject({
      method: "POST",
      url: "/v1/maker/automation/configure",
      headers: aliceHeaders,
      payload: { revision: 0, config },
    });
    assert.equal(a.statusCode, 200);
    assert.equal(a.json().owner, alice.publicKey.toBase58());
    assert.equal(a.body.includes("Secret"), false);
    assert.equal(
      a.body.includes(store.get(alice.publicKey.toBase58())!.agentSecret),
      false,
    );
    assert.equal(
      (
        await app.inject({ url: "/v1/maker/automation", headers: bobHeaders })
      ).json(),
      null,
    );
    const b = await app.inject({
      method: "POST",
      url: "/v1/maker/automation/configure",
      headers: bobHeaders,
      payload: { revision: 0, config },
    });
    assert.notEqual(a.json().operator, b.json().operator);
    assert.notEqual(a.json().agent, b.json().agent);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/maker/automation/configure",
          headers: aliceHeaders,
          payload: { revision: 0, config },
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/maker/automation/configure",
          headers: aliceHeaders,
          payload: {
            revision: 1,
            config: { ...config, owner: bob.publicKey.toBase58() },
          },
        })
      ).statusCode,
      400,
    );
    const invalid = service.access.challenge(alice.publicKey.toBase58())!;
    assert.equal(
      service.access.session(invalid.nonce, signature(bob, invalid.message)),
      undefined,
    );
    assert.equal(
      service.access.session(invalid.nonce, signature(alice, invalid.message)),
      undefined,
    );
  } finally {
    await app.close();
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the encrypted registry restores identities and desired state, fails on the wrong key, and admits only one supervisor", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-vault-"));
  const secret = randomBytes(32).toString("hex");
  let store = await AutomationStore.open(directory, secret, "devnet");
  const owner = Keypair.generate().publicKey.toBase58();
  try {
    const service = new AutomationService(store, () => false);
    const profile = await service.configure(owner, 0, config);
    await service.command(owner, profile.revision, "start");
    const privateRecord = store.get(owner)!;
    const source = await readFile(join(directory, "automation.json"), "utf8");
    assert.equal(source.includes(privateRecord.operatorSecret), false);
    assert.equal(source.includes(privateRecord.agentSecret), false);
    assert.equal(source.includes(owner), false);
    assert.equal(
      (await stat(join(directory, "automation.json"))).mode & 0o777,
      0o600,
    );
    await assert.rejects(
      AutomationStore.open(directory, secret, "devnet"),
      /Another maker bot/,
    );
    await store.close();
    await assert.rejects(
      AutomationStore.open(
        directory,
        randomBytes(32).toString("hex"),
        "devnet",
      ),
    );
    await assert.rejects(
      AutomationStore.open(directory, secret, "mainnet-beta"),
    );
    store = await AutomationStore.open(directory, secret, "devnet");
    assert.deepEqual(
      store.get(owner),
      JSON.parse(JSON.stringify(privateRecord)),
    );
    assert.equal(store.get(owner)!.desired, "running");
    const clone = store.get(owner)!;
    clone.operatorSecret = "changed";
    assert.equal(
      store.get(owner)!.operatorSecret,
      privateRecord.operatorSecret,
    );
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("two makers start independently, pause only their own quotes, and restore running workers after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-workers-"));
  const secret = randomBytes(32).toString("hex");
  let store = await AutomationStore.open(directory, secret, "devnet");
  const calls = new Map<string, number>();
  const closed = new Set<string>();
  const factory = async (record: { owner: string }) => {
    calls.set(record.owner, (calls.get(record.owner) ?? 0) + 1);
    let stopped = false;
    return {
      stop() {
        stopped = true;
      },
      async tick() {
        return { phase: stopped ? "stopped" : "active", fillCount: 0 } as const;
      },
      async close() {
        closed.add(record.owner);
      },
    } satisfies AutomationBot;
  };
  let runner = new AutomationRunner(store, factory);
  let service = new AutomationService(store, runner.has);
  const alice = Keypair.generate().publicKey.toBase58();
  const bob = Keypair.generate().publicKey.toBase58();
  try {
    await service.configure(alice, 0, config);
    await service.configure(bob, 0, config);
    await service.command(alice, 1, "start");
    await service.command(bob, 1, "start");
    await Promise.all([runner.tick(), runner.tick()]);
    assert.equal(calls.get(alice), 1);
    assert.equal(calls.get(bob), 1);
    await assert.rejects(service.configure(alice, 1, config), /Pause/);
    await service.command(alice, 1, "pause");
    await runner.tick();
    assert.equal(service.summary(alice)!.phase, "paused");
    assert.equal(service.summary(bob)!.phase, "running");
    assert.ok(closed.has(alice));
    assert.equal(closed.has(bob), false);
    await runner.close();
    await store.close();
    store = await AutomationStore.open(directory, secret, "devnet");
    runner = new AutomationRunner(store, factory);
    service = new AutomationService(store, runner.has);
    await runner.tick();
    assert.equal(calls.get(alice), 1);
    assert.equal(calls.get(bob), 2);
    await service.command(alice, 1, "start");
    await runner.tick();
    assert.equal(calls.get(alice), 2);
    assert.equal(runner.health().healthy, true);
    assert.equal(runner.health(Date.now() + 240_001).healthy, false);
    assert.equal(service.summary(alice)!.operator, store.get(alice)!.operator);
  } finally {
    await runner.close();
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("unapproved hedge drafts cannot reserve somebody else's account and confirmed bindings cannot be reassigned", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-binding-"));
  const store = await AutomationStore.open(
    directory,
    randomBytes(32).toString("hex"),
    "devnet",
  );
  const service = new AutomationService(store, () => false);
  const alice = Keypair.generate().publicKey.toBase58();
  const bob = Keypair.generate().publicKey.toBase58();
  try {
    await service.configure(alice, 0, { ...config, hedge });
    await service.configure(bob, 0, { ...config, hedge });
    await store.change((records) => {
      records.find((record) => record.owner === alice)!.hedgeBound = true;
    });
    await assert.rejects(
      service.configure(bob, 1, { ...config, hedge }),
      /assigned/,
    );
    await assert.rejects(
      service.configure(alice, 1, config),
      /existing hedge account/,
    );
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed approval checks stay blocked and a never-started worker can be paused and repaired", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-blocked-"));
  const store = await AutomationStore.open(
    directory,
    randomBytes(32).toString("hex"),
    "devnet",
  );
  const runner = new AutomationRunner(store, async () => {
    throw new Error("Operator grant is inactive https://rpc.example/secret");
  });
  const service = new AutomationService(store, runner.has);
  const owner = Keypair.generate().publicKey.toBase58();
  try {
    await service.configure(owner, 0, config);
    await service.command(owner, 1, "start");
    await runner.tick();
    assert.equal(service.summary(owner)!.phase, "blocked");
    assert.equal(
      service.summary(owner)!.reason!.includes("rpc.example"),
      false,
    );
    await service.command(owner, 1, "pause");
    assert.equal(service.summary(owner)!.phase, "paused");
    assert.equal((await service.configure(owner, 1, config)).revision, 2);
    const results = await Promise.allSettled([
      service.configure(owner, 2, config),
      service.configure(owner, 2, config),
    ]);
    assert.equal(
      results.filter((value) => value.status === "fulfilled").length,
      1,
    );
  } finally {
    await runner.close();
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
