import * as anchor from "@anchor-lang/core";
import { solUsdPublishTime } from "@depthhq/bindings";
import type { QuoteHandle } from "@depthhq/maker-sdk";
import { PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { OracleService } from "@/server/features/oracle/oracle.service";
import { FeeService } from "@/server/features/fee/fee.service";
import { Keeper } from "@/server/features/settlement/settlement.keeper";
import {
  artifactPath,
  defaults,
  devnetContext,
  isMain,
  journal,
  marketId,
  safeError,
  sleep,
  writeJson,
  type ProofMarket,
  type ProofQuote,
} from "@/devnet/context";
import {
  prepareRoundTrip,
  roundTripBudget,
  runRoundTrip,
} from "@/devnet/roundtrip";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.info(
      "Usage: pnpm devnet:quote [--audit | --margin]\nWithout flags, runs a real quote and trading proof on the configured devnet deployment.",
    );
    return;
  }
  assert.ok(
    args.every((arg) => ["--audit", "--margin"].includes(arg)),
    "Unknown quote argument",
  );
  assert.ok(args.length <= 1, "Choose either --audit or --margin");
  const { owner, connection, wallet, maker, chain } = await devnetContext();
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
    await writeJson(artifactPath("margin-proof"), {
      position,
      oraclePrice: price,
      fundingIndex: funding,
      initialMarginBps: initial.config.initialMarginBps,
      availableQuoteMargin: available,
    });
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

  assert.ok(
    BigInt(initial.fundingIndex.toString()) < 0n,
    "The signed funding regression requires a market with a negative funding index",
  );
  const { proof, record, save } = await journal(artifactPath("quote-proof"));
  await record({
    stage: "begin",
    maker: owner.publicKey.toBase58(),
    market: maker.marketAddress.toBase58(),
    environment: "devnet",
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
    assert.equal(market.pendingOrders, 0);
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
    assert.equal(initial.pendingOrders, 0);
    assert.equal(initial.activeQuoteCount, 0);
    await ensureActive();
    for (const tierCount of [1, 2, 3, 4]) {
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

    const trader = await prepareRoundTrip(maker, record);
    let overlapProved = false;
    let tradeProved = false;
    for (
      let attempt = 1;
      attempt <= defaults.attempts && !overlapProved;
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
        const reserved = await maker.read<ProofQuote>("QuoteRecord", quote.id);
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
        if (overlapProved) {
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
              await runRoundTrip(trader, quote, record);
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
    assert.ok(
      overlapProved,
      "Activations completed, but no newer oracle update overlapped reservation in three attempts",
    );
    assert.ok(
      tradeProved,
      "The active quote trading round trip was not proved",
    );
    const orders = proof.results
      .filter(
        (entry) =>
          entry.stage === "trade_open_filled" ||
          entry.stage === "trade_close_filled",
      )
      .map((entry) => new PublicKey(String(entry.order)));
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
  void main().catch((error: unknown) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
