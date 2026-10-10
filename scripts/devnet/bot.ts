import * as anchor from "@anchor-lang/core";
import assert from "node:assert/strict";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { create_depth_maker } from "@depthhq/maker-sdk";
import {
  create_maker_bot,
  type BotPolicy,
  type BotSnapshot,
} from "@depthhq/maker-sdk/node";
import { createSigner } from "@/workspace/signers";
import { resolvePath } from "@/workspace";
import { OracleService } from "@/server/features/oracle/oracle.service";
import { QuoteWorker } from "@/server/features/quote/quote.worker";
import {
  devnetContext,
  safeError,
  sleep,
  type ProofMarket,
} from "@/devnet/context";

try {
  const context = await devnetContext();
  const { maker: owner, connection, chain } = context;
  const oracle = new OracleService(
    chain,
    (await owner.read<ProofMarket>("Market", owner.marketAddress))
      .oracleAccount,
  );
  await oracle.advance();
  let market = await owner.read<ProofMarket>("Market", owner.marketAddress);
  if ("paused" in market.status) {
    assert.ok(
      ["manualPause", "missedFunding", "staleOracle"].includes(
        Object.keys(market.incident)[0],
      ),
      "Resolve the market incident before running the bot",
    );
    let backstop = owner.backstop(market.backstopOffer);
    const prior = await backstop.status();
    if (prior.expiresAt <= Math.floor(Date.now() / 1000)) {
      const release = await backstop.release();
      await release.confirm({ timeoutMs: 180000 });
      await backstop.close();
      await oracle.advance();
      backstop = await owner.backstop.offer({
        marketId: "SOL-USD",
        maxCapacity: prior.capacity,
        validForSeconds: 86400,
      });
      await backstop.confirm({ timeoutMs: 180000 });
    }
    await oracle.advance();
    const protocol = await owner.read<{ vault: PublicKey }>(
      "Protocol",
      owner.protocolAddress,
    );
    await chain.program.methods
      .resumeMarket()
      .accountsPartial({
        authority: context.owner.publicKey,
        protocol: owner.protocolAddress,
        market: owner.marketAddress,
        clearing: chain.clearing,
        backstopOffer: backstop.id,
        vault: protocol.vault,
      })
      .rpc({ commitment: "confirmed" });
  }
  market = await owner.read<ProofMarket>("Market", owner.marketAddress);
  assert.ok("active" in market.status && "none" in market.incident);
  const operator = createSigner("maker");
  if (
    (await connection.getBalance(operator.publicKey, "confirmed")) < 100_000_000
  ) {
    await chain.provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: context.owner.publicKey,
          toPubkey: operator.publicKey,
          lamports: 250_000_000,
        }),
      ),
    );
  }
  await owner.operator.authorize({
    operator: operator.publicKey,
    maxCapacity: 100_000_000n,
    expiresAt: Math.floor(Date.now() / 1000) + 86400,
    canView: true,
  });
  const maker = await create_depth_maker({
    environment: "devnet",
    connection,
    wallet: new anchor.Wallet(operator),
    makerOwner: context.owner.publicKey,
    deployment: {
      manifest: context.manifest,
      trustedSigner: context.owner.publicKey,
    },
  });
  const policy: BotPolicy = {
    maxCapacity: 100_000_000n,
    maxInventoryNotional: 1_000_000_000n,
    spreadBps: 20,
    repriceBps: 10,
    lifetimeSeconds: 120,
    refreshSeconds: 90,
  };
  const stateDirectory = resolvePath("data/maker");
  let bot = await create_maker_bot({ maker, policy, stateDirectory });
  const worker = new QuoteWorker(chain);
  const run = async (match: (value: BotSnapshot) => boolean) => {
    const deadline = Date.now() + 360000;
    let last = "";
    while (Date.now() < deadline) {
      await oracle.advance();
      await worker.advance();
      const snapshot = await bot.tick();
      const current = JSON.stringify(snapshot);
      if (last !== current) {
        console.info(current);
        last = current;
      }
      if (match(snapshot)) return snapshot;
      await sleep(2000);
    }
    throw new Error(
      "Maker bot did not reach the expected state before its deadline",
    );
  };
  let first: BotSnapshot | undefined;
  let second: BotSnapshot | undefined;
  try {
    first = await run((snapshot) => snapshot.phase === "active");
    const checkpoint = await bot.store.load();
    await bot.close();
    bot = await create_maker_bot({ maker, policy, stateDirectory });
    const restored = await bot.store.load();
    assert.equal(restored.quote, checkpoint.quote);
    assert.equal(
      restored.request?.clientNonce,
      checkpoint.request?.clientNonce,
    );
    assert.deepEqual(restored.fills, checkpoint.fills);
    second = await run(
      (snapshot) =>
        snapshot.phase === "active" && snapshot.quoteId !== first!.quoteId,
    );
    assert.equal(
      (
        await owner.quoteState(new PublicKey(first.quoteId!))
      ).replacementNonce?.toString(),
      (await bot.store.load()).request?.clientNonce.toString(),
    );
  } finally {
    bot.stop();
    try {
      await run((snapshot) => snapshot.phase === "stopped");
    } finally {
      await bot.close();
    }
  }
  console.info(
    JSON.stringify({
      complete: true,
      testedAt: new Date().toISOString(),
      first: first?.quoteId,
      second: second?.quoteId,
      operator: operator.publicKey.toBase58(),
    }),
  );
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
}
