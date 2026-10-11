import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DepthError,
  type DepthClient,
  type TradeFlowSnapshot,
} from "@depthhq/sdk";
import { PublicKey } from "@solana/web3.js";
import { reconcileTrade } from "@/shared/depth/trade";
import { errorMessage } from "@/shared/depth/error";

const id = PublicKey.unique();
const nonce = 71n;
function fixture(
  phase: TradeFlowSnapshot["phase"],
  order?: TradeFlowSnapshot["order"],
) {
  const calls: bigint[] = [];
  const sdk = {
    trade: {
      flow: (value: bigint) => {
        calls.push(value);
        return { status: async () => ({ id, allocationId: id, phase, order }) };
      },
      submit: () => assert.fail("Reconciliation must not submit a trade"),
    },
  } as unknown as DepthClient;
  return { sdk, calls };
}
const rejected = (code: string) =>
  new DepthError(
    code,
    "submission",
    "Rejected",
    true,
    "Check the original flow",
    id.toBase58(),
  );

test("a declined or rejected first transaction unlocks only after confirming no receipt exists", async () => {
  for (const code of ["WALLET_REJECTED", "SUBMISSION_REJECTED"]) {
    const f = fixture("unstarted");
    assert.equal(
      (await reconcileTrade(f.sdk, nonce, rejected(code))).resolved,
      true,
    );
    assert.deepEqual(f.calls, [nonce]);
  }
});

test("an uncertain send with no visible receipt preserves the original request", async () => {
  const f = fixture("unstarted");
  for (const cause of [
    undefined,
    rejected("SUBMISSION_UNCONFIRMED"),
    new Error("Failed to fetch"),
  ]) {
    const result = await reconcileTrade(f.sdk, nonce, cause);
    assert.equal(result.resolved, false);
    assert.equal(result.message, "No trade confirmed");
  }
  assert.deepEqual(f.calls, [nonce, nonce, nonce]);
});

test("declining a later approval preserves the existing margin allocation", async () => {
  for (const phase of ["allocating", "allocated", "order"] as const) {
    const f = fixture(phase);
    assert.equal(
      (await reconcileTrade(f.sdk, nonce, rejected("WALLET_REJECTED")))
        .resolved,
      false,
    );
    assert.deepEqual(f.calls, [nonce]);
  }
});

test("terminal receipts resolve the ticket with the actual outcome", async () => {
  for (const outcome of ["filled", "cancelled"] as const) {
    const order = {
      status: "finalized",
      outcome,
    } as TradeFlowSnapshot["order"];
    const f = fixture("order", order);
    const result = await reconcileTrade(f.sdk, nonce);
    assert.equal(result.resolved, true);
    assert.equal(result.message, `Trade ${outcome}`);
  }
  const f = fixture("failed");
  assert.equal((await reconcileTrade(f.sdk, nonce)).resolved, true);
});

test("failed reconciliation cannot discard the original request", async () => {
  const sdk = {
    trade: {
      flow: () => ({
        status: async () => {
          throw new Error("rpc_unavailable");
        },
      }),
    },
  } as unknown as DepthClient;
  await assert.rejects(
    reconcileTrade(sdk, nonce, rejected("WALLET_REJECTED")),
    /rpc_unavailable/,
  );
});

test("uncertain confirmation never suggests an unchecked retry, including nested expiry", () => {
  const cause = new DepthError(
    "SUBMISSION_UNCONFIRMED",
    "submission",
    "Submission was not confirmed",
    true,
    "Reconcile",
    id.toBase58(),
    { cause: new Error("Block height exceeded") },
  );
  assert.equal(
    errorMessage(cause),
    "Submission interrupted. Check the pending operation before retrying.",
  );
  assert.equal(
    errorMessage(
      new DepthError(
        "WALLET_REJECTED",
        "submission",
        "Wallet approval declined",
        true,
        "Check the flow",
      ),
    ),
    "Wallet approval declined",
  );
});
