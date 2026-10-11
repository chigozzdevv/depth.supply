import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import { viewMessage, type ViewRequest } from "@depthhq/schema";
import { Keypair } from "@solana/web3.js";
import { createPrivateKey, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticateView } from "@/features/view/view.service";
import { ViewStore } from "@/features/view/view.store";

function signed(action: "read" | "close" = "read"): ViewRequest {
  const reader = Keypair.generate();
  const request: ViewRequest = {
    owner: Keypair.generate().publicKey.toBase58(),
    reader: reader.publicKey.toBase58(),
    permit: Keypair.generate().publicKey.toBase58(),
    kind: "balance",
    source: Keypair.generate().publicKey.toBase58(),
    nonce: "99",
    expiresAt: 1100,
    signature: "",
  };
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(reader.secretKey.subarray(0, 32)),
    ]),
    type: "pkcs8",
    format: "der",
  });
  request.signature = sign(
    null,
    Buffer.from(viewMessage(DEPTH_PROGRAM_ID.toBase58(), request, action)),
    key,
  ).toString("base64");
  return request;
}

test("read signatures bind every field, action, deadline and u64 nonce", () => {
  const request = signed();
  assert.doesNotThrow(() => authenticateView(request, "read", 1000));
  for (const change of [
    { owner: Keypair.generate().publicKey.toBase58() },
    { reader: Keypair.generate().publicKey.toBase58() },
    { permit: Keypair.generate().publicKey.toBase58() },
    { kind: "market" },
    { source: Keypair.generate().publicKey.toBase58() },
    { nonce: "100" },
    { nonce: "18446744073709551616" },
    { expiresAt: 1101 },
    { signature: "A".repeat(88) },
  ])
    assert.throws(() =>
      authenticateView({ ...request, ...change } as ViewRequest, "read", 1000),
    );
  assert.throws(() => authenticateView(request, "close", 1000));
  assert.throws(() => authenticateView(request, "read", 1100));
  assert.throws(() => authenticateView(request, "read", 919));
  assert.doesNotThrow(() => authenticateView(signed("close"), "close", 1000));
});

test("signed submission bytes and idempotency survive restart with an exclusive lease", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-view-"));
  let store: ViewStore | undefined;
  try {
    store = await ViewStore.open(directory, "network:program:sponsor");
    await assert.rejects(ViewStore.open(directory, "network:program:sponsor"));
    const request = signed();
    const record = {
      key: "owner:reader:balance:source:99",
      request,
      receipt: {
        id: request.source,
        payer: request.owner,
        signature: "signature",
      },
      createdAt: Date.now(),
      transaction: "signed-bytes",
      blockhash: "blockhash",
      lastValidBlockHeight: 900,
    };
    await store.save(record);
    await store.close();
    store = await ViewStore.open(directory, "network:program:sponsor");
    assert.deepEqual(store.get(record.key), record);
    await store.save({ ...record, closed: true });
    assert.equal(store.list().length, 1);
    await store.close();
    store = undefined;
    await assert.rejects(
      ViewStore.open(directory, "another-network"),
      /identity/,
    );
  } finally {
    await store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a lost submission response reuses signed bytes after a service restart and rechecks permission", async () => {
  const { ViewService } = await import("@/features/view/view.service");
  const { ChainSigner } = await import("@/shared/chain/chain.signer");
  const { marketAddress, balanceAddress, viewPermitAddress } =
    await import("@depthhq/bindings");
  const { PublicKey, Transaction, SystemProgram } =
    await import("@solana/web3.js");
  const directory = await mkdtemp(join(tmpdir(), "depth-view-retry-"));
  const reader = Keypair.generate();
  const owner = Keypair.generate().publicKey;
  const sponsor = Keypair.generate();
  const permitId = viewPermitAddress(owner, reader.publicKey);
  const request: ViewRequest = {
    owner: owner.toBase58(),
    reader: reader.publicKey.toBase58(),
    permit: permitId.toBase58(),
    kind: "balance",
    source: balanceAddress(owner).toBase58(),
    nonce: "123",
    expiresAt: Math.floor(Date.now() / 1000) + 120,
    signature: "",
  };
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(reader.secretKey.subarray(0, 32)),
    ]),
    type: "pkcs8",
    format: "der",
  });
  request.signature = sign(
    null,
    Buffer.from(viewMessage(DEPTH_PROGRAM_ID.toBase58(), request)),
    key,
  ).toString("base64");
  let active = true;
  let prepared = 0;
  const bytes: Buffer[] = [];
  const chain = {
    wallet: new anchor.Wallet(sponsor),
    market: marketAddress(),
    read: async (name: string) =>
      name === "ViewPermit"
        ? {
            owner,
            reader: reader.publicKey,
            market: marketAddress(),
            viewKey: Array(32).fill(9),
            expiresAt: new anchor.BN(request.expiresAt + 1000),
            active,
            scopes: 1,
          }
        : { owner, status: { ready: {} } },
    queue: async () => ({}),
    program: {
      methods: {
        requestBalanceView: () => ({
          accountsPartial: () => ({
            remainingAccounts: () => ({
              transaction: async () => {
                prepared++;
                return new Transaction().add(
                  SystemProgram.transfer({
                    fromPubkey: sponsor.publicKey,
                    toPubkey: PublicKey.default,
                    lamports: 1,
                  }),
                );
              },
            }),
          }),
        }),
      },
    },
    connection: {
      getBalance: async () => 1000000000,
      getLatestBlockhash: async () => ({
        blockhash: Keypair.generate().publicKey.toBase58(),
        lastValidBlockHeight: 100,
      }),
      getBlockHeight: async () => 99,
      getAccountInfo: async () => null,
      getSignatureStatuses: async () => ({ value: [null] }),
      sendRawTransaction: async (tx: Buffer) => {
        bytes.push(tx);
        if (bytes.length === 1) throw new Error("lost RPC response");
        return "signature";
      },
      confirmTransaction: async () => ({ value: { err: null } }),
    },
  } as unknown as InstanceType<typeof ChainSigner>;
  let store: ViewStore | undefined;
  try {
    store = await ViewStore.open(directory, "test");
    await assert.rejects(
      new ViewService(chain, store).read(request),
      /lost RPC/,
    );
    assert.equal(prepared, 1);
    const saved = store.list()[0];
    assert.equal(saved.transaction, bytes[0].toString("base64"));
    await store.close();
    store = await ViewStore.open(directory, "test");
    const service = new ViewService(chain, store);
    const result = await service.read(request);
    assert.equal(result.signature, saved.receipt.signature);
    assert.equal(prepared, 1);
    assert.deepEqual(bytes[1], bytes[0]);
    active = false;
    await assert.rejects(service.read(request), /invalid_view_permission/);
    assert.equal(bytes.length, 2);
  } finally {
    await store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
