import { Keypair, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { callbackTargets } from "@/devnet/callback";
import { fundingAmounts, makerPosition } from "@/devnet/roundtrip";
import {
  journal,
  readJson,
  safeError,
  writeJson,
  type Proof,
} from "@/devnet/context";

function proof(status: Proof["status"], results: Proof["results"]): Proof {
  return { testedAt: "test", updatedAt: "test", status, results };
}

test("hedge proofs attribute inventory to the maker that actually fills each leg", () => {
  const baseline = -100n;
  const opening = { maker: "primary", side: 1n, size: 20n };
  const closing = { maker: "fallback", side: -1n, size: 20n };
  assert.equal(makerPosition(baseline, "primary", [opening, closing]), -120n);
  assert.equal(makerPosition(0n, "fallback", [opening, closing]), 20n);
  assert.equal(
    makerPosition(baseline, "primary", [
      opening,
      { ...closing, maker: "primary" },
    ]),
    baseline,
  );
  assert.equal(
    makerPosition(baseline, "primary", [{ ...opening, side: -1n }]),
    -80n,
  );
  assert.throws(() =>
    makerPosition(baseline, "primary", [{ ...opening, side: 0n }]),
  );
});

test("callbacks use the latest traded quote and order IDs", () => {
  const [quote, open, close, transfer] = Array.from({ length: 4 }, () =>
    Keypair.generate().publicKey.toBase58(),
  );
  const current = proof("complete", [
    { stage: "activate", quote, status: "active" },
    {
      stage: "trade_round_trip",
      quote,
      openOrder: open,
      closeOrder: close,
      status: "closed",
    },
    { stage: "trader_release_settled", transfer },
  ]);
  current.previousRuns = [
    proof("complete", [
      {
        stage: "trade_round_trip",
        openOrder: Keypair.generate().publicKey.toBase58(),
      },
    ]),
  ];
  assert.deepEqual(
    callbackTargets(current).map((target) => target.address),
    [open, close, quote, transfer],
  );
  assert.throws(
    () => callbackTargets({ ...current, status: "running" }),
    /has not completed/,
  );
  assert.throws(
    () => callbackTargets({ ...current, results: current.results.slice(1) }),
    /was not activated/,
  );
});

test("an interrupted transaction keeps its saved recovery evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-workflow-"));
  const path = join(directory, "nested", "proof.json");
  try {
    for (const stage of [
      "trade_open_requested",
      "submit_reserve",
      "trader_deposit_requested",
    ]) {
      await writeJson(path, proof("running", [{ stage, nonce: "123" }]));
      const saved = await readFile(path, "utf8");
      await assert.rejects(journal(path), /needs recovery or reconciliation/);
      assert.equal(await readFile(path, "utf8"), saved);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("proof writes serialize concurrent settlement and SDK events", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-workflow-"));
  const path = join(directory, "proof.json");
  try {
    await writeJson(
      path,
      proof("failed", [{ stage: "failure", error: "preflight" }]),
    );
    const current = await journal(path);
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        current.record({ stage: "test", index, amount: 1n }),
      ),
    );
    current.proof.status = "complete";
    await current.save();
    const saved = await readJson<Proof>(path);
    assert.equal(saved.status, "complete");
    assert.equal(saved.results.length, 8);
    assert.ok(saved.results.every((entry) => entry.amount === "1"));
    assert.equal(saved.previousRuns?.[0]?.status, "failed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a reported preflight failure can restart while recorded transaction intents still require recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-preflight-"));
  const path = join(directory, "proof.json");
  try {
    const failure = {
      stage: "trade_recovery_required",
      error: "Preflight failed",
    };
    await writeJson(path, proof("failed", [failure]));
    const fresh = await journal(path);
    assert.deepEqual(fresh.proof.previousRuns?.at(-1)?.results, [failure]);
    await writeJson(
      path,
      proof("failed", [
        { stage: "trade_open_requested", nonce: "123" },
        failure,
      ]),
    );
    await assert.rejects(journal(path), /needs recovery or reconciliation/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a reconciled failed proof stays in history when a new run begins", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-workflow-"));
  const path = join(directory, "proof.json");
  try {
    const previous = proof("failed", [
      { stage: "submit_prepare", quote: PublicKey.unique().toBase58() },
      { stage: "failure", error: "oracle race" },
      { stage: "reconciled", pendingOrders: 0, activeQuoteCount: 0 },
    ]);
    await writeJson(path, previous);
    const current = await journal(path);
    assert.equal(current.proof.status, "running");
    assert.equal(current.proof.previousRuns?.at(-1)?.status, "failed");
    assert.deepEqual(
      current.proof.previousRuns?.at(-1)?.results,
      previous.results,
    );
    previous.results.push({ stage: "reserve_requested", nonce: "124" });
    await writeJson(path, previous);
    await assert.rejects(journal(path), /needs recovery or reconciliation/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("resuming an interrupted proof preserves its operation IDs and evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-workflow-"));
  const path = join(directory, "proof.json");
  try {
    const previous = proof("failed", [
      {
        stage: "trade_open_requested",
        order: PublicKey.unique().toBase58(),
        nonce: "123",
      },
      { stage: "trade_open_filled", order: PublicKey.unique().toBase58() },
      { stage: "failure", error: "external service interrupted" },
    ]);
    await writeJson(path, previous);
    const current = await journal(path, true);
    assert.equal(current.proof.status, "running");
    assert.equal(current.proof.testedAt, previous.testedAt);
    assert.deepEqual(current.proof.results, previous.results);
    await current.record({ stage: "resume" });
    assert.equal((await readJson<Proof>(path)).results.length, 4);
    current.proof.status = "complete";
    await current.save();
    await assert.rejects(journal(path, true), /no interrupted proof/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("round-trip funding covers the required buffer and deposits only the shortfall", () => {
  assert.deepEqual(fundingAmounts(3_040_000n, 0n, 0n), {
    allocation: 3_040_000n,
    deposit: 3_040_000n,
  });
  assert.deepEqual(fundingAmounts(3_040_000n, 0n, 3_000_000n), {
    allocation: 3_040_000n,
    deposit: 40_000n,
  });
  assert.deepEqual(fundingAmounts(3_040_000n, 0n, 5_000_000n), {
    allocation: 3_040_000n,
    deposit: 0n,
  });
  assert.deepEqual(fundingAmounts(3_040_000n, 4_000_000n, 0n), {
    allocation: 0n,
    deposit: 0n,
  });
});

test("errors hide HTTP and WebSocket RPC credentials", () => {
  const error =
    "Failed https://rpc.example/secret-token and wss://rpc.example?key=secret-token";
  assert.equal(safeError(error), "Failed [RPC endpoint] and [RPC endpoint]");
});
