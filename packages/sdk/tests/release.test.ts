import assert from "node:assert/strict";
import { test } from "node:test";
import { releasableMargin } from "@/account/release";

test("releasable margin retains risk, quotes, losses, and funding owed", () => {
  const available = releasableMargin(
    {
      collateral: 1_000_000_000n,
      reserved: 100_000_000n,
      position: 1_000_000_000n,
      entryPriceE8: 20_000_000_000n,
      fundingCheckpoint: 0n,
    },
    19_000_000_000n,
    100_000_000n,
    1_000
  );
  assert.equal(available, 870_000_000n);
});

test("releasable margin returns all unencumbered collateral", () => {
  assert.equal(
    releasableMargin(
      {
        collateral: 500_000_000n,
        reserved: 0n,
        position: 0n,
        entryPriceE8: 0n,
        fundingCheckpoint: 0n,
      },
      20_000_000_000n,
      0n,
      1_000
    ),
    500_000_000n
  );
});
