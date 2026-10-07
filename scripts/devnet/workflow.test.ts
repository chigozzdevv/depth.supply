import { Keypair } from "@solana/web3.js";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { callbackTargets } from "@/devnet/callback";
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

test("errors hide HTTP and WebSocket RPC credentials", () => {
  const error =
    "Failed https://rpc.example/secret-token and wss://rpc.example?key=secret-token";
  assert.equal(safeError(error), "Failed [RPC endpoint] and [RPC endpoint]");
});
