import * as anchor from "@anchor-lang/core";
import {
  DEPTH_PROGRAM_ID,
  balanceAddress,
  depositAddress,
  marketAccountAddress,
  transferAddress,
  solUsdPublishTime,
} from "@depthhq/bindings";
import type { QuoteHandle } from "@depthhq/maker-sdk";
import { PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  BotStore,
  HedgeEngine,
  create_hyperliquid,
} from "@depthhq/maker-sdk/node";
import { hedgeConfig } from "@/server/shared/config/env";
import { resolvePath } from "@/workspace";
import { OracleService } from "@/server/features/oracle/oracle.service";
import { FeeService } from "@/server/features/fee/fee.service";
import { Keeper } from "@/server/features/settlement/settlement.keeper";
import {
  workflowPath,
  defaults,
  devnetContext,
  isMain,
  journal,
  readJson,
  writeJson,
  loadSigner,
  marketId,
  safeError,
  sleep,
  type ProofMarket,
  type ProofQuote,
  type Proof,
} from "@/devnet/context";
import {
  prepareRoundTrip,
  roundTripBudget,
  restoreRoundTrip,
  runRoundTrip,
  runHostedRoundTrip,
} from "@/devnet/roundtrip";

let hedgeStore: BotStore | undefined;

async function main() {
  const args = process.argv.slice(2);
  const resume = args.includes("--resume");
  if (args.includes("--help")) {
    console.info(
      "Usage: pnpm devnet:quote [--audit | --margin | --hedge [--resume] | --hosted [--resume] | --reconcile]\nRuns a real quote and trading proof; --hosted uses the managed maker and keeper and checks worker recovery; --resume restores an interrupted proof; --reconcile verifies closed quotes and completed funding before another run.",
    );
    return;
  }
  assert.ok(
    args.every((arg) =>
      [
        "--audit",
        "--margin",
        "--hedge",
        "--hosted",
        "--reconcile",
        "--resume",
      ].includes(arg),
    ),
    "Unknown quote argument",
  );
  assert.ok(
    args.filter((arg) => arg !== "--resume").length <= 1,
    "Choose one quote proof mode",
  );
  assert.ok(
    !resume || args.includes("--hedge") || args.includes("--hosted"),
    "Resume requires the hedge proof mode",
  );
  const hedgeSettings = args.includes("--hedge")
    ? hedgeConfig({ ...process.env, DEPTH_MAKER_HEDGE: "hyperliquid" })
    : undefined;
  const hedge = hedgeSettings
    ? new HedgeEngine(
        await create_hyperliquid(hedgeSettings),
        hedgeSettings.policy,
      )
    : undefined;
  if (hedge) {
    const external = await hedge.adapter.account();
    assert.ok(
      external.availableMargin >= 30_000_000n,
      "Hedge proof needs at least 30 testnet USDC of available margin",
    );
    if (!resume)
      assert.equal(
        external.position,
        0n,
        "Hedge account must be flat before this round trip",
      );
    hedgeStore = new BotStore(
      PublicKey.default.toBase58(),
      new PublicKey(
        createHash("sha256").update(hedge.adapter.identity).digest(),
      ).toBase58(),
      PublicKey.default.toBase58(),
      resolvePath("data/maker"),
    );
    await hedgeStore.acquire();
    if (!resume)
      assert.ok(
        !(await hedgeStore.load()).hedge?.pending,
        "Reconcile the prior hedge before starting a new proof",
      );
    assert.equal(
      hedge.policy.ratioBps,
      10000,
      "The round-trip proof requires a full hedge target",
    );
  }
  const { owner, connection, wallet, maker, chain } = await devnetContext();
  if (args.includes("--hosted")) {
    const run = await journal(workflowPath(), resume);
    try {
      await runHostedRoundTrip(
        maker,
        run.record,
        run.proof.results,
        resume,
        async () => {
          const state = await readJson<{
            services: { maker: { pid: number } };
          }>(resolvePath("data/runtime/services.json"));
          assert.ok(
            Number.isSafeInteger(state.services.maker.pid) &&
              state.services.maker.pid > 0,
          );
          process.kill(state.services.maker.pid, "SIGKILL");
          await run.record({
            stage: "maker_crash_requested",
            pid: state.services.maker.pid,
          });
          await sleep(5000);
          const restarted = await readJson<typeof state>(
            resolvePath("data/runtime/services.json"),
          );
          assert.notEqual(
            restarted.services.maker.pid,
            state.services.maker.pid,
          );
          await run.record({
            stage: "maker_restarted",
            pid: restarted.services.maker.pid,
          });
        },
      );
      run.proof.status = "complete";
    } catch (error) {
      run.proof.status = "failed";
      await run.record({
        stage: "trade_recovery_required",
        error: safeError(error),
      });
      throw error;
    } finally {
      await run.save();
    }
    return;
  }
  let hedgeLeg = 0;
  let hedgeProof: Proof;
  let recordHedge: (entry: Record<string, unknown>) => Promise<void>;
  const afterFill = hedge
    ? async () => {
        const checkpoint = await hedgeStore!.load();
        checkpoint.hedge ??= {
          identity: hedge.adapter.identity,
          nonce: 0,
          history: [],
        };
        const depthAccount = `${await connection.getGenesisHash()}:${maker.marketAccount().toBase58()}`;
        if (
          checkpoint.hedge.depthAccount &&
          checkpoint.hedge.depthAccount !== depthAccount
        )
          throw new Error("Hedge account is assigned to another Depth maker");
        checkpoint.hedge.depthAccount = depthAccount;
        const prior = new Set(
          hedgeProof.results
            .filter(({ stage }) => stage === "hedge_balanced")
            .flatMap((entry) =>
              (entry.orders as { cloid: string }[]).map((order) => order.cloid),
            ),
        );
        let position:
          Awaited<ReturnType<typeof maker.position.summary>> | undefined;
        const deadline = Date.now() + 120000;
        while (Date.now() < deadline) {
          const account = await maker.read<{
            version: anchor.BN;
            status: Record<string, unknown>;
          }>("MarketAccount", maker.marketAccount(), "finalized");
          if (
            "ready" in account.status &&
            position?.version !== BigInt(account.version.toString())
          )
            position = await maker.position.summary({ timeoutMs: 90000 });
          const finalized = await maker.read<typeof account>(
            "MarketAccount",
            maker.marketAccount(),
            "finalized",
          );
          const confirmed = await maker.read<typeof account>(
            "MarketAccount",
            maker.marketAccount(),
          );
          const ready =
            "ready" in finalized.status &&
            "ready" in confirmed.status &&
            position?.status === "ready" &&
            finalized.version.toString() === confirmed.version.toString() &&
            position.version === BigInt(finalized.version.toString());
          const snapshot = await hedge.tick(
            checkpoint.hedge,
            () => hedgeStore!.save(checkpoint),
            ready ? position?.position : undefined,
          );
          console.info(
            JSON.stringify({
              stage: "hedge",
              phase: snapshot.phase,
              reason: snapshot.reason,
            }),
          );
          if (snapshot.phase === "balanced") {
            const fills = snapshot.history.filter(
              (order) => !prior.has(order.cloid) && order.filledSize > 0n,
            );
            const currentFills = fills.filter(
              (order) => order.nonce >= Date.parse(hedgeProof.testedAt),
            );
            assert.ok(
              currentFills.length > 0 &&
                currentFills.every((order) => order.hashes?.length),
              "Each hedge leg requires new confirmed external fills and transaction hashes",
            );
            const target =
              -(snapshot.depthPosition! / hedge.adapter.sizeStep) *
              hedge.adapter.sizeStep;
            assert.equal(
              snapshot.externalPosition,
              target,
              "External inventory must match the rounded full hedge target",
            );
            if (hedgeLeg === 0) {
              assert.notEqual(
                snapshot.depthPosition,
                0n,
                "The opening trade must produce maker inventory",
              );
              assert.ok(
                currentFills.every((order) => !order.reduceOnly),
                "The opening hedge must increase external exposure",
              );
            } else {
              assert.equal(
                snapshot.depthPosition,
                0n,
                "The closing trade must flatten Depth inventory",
              );
              assert.equal(
                snapshot.externalPosition,
                0n,
                "The closing hedge must flatten external inventory",
              );
              assert.ok(
                currentFills.every((order) => order.reduceOnly),
                "The unwind must use reduce-only orders",
              );
            }
            await recordHedge({
              stage: "hedge_balanced",
              leg: hedgeLeg === 0 ? "open" : "close",
              depthPosition: snapshot.depthPosition,
              externalPosition: snapshot.externalPosition,
              orders: currentFills,
            });
            hedgeLeg++;
            return;
          }
          if (snapshot.phase === "blocked") throw new Error(snapshot.reason);
          await sleep(2000);
        }
        throw new Error("Hedge confirmation exceeded the proof deadline");
      }
    : undefined;
  const program = maker.program;
  type Quote = QuoteHandle;
  const initial = await maker.read<ProofMarket>("Market", maker.marketAddress);
  const oracle = new OracleService(chain, initial.oracleAccount);
  console.info(
    JSON.stringify({
      stage: "audit",
      maker: owner.publicKey.toBase58(),
      sol: (await connection.getBalance(owner.publicKey)) / 1e9,
      activeQuoteCount: initial.activeQuoteCount,
      pendingOrders: initial.pendingOrders,
      status: Object.keys(initial.status)[0],
      incident: Object.keys(initial.incident)[0],
      oracleAge:
        Math.floor(Date.now() / 1_000) - initial.oracleTimestamp.toNumber(),
    }),
  );
  if (args.includes("--audit")) return;
  if (args.includes("--reconcile")) {
    const previous = await readJson<Proof>(workflowPath());
    assert.ok(
      previous.status !== "complete",
      "The preceding proof is already complete",
    );
    const allowedTraderStages = new Set([
      "trader_balance",
      "trader_deposit_requested",
      "trader_deposit_submitted",
      "trader_deposit_credited",
      "trader_allocation_requested",
      "trader_allocation_submitted",
      "trader_allocation_settled",
      "trader_ready",
    ]);
    assert.ok(
      !previous.results.some(
        ({ stage = "" }) =>
          stage.startsWith("trade_") ||
          (stage.startsWith("trader_") && !allowedTraderStages.has(stage)) ||
          ["renew_backstop", "release_backstop", "resume_market"].includes(
            stage,
          ),
      ),
      "Resume and verify the recorded trading or funding operations before reconciling this proof",
    );
    const quotes = new Set<string>();
    for (const entry of previous.results) {
      if (typeof entry.quote === "string") quotes.add(entry.quote);
      if (entry.stage === "quote_prepare_requested")
        quotes.add(
          PublicKey.findProgramAddressSync(
            [
              Buffer.from("quote"),
              maker.marketAddress.toBuffer(),
              owner.publicKey.toBuffer(),
              new anchor.BN(String(entry.nonce)).toArrayLike(Buffer, "le", 8),
            ],
            DEPTH_PROGRAM_ID,
          )[0].toBase58(),
        );
    }
    const accounts = quotes.size
      ? await connection.getMultipleAccountsInfo(
          [...quotes].map((id) => new PublicKey(id)),
          "confirmed",
        )
      : [];
    assert.ok(
      accounts.every((account) => account === null),
      "Cancel and close the recorded quotes before reconciling this proof",
    );
    const current = await maker.read<ProofMarket>(
      "Market",
      maker.marketAddress,
    );
    assert.equal(current.pendingOrders, 0);
    assert.equal(current.activeQuoteCount, 0);
    assert.equal(current.quotedNotional.toString(), "0");
    const account = await maker.read<{ status: Record<string, unknown> }>(
      "MarketAccount",
      maker.marketAccount(),
    );
    assert.ok("ready" in account.status, "Maker account is still processing");
    const deposits = [];
    const transfers = [];
    const requested = previous.results.filter(
      ({ stage }) => stage === "trader_deposit_requested",
    );
    const allocations = previous.results.filter(
      ({ stage }) => stage === "trader_allocation_requested",
    );
    if (requested.length || allocations.length) {
      const trader = await loadSigner("trader");
      for (const entry of requested) {
        const address = depositAddress(
          trader.publicKey,
          BigInt(String(entry.nonce)),
        );
        assert.equal(address.toBase58(), entry.receipt);
        const receipt = await maker.read<{
          owner: PublicKey;
          amount: anchor.BN;
          status: Record<string, unknown>;
        }>("DepositReceipt", address);
        assert.ok(receipt.owner.equals(trader.publicKey));
        assert.ok(
          "credited" in receipt.status,
          "The recorded deposit is not credited",
        );
        assert.equal(receipt.amount.toString(), entry.amount);
        deposits.push({ receipt: address.toBase58(), status: "credited" });
      }
      for (const entry of allocations) {
        const address = transferAddress(
          trader.publicKey,
          BigInt(String(entry.nonce)),
        );
        assert.equal(address.toBase58(), entry.transfer);
        const transfer = await maker.read<{
          owner: PublicKey;
          market: PublicKey;
          amount: anchor.BN;
          toMarket: boolean;
          status: Record<string, unknown>;
        }>("MarginTransfer", address);
        assert.ok(transfer.owner.equals(trader.publicKey));
        assert.ok(transfer.market.equals(maker.marketAddress));
        assert.equal(transfer.toMarket, true);
        assert.equal(transfer.amount.toString(), entry.amount);
        assert.ok(
          "settled" in transfer.status,
          "The recorded allocation is not settled",
        );
        transfers.push({ transfer: address.toBase58(), status: "settled" });
      }
      const balance = await maker.read<{ status: Record<string, unknown> }>(
        "BalanceAccount",
        balanceAddress(trader.publicKey),
      );
      assert.ok(
        "ready" in balance.status,
        "Trader balance is still processing",
      );
      const account = await maker.read<{ status: Record<string, unknown> }>(
        "MarketAccount",
        marketAccountAddress(trader.publicKey),
      );
      assert.ok(
        "ready" in account.status,
        "Trader account is still processing",
      );
    }
    const event = {
      at: new Date().toISOString(),
      stage: "reconciled",
      quotes: [...quotes],
      deposits,
      transfers,
      pendingOrders: 0,
      activeQuoteCount: 0,
      quotedNotional: "0",
    };
    previous.status = "failed";
    previous.updatedAt = event.at;
    previous.results.push(event);
    await writeJson(workflowPath(), previous);
    console.info(JSON.stringify(event));
    return;
  }
  if (args.includes("--margin")) {
    const position = await maker.position.summary({ timeoutMs: 90_000 });
    const balance = await maker.account.summary();
    assert.equal(position.status, "ready");
    assert.equal(balance.status, "ready");
    const signed = position.position!;
    const absolute = signed < 0n ? -signed : signed;
    const price = BigInt(initial.oraclePriceE8.toString());
    const funding = BigInt(initial.fundingIndex.toString());
    const markedMargin =
      (absolute * price * BigInt(initial.config.initialMarginBps) +
        999_999_999_999_999n) /
      1_000_000_000_000_000n;
    const unrealised =
      (signed * (price - position.entryPriceE8!)) / 100_000_000_000n;
    const fundingDue =
      (signed * (funding - position.fundingCheckpoint!)) / 100_000_000_000n;
    const available =
      position.collateral! +
      unrealised -
      fundingDue -
      position.reserved! -
      markedMargin;
    console.info(
      JSON.stringify({
        stage: "authenticated_margin",
        availableQuoteMargin: available.toString(),
        quoteCapacity: defaults.quoteCapacity.toString(),
        freeBalance: balance.amount!.toString(),
      }),
    );
    return;
  }

  if (!hedge)
    assert.ok(
      BigInt(initial.fundingIndex.toString()) < 0n,
      "The signed funding regression requires a market with a negative funding index",
    );
  const { proof, record, save } = await journal(workflowPath(), resume);
  hedgeProof = proof;
  recordHedge = record;
  hedgeLeg = proof.results.filter(
    ({ stage }) => stage === "hedge_balanced",
  ).length;
  await record({
    stage: resume ? "resume" : "begin",
    maker: owner.publicKey.toBase58(),
    market: maker.marketAddress.toBase58(),
    environment: "devnet",
    hedge: Boolean(hedge),
  });
  async function freshOracle() {
    const signature = await oracle.advance();
    if (signature) await record({ stage: "refresh_oracle", signature });
  }
  async function prepared(handle: Quote, tiers: number) {
    const deadline = Date.now() + 90_000;
    for (;;) {
      const snapshot = await handle.status();
      if (snapshot.status !== "validating") {
        const state = await maker.read<ProofQuote>("QuoteRecord", handle.id);
        await record({
          stage: "prepare",
          quote: handle.id.toBase58(),
          signature: handle.prepareSignature,
          status: snapshot.status,
          tiers: state.tierCount,
          capacity: state.capacity.toString(),
          oracleTimestamp: state.oracleTimestamp.toString(),
          fundingIndex: state.fundingIndex.toString(),
        });
        assert.equal(snapshot.status, "validated");
        assert.equal(state.tierCount, tiers);
        return state;
      }
      assert.ok(Date.now() < deadline, "Quote preparation timed out");
      await sleep(500);
    }
  }
  async function close(handle: Quote) {
    const signature = await program.methods
      .closeQuote()
      .accountsPartial({
        maker: owner.publicKey,
        market: maker.marketAddress,
        quote: handle.id,
      })
      .rpc({ commitment: "confirmed" });
    await record({ stage: "close", quote: handle.id.toBase58(), signature });
    assert.equal(await connection.getAccountInfo(handle.id, "confirmed"), null);
  }
  async function cleanup(handle: Quote) {
    const before = await maker.read<ProofMarket>("Market", maker.marketAddress);
    if (before.pendingOrders > 0) {
      await record({
        stage: "cleanup_deferred",
        quote: handle.id.toBase58(),
        pendingOrders: before.pendingOrders,
      });
      return;
    }
    const deadline = Date.now() + 90_000;
    let snapshot = await handle.status();
    while (snapshot.status === "reserving") {
      assert.ok(
        Date.now() < deadline,
        "Reservation is still pending at cleanup",
      );
      await sleep(500);
      snapshot = await handle.status();
    }
    if (
      ["validating", "validated", "waiting", "active", "closing"].includes(
        snapshot.status,
      )
    ) {
      snapshot = await handle.cancel();
      await record({
        stage: "cancel",
        quote: handle.id.toBase58(),
        status: snapshot.status,
        releaseSignature: handle.releaseSignature,
        transactions: (
          await connection.getSignaturesForAddress(handle.id, { limit: 16 })
        ).map(({ signature, err, slot }) => ({ signature, err, slot })),
      });
    }
    if (snapshot.status === "releasing") {
      snapshot = await handle.wait({ timeoutMs: 90_000, pollMs: 500 });
    }
    assert.ok(
      ["cancelled", "rejected", "filled"].includes(snapshot.status),
      `Quote cleanup is ${snapshot.status}`,
    );
    await record({
      stage: "released",
      quote: handle.id.toBase58(),
      status: snapshot.status,
      releaseSignature: handle.releaseSignature,
    });
    await close(handle);
    const market = await maker.read<ProofMarket>("Market", maker.marketAddress);
    assert.equal(market.activeQuoteCount, 0);
    assert.equal(market.quotedNotional.toString(), "0");
    await record({
      stage: "cleanup",
      quote: handle.id.toBase58(),
      status: snapshot.status,
      activeQuoteCount: market.activeQuoteCount,
      pendingOrders: market.pendingOrders,
      quotedNotional: market.quotedNotional.toString(),
    });
  }
  async function ensureActive() {
    await freshOracle();
    const current = await maker.read<ProofMarket>(
      "Market",
      maker.marketAddress,
    );
    if (!("paused" in current.status)) {
      assert.ok("active" in current.status, "Market is unavailable for quotes");
      return;
    }
    const incident = Object.keys(current.incident)[0];
    assert.ok(
      ["manualPause", "staleOracle", "missedFunding"].includes(incident),
      `Market paused for an unexpected reason: ${incident}`,
    );
    assert.equal(current.pendingOrders, 0);
    let backstopId = current.backstopOffer;
    const oldBackstop = maker.backstop(backstopId);
    const oldStatus = await oldBackstop.status();
    if (oldStatus.expiresAt <= Math.floor(Date.now() / 1_000)) {
      const release = await oldBackstop.release();
      await record({
        stage: "release_backstop",
        backstop: backstopId.toBase58(),
        signature: release.signature,
      });
      await release.confirm({ timeoutMs: 90_000 });
      const signature = await oldBackstop.close();
      await record({
        stage: "close_backstop",
        backstop: backstopId.toBase58(),
        signature,
      });
      await freshOracle();
      const renewed = await maker.backstop.offer({
        marketId,
        maxCapacity: oldStatus.capacity,
        validForSeconds: 86_400,
        clientNonce: BigInt(Date.now()),
      });
      await record({
        stage: "renew_backstop",
        backstop: renewed.id.toBase58(),
        signature: renewed.signature,
        capacity: oldStatus.capacity,
      });
      await renewed.confirm({ timeoutMs: 90_000 });
      backstopId = renewed.id;
    } else {
      assert.equal(oldStatus.status, "active");
    }
    await freshOracle();
    const protocol = await maker.read<{ vault: PublicKey }>(
      "Protocol",
      maker.protocolAddress,
    );
    const signature = await program.methods
      .resumeMarket()
      .accountsPartial({
        authority: owner.publicKey,
        protocol: maker.protocolAddress,
        market: maker.marketAddress,
        clearing: chain.clearing,
        backstopOffer: backstopId,
        vault: protocol.vault,
      })
      .rpc({ commitment: "confirmed" });
    await record({
      stage: "resume_market",
      incident,
      signature,
      backstop: backstopId.toBase58(),
    });
    const resumed = await maker.read<ProofMarket>(
      "Market",
      maker.marketAddress,
    );
    assert.ok("active" in resumed.status);
    assert.ok("none" in resumed.incident);
  }

  await save();
  try {
    if (resume) {
      const trader = await restoreRoundTrip(maker, proof.results, 20_000_000n);
      const requested = proof.results.find(
        ({ stage }) => stage === "trade_open_requested",
      )!;
      const openingQuote = new PublicKey(String(requested.quote));
      const keeper = new Keeper(connection, wallet);
      let running = true;
      let workerError: unknown;
      const worker = (async () => {
        while (running) {
          try {
            const progress = await keeper.advance();
            if (progress) await record({ ...progress });
          } catch (error) {
            workerError = error;
            await record({
              stage: "settlement_failure",
              error: safeError(error),
            });
            return;
          }
          await sleep(1000);
        }
      })();
      try {
        const deadline = Date.now() + 90000;
        while (
          (await maker.read<ProofMarket>("Market", maker.marketAddress))
            .pendingOrders > 0
        ) {
          if (workerError) throw workerError;
          assert.ok(
            Date.now() < deadline,
            "Existing settlement is still pending",
          );
          await sleep(2000);
        }
        const quotes = new Set(
          proof.results
            .filter((entry) => typeof entry.quote === "string")
            .map((entry) => String(entry.quote)),
        );
        for (const id of quotes)
          if (await connection.getAccountInfo(new PublicKey(id)))
            await cleanup(maker.quote.get(new PublicKey(id)));
        const opened = await trader.depth.trade
          .operation(trader.nonce)
          .confirm({ timeoutMs: 180000 });
        assert.equal(opened.snapshot.outcome, "filled");
        if (
          !proof.results.some(
            ({ stage, leg }) => stage === "hedge_balanced" && leg === "open",
          )
        )
          await afterFill?.();
        const closeId = trader.depth.trade.operation(trader.nonce + 1n).id;
        if (await connection.getAccountInfo(closeId, "confirmed")) {
          const state = await maker.read<{ selectedQuote: PublicKey }>(
            "OrderRecord",
            closeId,
          );
          assert.ok(
            !state.selectedQuote.equals(PublicKey.default),
            "The saved closing order has no selected quote",
          );
          await runRoundTrip(
            trader,
            maker.quote.get(state.selectedQuote),
            record,
            afterFill,
            { records: proof.results, openingQuote },
          );
        } else {
          await ensureActive();
          const market = await maker.read<ProofMarket>(
            "Market",
            maker.marketAddress,
          );
          const price = BigInt(market.oraclePriceE8.toString());
          const nonce = BigInt(Date.now());
          await record({
            stage: "quote_prepare_requested",
            tiers: 3,
            nonce: nonce.toString(),
          });
          const quote = await maker.quote.publish({
            marketId,
            bidE8: (price * 995n) / 1000n,
            askE8: (price * 1005n) / 1000n,
            maxCapacity: defaults.quoteCapacity,
            validForSeconds: defaults.quoteSeconds,
            clientNonce: nonce,
          });
          await record({
            stage: "submit_prepare",
            tiers: 3,
            quote: quote.id.toBase58(),
            signature: quote.prepareSignature,
          });
          try {
            await prepared(quote, 3);
            const activation = (await quote.confirm({ timeoutMs: 90000 }))
              .snapshot;
            await record({
              stage: "activation_result",
              quote: quote.id.toBase58(),
              status: activation.status,
            });
            assert.equal(
              activation.status,
              "active",
              "Replacement quote did not become active",
            );
            await record({
              stage: "activate",
              quote: quote.id.toBase58(),
              status: "active",
              prepareSignature: quote.prepareSignature,
              reserveSignature: quote.reserveSignature,
            });
            await runRoundTrip(trader, quote, record, afterFill, {
              records: proof.results,
              openingQuote,
            });
            if (workerError) throw workerError;
          } finally {
            await cleanup(quote);
          }
        }
        if (workerError) throw workerError;
      } finally {
        running = false;
        await worker;
      }
    } else {
      assert.equal(initial.pendingOrders, 0);
      assert.equal(initial.activeQuoteCount, 0);
      await ensureActive();
      for (const tierCount of hedge ? [] : [1, 2, 3, 4]) {
        await ensureActive();
        const market = await maker.read<ProofMarket>(
          "Market",
          maker.marketAddress,
        );
        const price = BigInt(market.oraclePriceE8.toString());
        const clientNonce = BigInt(Date.now()) + BigInt(tierCount);
        await record({
          stage: "quote_prepare_requested",
          tiers: tierCount,
          nonce: clientNonce.toString(),
        });
        const handle = await maker.quote.publish({
          tiers: market.config.quoteTiers
            .slice(0, tierCount)
            .map((size: anchor.BN, index: number) => ({
              size: BigInt(size.toString()),
              bidE8: (price * BigInt(9_950 - index * 10)) / 10_000n,
              askE8: (price * BigInt(10_050 + index * 10)) / 10_000n,
            })),
          maxCapacity: defaults.tierCapacity,
          expiresAt: Math.floor(Date.now() / 1_000) + defaults.quoteSeconds,
          clientNonce,
        });
        await record({
          stage: "submit_prepare",
          tiers: tierCount,
          quote: handle.id.toBase58(),
          signature: handle.prepareSignature,
        });
        try {
          await prepared(handle, tierCount);
        } finally {
          await cleanup(handle);
        }
      }

      const trader = await prepareRoundTrip(
        maker,
        record,
        hedge ? 20_000_000n : undefined,
      );
      let overlapProved = false;
      let tradeProved = false;
      for (
        let attempt = 1;
        attempt <= defaults.attempts && !tradeProved;
        attempt++
      ) {
        await ensureActive();
        const market = await maker.read<ProofMarket>(
          "Market",
          maker.marketAddress,
        );
        const price = BigInt(market.oraclePriceE8.toString());
        const clientNonce = BigInt(Date.now());
        await record({
          stage: "quote_prepare_requested",
          attempt,
          tiers: 3,
          nonce: clientNonce.toString(),
        });
        const quote = await maker.quote.publish({
          marketId,
          bidE8: (price * 995n) / 1_000n,
          askE8: (price * 1_005n) / 1_000n,
          maxCapacity: defaults.quoteCapacity,
          validForSeconds: defaults.quoteSeconds,
          clientNonce,
        });
        await record({
          stage: "submit_prepare",
          attempt,
          tiers: 3,
          quote: quote.id.toBase58(),
          signature: quote.prepareSignature,
        });
        try {
          const state = await prepared(quote, 3);
          assert.equal(
            state.capacity.toString(),
            defaults.quoteCapacity.toString(),
          );
          assert.equal(await oracle.advance(), undefined);
          await record({
            stage: "reserve_requested",
            attempt,
            quote: quote.id.toBase58(),
            nonce: clientNonce.toString(),
          });
          await quote.activate({ timeoutMs: 0 });
          const reserved = await maker.read<ProofQuote>(
            "QuoteRecord",
            quote.id,
          );
          await record({
            stage: "submit_reserve",
            attempt,
            quote: quote.id.toBase58(),
            signature: quote.reserveSignature,
          });
          let sawReserving = false;
          let blocked = 0;
          let newerBlocked = 0;
          const deadline = Date.now() + 90_000;
          for (;;) {
            const snapshot = await quote.status();
            if (snapshot.status === "active") break;
            assert.equal(snapshot.status, "reserving");
            sawReserving = true;
            assert.ok(Date.now() < deadline, "Quote reservation timed out");
            const feed = await connection.getAccountInfo(
              initial.oracleAccount,
              "confirmed",
            );
            const feedTimestamp = BigInt(solUsdPublishTime(feed));
            const newer =
              feedTimestamp > BigInt(reserved.oracleTimestamp.toString());
            const signature = await oracle.advance();
            if (signature) {
              await record({
                stage: "refresh_oracle",
                attempt,
                signature,
                duringReservation: true,
              });
              assert.equal((await quote.status()).status, "active");
            } else {
              const remaining = await quote.status();
              const protectedMarket = await maker.read<ProofMarket>(
                "Market",
                maker.marketAddress,
              );
              if (remaining.status === "reserving") {
                assert.equal(
                  protectedMarket.oracleTimestamp.toString(),
                  reserved.oracleTimestamp.toString(),
                );
              }
              const held =
                protectedMarket.oracleTimestamp.toString() ===
                reserved.oracleTimestamp.toString();
              if (held) blocked++;
              if (newer && held) newerBlocked++;
              await record({
                stage: "oracle_guard",
                attempt,
                quote: quote.id.toBase58(),
                beforeStatus: snapshot.status,
                afterStatus: remaining.status,
                feedTimestamp: feedTimestamp.toString(),
                marketTimestamp: protectedMarket.oracleTimestamp.toString(),
                newerFeedBlocked: newer && held,
              });
            }
            await sleep(500);
          }
          const active = await maker.read<ProofQuote>("QuoteRecord", quote.id);
          assert.ok("active" in active.status);
          assert.equal(active.tierCount, 3);
          assert.equal(
            active.capacity.toString(),
            defaults.quoteCapacity.toString(),
          );
          if (!hedge)
            assert.ok(
              BigInt(active.fundingIndex.toString()) < 0n,
              "This regression requires a negative funding snapshot",
            );
          overlapProved = newerBlocked > 0;
          await record({
            stage: "activate",
            attempt,
            tiers: active.tierCount,
            capacity: active.capacity.toString(),
            requiredMargin: active.requiredMargin.toString(),
            fundingIndex: active.fundingIndex.toString(),
            quote: quote.id.toBase58(),
            prepareSignature: quote.prepareSignature,
            reserveSignature: quote.reserveSignature,
            status: "active",
            sawReserving,
            blockedOracleChecks: blocked,
            newerFeedBlockedChecks: newerBlocked,
            oracleOverlapProved: overlapProved,
          });
          if (hedge || overlapProved) {
            const budget = await roundTripBudget(trader, quote);
            if (budget.ready) {
              let running = true;
              let workerError: unknown;
              const keeper = new Keeper(connection, wallet);
              const worker = (async () => {
                while (running) {
                  try {
                    const progress = await keeper.advance();
                    if (progress)
                      await record({
                        stage: progress.stage,
                        order: progress.order,
                        signature: progress.signature,
                      });
                  } catch (error) {
                    workerError = error;
                    await record({
                      stage: "settlement_failure",
                      error: safeError(error),
                    });
                    return;
                  }
                  await sleep(1_000);
                }
              })();
              try {
                await runRoundTrip(trader, quote, record, afterFill);
                if (workerError) throw workerError;
              } finally {
                running = false;
                await worker;
              }
              tradeProved = true;
            } else {
              await record({
                stage: "requote_for_trade",
                attempt,
                quote: quote.id.toBase58(),
                remainingSeconds: budget.remaining,
              });
              overlapProved = false;
            }
          }
        } finally {
          await cleanup(quote);
        }
      }
      if (!hedge)
        assert.ok(
          overlapProved,
          "Activations completed, but no newer oracle update overlapped reservation in three attempts",
        );
      assert.ok(
        tradeProved,
        "The active quote trading round trip was not proved",
      );
    }
    const orders = [
      ...new Set(
        proof.results
          .filter(
            (entry) =>
              entry.stage === "trade_open_filled" ||
              entry.stage === "trade_close_filled",
          )
          .map((entry) => String(entry.order)),
      ),
    ].map((id) => new PublicKey(id));
    assert.equal(orders.length, 2);
    const fees = new FeeService(chain);
    const keeper = new Keeper(connection, wallet);
    const feeDeadline = Date.now() + 240_000;
    for (;;) {
      const states = await Promise.all(
        orders.map(async (order) => {
          const state = await chain.read<{
            feesClaimed: boolean;
            status: Record<string, unknown>;
          }>("OrderRecord", order);
          assert.ok("filled" in state.status);
          return { order: order.toBase58(), feesClaimed: state.feesClaimed };
        }),
      );
      if (states.every((state) => state.feesClaimed)) {
        await record({ stage: "fees_claimed", orders: states });
        break;
      }
      assert.ok(Date.now() < feeDeadline, "Fee claims timed out");
      const progress = await keeper.advance();
      if (progress)
        await record({
          stage: progress.stage,
          order: progress.order,
          signature: progress.signature,
        });
      const signature = await fees.advance();
      if (signature) await record({ stage: "claim_trade_fees", signature });
      await sleep(1_000);
    }
    await freshOracle();
    const finished = await maker.read<ProofMarket>(
      "Market",
      maker.marketAddress,
    );
    assert.equal(finished.pendingOrders, 0);
    assert.equal(finished.activeQuoteCount, 0);
    assert.equal(finished.quotedNotional.toString(), "0");
    await record({
      stage: "complete",
      pendingOrders: 0,
      activeQuoteCount: 0,
      quotedNotional: "0",
    });
    proof.status = "complete";
    await save();
  } catch (error) {
    proof.status = "failed";
    await record({ stage: "failure", error: safeError(error) });
    throw error;
  }
}

if (isMain(import.meta.url))
  void main()
    .finally(() => hedgeStore?.release())
    .catch((error: unknown) => {
      console.error(safeError(error));
      process.exitCode = 1;
    });
