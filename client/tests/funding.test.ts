import assert from "node:assert/strict";
import { test } from "node:test";
import type { DepthClient } from "@depthhq/sdk";
import { PublicKey } from "@solana/web3.js";
import {
  FundingStore,
  settleFunding,
  discoverFunding,
  type FundingRequest,
} from "@/shared/depth/funding";
import { errorMessage } from "@/shared/depth/error";

const owner = new PublicKey("8fB17FZsuBbHunF9b13LZhGBkk9QaYhLFWFsEGJaF5BJ");
const programId = new PublicKey("11111111111111111111111111111111");
const request: FundingRequest = {
  action: "deposit",
  amount: 20_000_000n,
  nonce: 123n,
};

function fixture() {
  let state: { amount: bigint } | undefined;
  let unavailable = false;
  const calls = { submit: 0, confirm: 0 };
  const handle = {
    id: owner,
    client: {
      read: async () => {
        if (unavailable) throw new Error("503 rpc_unavailable");
        return state;
      },
    },
    status: async () => "pending",
    confirm: async () => {
      calls.confirm++;
    },
  };
  const sdk = {
    options: { environment: "devnet", wallet: { publicKey: owner } },
    program: { programId },
    account: () => ({
      depositHandle: (nonce: bigint) => {
        assert.equal(nonce, request.nonce);
        return handle;
      },
      deposit: async (amount: bigint, nonce: bigint) => {
        assert.equal(nonce, request.nonce);
        calls.submit++;
        state = { amount };
        throw new Error("Submission was not confirmed");
      },
      pending: async () => ({
        items: state
          ? [
              {
                id: owner,
                kind: "deposit",
                status: "pending",
                nonce: request.nonce,
              },
            ]
          : [],
      }),
    }),
  } as unknown as DepthClient;
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  return {
    sdk,
    storage,
    data,
    calls,
    state: (value: { amount: bigint }) => {
      state = value;
    },
    unavailable: () => {
      unavailable = true;
    },
  };
}

test("interrupted deposits survive reload and resume the existing receipt without a second debit", async () => {
  const f = fixture();
  new FundingStore(f.storage, f.sdk).save(request);
  await assert.rejects(settleFunding(f.sdk, request), /not confirmed/);
  const restored = new FundingStore(f.storage, f.sdk).read()!;
  assert.deepEqual(restored, request);
  await settleFunding(f.sdk, restored);
  assert.equal(f.calls.submit, 1);
  assert.equal(f.calls.confirm, 1);
  assert.deepEqual(await discoverFunding(f.sdk), request);
});

test("RPC failure and receipt amount mismatch block a new funding transaction", async () => {
  const unavailable = fixture();
  unavailable.unavailable();
  await assert.rejects(
    settleFunding(unavailable.sdk, request),
    /rpc_unavailable/,
  );
  assert.equal(unavailable.calls.submit, 0);
  const mismatch = fixture();
  mismatch.state({ amount: 10_000_000n });
  await assert.rejects(settleFunding(mismatch.sdk, request), /does not match/);
  assert.equal(mismatch.calls.submit, 0);
  assert.equal(mismatch.calls.confirm, 0);
});

test("saved transfers are isolated by wallet and reject corrupted requests", () => {
  const f = fixture();
  const store = new FundingStore(f.storage, f.sdk);
  store.save(request);
  const other = {
    ...f.sdk,
    options: { ...f.sdk.options, wallet: { publicKey: programId } },
  } as DepthClient;
  assert.equal(new FundingStore(f.storage, other).read(), undefined);
  const key = [...f.data.keys()][0];
  for (const corrupt of [
    "null",
    "{",
    JSON.stringify({
      version: 1,
      action: "deposit",
      amount: "all",
      nonce: "123",
    }),
    JSON.stringify({
      version: 1,
      action: "deposit",
      amount: "20",
      nonce: (1n << 64n).toString(),
    }),
  ]) {
    f.data.set(key, corrupt);
    assert.throws(() => store.read(), /invalid/);
  }
});

test("wallet and RPC errors use plain text without leaking provider URLs", () => {
  assert.equal(
    errorMessage(
      new Error("Transaction simulation failed: Blockhash not found"),
    ),
    "Wallet request expired. Please try again.",
  );
  assert.equal(
    errorMessage(
      new Error('503 Service Unavailable: {"error":"rpc_unavailable"}'),
    ),
    "Connection interrupted. Please try again.",
  );
  assert.equal(
    errorMessage(new Error("User rejected the request")),
    "Wallet approval declined.",
  );
  assert.doesNotMatch(
    errorMessage(
      new Error("Could not read https://rpc.example.test/private-key"),
    ),
    /private-key/,
  );
});

test("wrapped Hyperliquid errors preserve the actual wallet action and redact provider URLs", () => {
  assert.equal(
    errorMessage(
      new Error("Failed to sign the typed data using the wallet", {
        cause: { code: 4001, message: "User rejected the request" },
      }),
    ),
    "Wallet approval declined.",
  );
  assert.equal(
    errorMessage(
      new Error("Failed to get an address from the wallet", {
        cause: new Error("Failed to get the chain ID from the wallet", {
          cause: { code: -32002, message: "Request already pending" },
        }),
      }),
    ),
    "A wallet request is already pending. Open your wallet to resolve it.",
  );
  assert.equal(
    errorMessage(
      new Error("Failed to get an address from the wallet", {
        cause: { message: "Disconnected from https://rpc.test/secret" },
      }),
    ),
    "Disconnected from [endpoint]",
  );
});
