import assert from "node:assert/strict";
import { test } from "node:test";
import * as anchor from "@anchor-lang/core";
import { Connection, PublicKey } from "@solana/web3.js";
import { positionPnl } from "@/position/pnl";
import { DepthOperation } from "@/operation/operation";
import type { PositionSnapshot, FillSnapshot } from "@/view/view";

const position: PositionSnapshot = {
  id: PublicKey.unique().toBase58(),
  status: "ready",
  version: 7n,
  slot: 10,
  position: 10_000_000_000n,
  entryPriceE8: 10_000_000_000n,
  collateral: 100_000_000n,
  fundingCheckpoint: 0n,
};
const close: FillSnapshot = {
  id: PublicKey.unique().toBase58(),
  status: "ready",
  slot: 20,
  side: -1n,
  size: 10_000_000_000n,
  executionPriceE8: 10_500_000_000n,
  fee: 630_000n,
};

test("open PnL uses signed exposure and accrued funding without estimating exit fees", () => {
  const long = positionPnl(position, 10_500_000_000n, 10_000_000n);
  assert.equal(long.gross, 50_000_000n);
  assert.equal(long.funding, 1_000_000n);
  assert.equal(long.net, 49_000_000n);
  assert.equal(long.returnBps, 4900n);
  assert.equal(long.fee, 0n);
  assert.equal(long.state, "open");
  const short = positionPnl(
    { ...position, position: -10_000_000_000n },
    10_500_000_000n,
    10_000_000n,
  );
  assert.equal(short.net, -49_000_000n);
  assert.equal(short.side, "short");
  assert.equal(short.returnBps, -4900n);
});

test("closed execution PnL subtracts its actual fill fee once and credits negative funding", () => {
  const result = positionPnl(
    position,
    close.executionPriceE8!,
    -10_000_000n,
    close,
  );
  assert.equal(result.state, "closed");
  assert.equal(result.net, 50_370_000n);
  assert.equal(result.returnBps, 5037n);
  assert.equal(result.fee, close.fee);
});

test("partial reductions realize only closed exposure and settle funding on the old position", () => {
  const result = positionPnl(position, close.executionPriceE8!, 10_000_000n, {
    ...close,
    size: 2_500_000_000n,
    fee: 157_500n,
  });
  assert.equal(result.state, "reduced");
  assert.equal(result.gross, 12_500_000n);
  assert.equal(result.funding, 1_000_000n);
  assert.equal(result.net, 11_342_500n);
});

test("reversals realize the old leg and charge the complete execution fee", () => {
  const result = positionPnl(position, close.executionPriceE8!, 0n, {
    ...close,
    size: 20_000_000_000n,
    fee: 1_260_000n,
  });
  assert.equal(result.state, "reversed");
  assert.equal(result.gross, 50_000_000n);
  assert.equal(result.net, 48_740_000n);
});

test("PnL follows contract integer truncation and never divides by zero collateral", () => {
  const result = positionPnl(
    { ...position, position: -1n, collateral: 0n },
    10_000_000_001n,
    0n,
  );
  assert.equal(result.net, 0n);
  assert.equal(result.returnBps, null);
  assert.throws(
    () => positionPnl({ ...position, status: "stale" }, 1n, 0n),
    /ready/,
  );
  assert.throws(
    () => positionPnl({ ...position, position: 0n }, 1n, 0n),
    /ready/,
  );
  assert.throws(() => positionPnl(position, 0n, 0n), /positive/);
  assert.throws(
    () =>
      positionPnl(position, close.executionPriceE8!, 0n, {
        ...close,
        side: 1n,
      }),
    /opposite/,
  );
});

test("an operation refuses a mismatched private snapshot before requesting its fill", async () => {
  const program = {
    programId: PublicKey.unique(),
    coder: {
      accounts: {
        decode: () => ({
          traderVersion: new anchor.BN(8),
          fundingIndex: new anchor.BN(0),
        }),
      },
    },
  } as unknown as anchor.Program;
  const connection = {
    getAccountInfoAndContext: async () => ({
      context: { slot: 20 },
      value: { owner: program.programId, data: Buffer.alloc(8) },
    }),
  } as unknown as Connection;
  const operation = new DepthOperation(
    PublicKey.unique(),
    undefined,
    program,
    connection,
    undefined,
    position,
  );
  operation.privateResult = async () => {
    throw new Error("Should not request a mismatched fill");
  };
  await assert.rejects(operation.pnl(), /before this execution/);
});

test("an operation reads funding from its own receipt rather than the latest market", async () => {
  const program = {
    programId: PublicKey.unique(),
    coder: {
      accounts: {
        decode: () => ({
          traderVersion: new anchor.BN(7),
          fundingIndex: new anchor.BN(10_000_000),
        }),
      },
    },
  } as unknown as anchor.Program;
  const connection = {
    getAccountInfoAndContext: async () => ({
      context: { slot: 20 },
      value: { owner: program.programId, data: Buffer.alloc(8) },
    }),
  } as unknown as Connection;
  const operation = new DepthOperation(
    PublicKey.unique(),
    undefined,
    program,
    connection,
    undefined,
    position,
  );
  operation.privateResult = async () => ({
    ...close,
    positionId: PublicKey.unique(),
  });
  assert.equal((await operation.pnl()).net, 48_370_000n);
});
