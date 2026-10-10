import * as anchor from "@anchor-lang/core";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { create_depth } from "@depthhq/sdk";
import {
  workflowPath,
  devnetContext,
  loadSigner,
  readJson,
  safeError,
  type Proof,
} from "@/devnet/context";

try {
  const context = await devnetContext();
  const trader = await loadSigner("trader");
  const app = await loadSigner("app");
  const proof = await readJson<Proof>(workflowPath());
  const previous = [...proof.results]
    .reverse()
    .find((item) => item.stage === "trade_close_filled");
  assert.ok(
    previous,
    "Run the devnet round trip before recovering closed execution history",
  );
  const order = await context.maker.read<{ nonce: anchor.BN }>(
    "OrderRecord",
    new PublicKey(String(previous.order)),
  );
  const sdk = await create_depth({
    environment: "devnet",
    wallet: new anchor.Wallet(trader),
    appId: app.publicKey,
    connection: context.connection,
    deployment: {
      manifest: context.manifest,
      trustedSigner: context.owner.publicKey,
    },
  });
  const detail = await sdk.history.execution(BigInt(order.nonce.toString()));
  assert.equal(detail.pnl?.state, "closed");
  assert.equal(detail.id.toBase58(), String(previous.order));
  assert.equal(detail.fill.status, "ready");
  const rediscovered = await sdk.trade
    .operation(BigInt(order.nonce.toString()))
    .pnl();
  assert.deepEqual(rediscovered, detail.pnl);
  const result = {
    testedAt: new Date().toISOString(),
    owner: trader.publicKey.toBase58(),
    order: detail.id.toBase58(),
    transaction: detail.transaction,
    pnl: detail.pnl,
    fill: detail.fill,
  };
  console.info(
    JSON.stringify(
      result,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
}
