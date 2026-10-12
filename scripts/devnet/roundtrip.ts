import * as anchor from "@anchor-lang/core";
import {
  createDepth,
  type DepthClient,
  type DepthOperation,
  type BalanceSnapshot,
  type PositionSnapshot,
} from "@depthhq/sdk";
import type { MakerClient, QuoteHandle } from "@depthhq/maker-sdk";
import { PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import {
  defaults,
  loadSigner,
  marketId,
  safeError,
  type Recorder,
  type ProofRecord,
} from "@/devnet/context";

type RoundTripContext = {
  maker: MakerClient;
  depth: DepthClient;
  nonce: bigint;
  started: boolean;
  initialCollateral: bigint;
  initialReserved: bigint;
  initialFreeBalance: bigint;
  allocationAmount: bigint;
  depositAmount: bigint;
  tradeNotional: bigint;
};

export function fundingAmounts(
  required: bigint,
  collateral: bigint,
  freeBalance: bigint,
) {
  const shortfall = required - collateral;
  const allocation =
    shortfall <= 0n
      ? 0n
      : shortfall > defaults.allocation
        ? shortfall
        : defaults.allocation;
  const deposit = allocation > freeBalance ? allocation - freeBalance : 0n;
  return { allocation, deposit };
}

export async function prepareRoundTrip(
  maker: MakerClient,
  record: Recorder,
  tradeNotional = defaults.tradeNotional,
): Promise<RoundTripContext> {
  const trader = await loadSigner("trader");
  const app = await loadSigner("app");
  const depth = await createDepth({
    environment: "devnet",
    connection: maker.options.connection,
    deployment: maker.options.deployment,
    appId: app.publicKey,
    wallet: new anchor.Wallet(trader),
  });
  let position: PositionSnapshot = await depth.position.summary({
    timeoutMs: 90_000,
  });
  assert.equal(position.status, "ready", "Trader position is unavailable");
  assert.equal(position.position, 0n, "Trader must be flat before the proof");
  assert.notEqual(position.collateral, undefined);
  assert.notEqual(position.reserved, undefined);
  const market = await depth.market();
  const required =
    (tradeNotional *
      BigInt(10_000 + defaults.slippageBps) *
      BigInt(market.state.config.initialMarginBps) +
      99_999_999n) /
      100_000_000n +
    defaults.maxFee;
  let balance: BalanceSnapshot = await depth.account.summary({
    timeoutMs: 90_000,
  });
  assert.equal(balance.status, "ready", "Trader free balance is unavailable");
  assert.notEqual(balance.amount, undefined);
  const context: RoundTripContext = {
    maker,
    depth,
    nonce: BigInt(Date.now()),
    started: false,
    initialCollateral: position.collateral!,
    initialReserved: position.reserved!,
    initialFreeBalance: balance.amount!,
    allocationAmount: 0n,
    depositAmount: 0n,
    tradeNotional,
  };
  await record({
    stage: "trader_balance",
    trader: trader.publicKey.toBase58(),
    position: position.id,
    freeBalance: balance.amount!.toString(),
    collateral: context.initialCollateral.toString(),
    reserved: context.initialReserved.toString(),
    requiredMargin: required.toString(),
    nonce: context.nonce.toString(),
  });
  if (position.collateral! - position.reserved! < required) {
    const funding = fundingAmounts(
      required,
      position.collateral! - position.reserved!,
      balance.amount!,
    );
    const amount = funding.allocation;
    if (balance.amount! < amount) {
      const mint = market.state.settlementMint;
      const depositNonce = context.nonce + 4n;
      const id = depth.account.depositHandle(depositNonce).id;
      await record({
        stage: "trader_deposit_requested",
        receipt: id.toBase58(),
        nonce: depositNonce.toString(),
        mint: mint.toBase58(),
        amount: funding.deposit.toString(),
        originalFreeBalance: context.initialFreeBalance.toString(),
      });
      const deposit = await depth.account.deposit(
        funding.deposit,
        depositNonce,
      );
      await record({
        stage: "trader_deposit_submitted",
        receipt: deposit.id.toBase58(),
        signature: deposit.signature,
        nonce: depositNonce.toString(),
        amount: funding.deposit.toString(),
      });
      assert.equal(await deposit.confirm({ timeoutMs: 180_000 }), "credited");
      context.depositAmount = funding.deposit;
      balance = await depth.account.summary({ timeoutMs: 90_000 });
      assert.equal(balance.status, "ready");
      assert.equal(
        balance.amount,
        context.initialFreeBalance + funding.deposit,
      );
      await record({
        stage: "trader_deposit_credited",
        receipt: deposit.id.toBase58(),
        signature: deposit.signature,
        amount: funding.deposit.toString(),
        freeBalance: balance.amount!.toString(),
      });
    }
    assert.ok(
      balance.amount! >= amount,
      `Trader needs ${amount} micro-USDC in its free balance for this proof`,
    );
    assert.ok(
      position.collateral! - position.reserved! + amount >= required,
      "The proof allocation is insufficient for this market",
    );
    const allocationNonce = context.nonce + 2n;
    const id = depth.account.transferHandle(allocationNonce).id;
    await record({
      stage: "trader_allocation_requested",
      transfer: id.toBase58(),
      nonce: allocationNonce.toString(),
      amount: amount.toString(),
      originalCollateral: context.initialCollateral.toString(),
      originalReserved: context.initialReserved.toString(),
      originalFreeBalance: context.initialFreeBalance.toString(),
      availableFreeBalance: balance.amount!.toString(),
    });
    const allocation = await depth.account.allocate(
      { marketId, amount },
      allocationNonce,
    );
    await record({
      stage: "trader_allocation_submitted",
      transfer: allocation.id.toBase58(),
      signature: allocation.signature,
      nonce: allocationNonce.toString(),
      amount: amount.toString(),
    });
    const allocated = await allocation.confirm({ timeoutMs: 180_000 });
    assert.equal(allocated.toMarket, true);
    assert.equal(allocated.amount, amount);
    context.allocationAmount = amount;
    position = await depth.position.summary({ timeoutMs: 90_000 });
    assert.equal(position.status, "ready");
    assert.equal(position.position, 0n);
    assert.equal(position.collateral, context.initialCollateral + amount);
    assert.equal(position.reserved, context.initialReserved);
    await record({
      stage: "trader_allocation_settled",
      transfer: allocation.id.toBase58(),
      signature: allocation.signature,
      amount: amount.toString(),
      collateral: position.collateral!.toString(),
      reserved: position.reserved!.toString(),
    });
  }
  assert.ok(
    position.collateral! - position.reserved! >= required,
    `Trader needs at least ${required} micro-USDC of allocated margin`,
  );
  await record({
    stage: "trader_ready",
    trader: trader.publicKey.toBase58(),
    app: app.publicKey.toBase58(),
    position: position.id,
    nonce: context.nonce.toString(),
  });
  return context;
}

export async function restoreRoundTrip(
  maker: MakerClient,
  records: ProofRecord[],
  tradeNotional: bigint,
): Promise<RoundTripContext> {
  const original = records.find(({ stage }) => stage === "trader_balance");
  const ready = records.find(({ stage }) => stage === "trader_ready");
  assert.ok(original && ready, "The saved trader context is missing");
  assert.equal(original.nonce, ready.nonce);
  const trader = await loadSigner("trader");
  const app = await loadSigner("app");
  assert.equal(ready.trader, trader.publicKey.toBase58());
  assert.equal(ready.app, app.publicKey.toBase58());
  const depth = await createDepth({
    environment: "devnet",
    connection: maker.options.connection,
    deployment: maker.options.deployment,
    appId: app.publicKey,
    wallet: new anchor.Wallet(trader),
  });
  const nonce = BigInt(String(ready.nonce));
  const requested = records.find(
    ({ stage }) => stage === "trade_open_requested",
  );
  assert.ok(requested, "The opening operation was not recorded");
  assert.equal(requested.nonce, nonce.toString());
  assert.equal(requested.order, depth.trade.operation(nonce).id.toBase58());
  return {
    maker,
    depth,
    nonce,
    started: false,
    initialCollateral: BigInt(String(original.collateral)),
    initialReserved: BigInt(String(original.reserved)),
    initialFreeBalance: BigInt(String(original.freeBalance)),
    allocationAmount: records
      .filter(({ stage }) => stage === "trader_allocation_settled")
      .reduce((sum, entry) => sum + BigInt(String(entry.amount)), 0n),
    depositAmount: records
      .filter(({ stage }) => stage === "trader_deposit_credited")
      .reduce((sum, entry) => sum + BigInt(String(entry.amount)), 0n),
    tradeNotional,
  };
}

export async function roundTripBudget(
  context: RoundTripContext,
  quote: QuoteHandle,
) {
  const state = await context.maker.quoteState(quote.id);
  assert.ok("active" in state.status, "Round trip requires an active quote");
  assert.equal(state.capacity.toString(), defaults.quoteCapacity.toString());
  const remaining = state.expiry.toNumber() - Math.floor(Date.now() / 1_000);
  return { remaining, ready: remaining >= 90 };
}

export async function runHostedRoundTrip(
  maker: MakerClient,
  record: Recorder,
  records: ProofRecord[],
  resume = false,
  afterOpen?: () => Promise<void>,
) {
  await maker.hedges.authorize();
  const context = resume
    ? await restoreRoundTrip(maker, records, 20_000_000n)
    : await prepareRoundTrip(maker, record, 20_000_000n);
  const { depth, nonce } = context;
  const waitHedge = async (leg: string) => {
    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
      const view = await maker.hedges.summary();
      assert.ok(view.enabled, "The managed maker must have hedging enabled");
      if (
        view.snapshot?.phase === "balanced" &&
        view.snapshot.depthPosition !== undefined &&
        view.snapshot.externalPosition !== undefined &&
        !view.snapshot.pending
      ) {
        const history = view.snapshot.history.filter(
          (order) =>
            order.status === "filled" &&
            order.nonce >= Number(nonce) &&
            order.orderId !== undefined &&
            order.filledSize !== "0" &&
            order.hashes?.length,
        );
        if (
          (leg === "open" &&
            history.some((order) => order.buy && !order.reduceOnly) &&
            BigInt(view.snapshot.depthPosition) < 0n &&
            BigInt(view.snapshot.externalPosition) > 0n) ||
          (leg === "close" &&
            history.some((order) => !order.buy && order.reduceOnly) &&
            BigInt(view.snapshot.depthPosition) === 0n &&
            BigInt(view.snapshot.externalPosition) === 0n)
        ) {
          await record({
            stage: "hedge_balanced",
            leg,
            depthPosition: view.snapshot.depthPosition,
            externalPosition: view.snapshot.externalPosition,
            orders: history.map(
              ({ cloid, orderId, buy, filledSize, filledAt, hashes }) => ({
                cloid,
                orderId,
                buy,
                filledSize,
                filledAt,
                hashes,
              }),
            ),
          });
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error(`Managed maker hedge did not balance the ${leg} leg`);
  };
  const execute = async (leg: "open" | "close") => {
    const id = nonce + (leg === "close" ? 1n : 0n);
    const prior = records.find(
      (entry) => entry.stage === `trade_${leg}_requested`,
    );
    if (!prior)
      await record({
        stage: `trade_${leg}_requested`,
        nonce: id.toString(),
        order: depth.trade.operation(id).id.toBase58(),
      });
    let operation = depth.trade.operation(id);
    const exists = await depth.options.connection.getAccountInfo(
      operation.id,
      "confirmed",
    );
    if (!exists) {
      const deadline = Date.now() + 180_000;
      for (;;) {
        const market = await depth.catalog.market(marketId);
        if (
          market.activeQuoteIds.length &&
          (await depth.market()).state.pendingOrders === 0
        )
          break;
        if (Date.now() >= deadline)
          throw new Error("Managed maker has no available quote");
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      const terms = {
        marketId,
        slippageBps: defaults.slippageBps,
        maxFee: defaults.maxFee,
        validForSeconds: 300,
        clientNonce: id,
      } as const;
      operation =
        leg === "open"
          ? await depth.trade.submit({
              ...terms,
              direction: "long",
              notional: context.tradeNotional,
              margin: 0n,
            })
          : await depth.trade.close(terms);
      await record({
        stage: `trade_${leg}_submitted`,
        nonce: id.toString(),
        order: operation.id.toBase58(),
        signature: operation.signature,
      });
    }
    const result = await operation.confirm({ timeoutMs: 300_000 });
    assert.equal(result.snapshot.outcome, "filled");
    await record({
      stage: `trade_${leg}_filled`,
      order: operation.id.toBase58(),
    });
  };
  await execute("open");
  if (
    !records.some(
      (entry) => entry.stage === "hedge_balanced" && entry.leg === "open",
    )
  )
    await waitHedge("open");
  if (
    afterOpen &&
    !records.some((entry) => entry.stage === "maker_restarted")
  ) {
    await afterOpen();
    await maker.hedges.authorize();
  }
  await execute("close");
  if (
    !records.some(
      (entry) => entry.stage === "hedge_balanced" && entry.leg === "close",
    )
  )
    await waitHedge("close");
  const position = await depth.position.summary({ timeoutMs: 180_000 });
  assert.equal(position.status, "ready");
  assert.equal(position.position, 0n);
  await record({
    stage: "hosted_round_trip_complete",
    trader: depth.options.wallet.publicKey.toBase58(),
    nonce: nonce.toString(),
  });
}

export async function runRoundTrip(
  context: RoundTripContext,
  quote: QuoteHandle,
  record: Recorder,
  afterFill?: () => Promise<void>,
  resume?: { records: ProofRecord[]; openingQuote: PublicKey },
) {
  assert.equal(context.started, false, "This trader proof has already started");
  const { remaining, ready } = resume
    ? { remaining: 0, ready: true }
    : await roundTripBudget(context, quote);
  if (!ready) {
    await record({
      stage: "trade_skipped",
      quote: quote.id.toBase58(),
      remaining,
    });
    throw new Error(
      "Quote needs at least 90 seconds remaining for the round trip",
    );
  }
  context.started = true;
  let open: DepthOperation | undefined;
  let close: DepthOperation | undefined;
  try {
    if (!resume)
      await record({
        stage: "trade_open_requested",
        order: context.depth.trade.operation(context.nonce).id.toBase58(),
        nonce: context.nonce.toString(),
        quote: quote.id.toBase58(),
      });
    open = resume
      ? context.depth.trade.operation(context.nonce)
      : await context.depth.trade.submit({
          marketId,
          direction: "long",
          notional: context.tradeNotional,
          margin: 0n,
          slippageBps: defaults.slippageBps,
          maxFee: defaults.maxFee,
          validForSeconds: 300,
          clientNonce: context.nonce,
        });
    if (!resume)
      await record({
        stage: "trade_open_submitted",
        order: open.id.toBase58(),
        signature: open.signature,
        quote: quote.id.toBase58(),
      });
    const opened = await open.confirm({ timeoutMs: 180_000 });
    assert.equal(opened.snapshot.outcome, "filled");
    const openRecord = await context.maker.read<{ selectedQuote: PublicKey }>(
      "OrderRecord",
      open.id,
    );
    assert.ok(
      openRecord.selectedQuote.equals(resume?.openingQuote ?? quote.id),
    );
    if (!resume?.records.some(({ stage }) => stage === "trade_open_filled"))
      await record({ stage: "trade_open_filled", order: open.id.toBase58() });
    if (
      !resume?.records.some(
        ({ stage, leg }) => stage === "hedge_balanced" && leg === "open",
      )
    )
      await afterFill?.();
    const closeId = context.depth.trade.operation(context.nonce + 1n).id;
    const existingClose = await context.maker.options.connection.getAccountInfo(
      closeId,
      "confirmed",
    );
    if (!resume?.records.some(({ stage }) => stage === "trade_close_requested"))
      await record({
        stage: "trade_close_requested",
        order: context.depth.trade.operation(context.nonce + 1n).id.toBase58(),
        nonce: (context.nonce + 1n).toString(),
        quote: quote.id.toBase58(),
      });
    close = existingClose
      ? context.depth.trade.operation(context.nonce + 1n)
      : await context.depth.trade.close({
          marketId,
          slippageBps: defaults.slippageBps,
          maxFee: defaults.maxFee,
          validForSeconds: 300,
          clientNonce: context.nonce + 1n,
        });
    if (!existingClose)
      await record({
        stage: "trade_close_submitted",
        order: close.id.toBase58(),
        signature: close.signature,
        quote: quote.id.toBase58(),
      });
    const closed = await close.confirm({ timeoutMs: 180_000 });
    assert.equal(closed.snapshot.outcome, "filled");
    const closeRecord = await context.maker.read<{ selectedQuote: PublicKey }>(
      "OrderRecord",
      close.id,
    );
    assert.ok(closeRecord.selectedQuote.equals(quote.id));
    if (!resume?.records.some(({ stage }) => stage === "trade_close_filled"))
      await record({ stage: "trade_close_filled", order: close.id.toBase58() });
    if (
      !resume?.records.some(
        ({ stage, leg }) => stage === "hedge_balanced" && leg === "close",
      )
    )
      await afterFill?.();
    const openFill = await open.privateResult({ timeoutMs: 90_000 });
    const closeFill = await close.privateResult({ timeoutMs: 90_000 });
    assert.equal(openFill.status, "ready");
    assert.equal(closeFill.status, "ready");
    assert.equal(openFill.side, 1n);
    assert.equal(closeFill.side, -1n);
    assert.equal(openFill.size, closeFill.size);
    assert.ok(openFill.size! > 0n);
    const position: PositionSnapshot = await context.depth.position.summary({
      timeoutMs: 90_000,
    });
    assert.equal(position.status, "ready");
    assert.equal(position.position, 0n);
    let released = 0n;
    if (context.allocationAmount > 0n) {
      assert.notEqual(position.collateral, undefined);
      assert.notEqual(position.reserved, undefined);
      assert.equal(position.reserved, context.initialReserved);
      const remaining = position.collateral! - context.initialCollateral;
      const available = position.collateral! - position.reserved!;
      released =
        remaining < context.allocationAmount
          ? remaining
          : context.allocationAmount;
      if (released > available) released = available;
      if (released > 0n) {
        const releaseNonce = context.nonce + 3n;
        const id = context.depth.account.transferHandle(releaseNonce).id;
        await record({
          stage: "trader_release_requested",
          transfer: id.toBase58(),
          nonce: releaseNonce.toString(),
          amount: released.toString(),
          allocationAmount: context.allocationAmount.toString(),
          originalCollateral: context.initialCollateral.toString(),
          collateral: position.collateral!.toString(),
          reserved: position.reserved!.toString(),
        });
        const release = await context.depth.account.release(
          { marketId, amount: released },
          releaseNonce,
        );
        await record({
          stage: "trader_release_submitted",
          transfer: release.id.toBase58(),
          signature: release.signature,
          nonce: releaseNonce.toString(),
          amount: released.toString(),
        });
        const releasedTransfer = await release.confirm({ timeoutMs: 180_000 });
        assert.equal(releasedTransfer.toMarket, false);
        assert.equal(releasedTransfer.amount, released);
        const restored: PositionSnapshot = await context.depth.position.summary(
          {
            timeoutMs: 90_000,
          },
        );
        assert.equal(restored.status, "ready");
        assert.equal(restored.position, 0n);
        assert.equal(restored.collateral, position.collateral! - released);
        assert.equal(restored.reserved, context.initialReserved);
        assert.ok(restored.collateral! >= context.initialCollateral);
        await record({
          stage: "trader_release_settled",
          transfer: release.id.toBase58(),
          signature: release.signature,
          amount: released.toString(),
          collateral: restored.collateral!.toString(),
          reserved: restored.reserved!.toString(),
        });
      } else {
        released = 0n;
        await record({
          stage: "trader_release_skipped",
          allocationAmount: context.allocationAmount.toString(),
          originalCollateral: context.initialCollateral.toString(),
          collateral: position.collateral!.toString(),
          reserved: position.reserved!.toString(),
        });
      }
    }
    let withdrawn = 0n;
    if (context.depositAmount > 0n) {
      const balance = await context.depth.account.summary({
        timeoutMs: 90_000,
      });
      assert.equal(balance.status, "ready");
      assert.notEqual(balance.amount, undefined);
      const returned =
        balance.amount! > context.initialFreeBalance
          ? balance.amount! - context.initialFreeBalance
          : 0n;
      withdrawn =
        returned < context.depositAmount ? returned : context.depositAmount;
      if (withdrawn > 0n) {
        const withdrawalNonce = context.nonce + 5n;
        const id = context.depth.account.withdrawalHandle(withdrawalNonce).id;
        await record({
          stage: "trader_withdrawal_requested",
          receipt: id.toBase58(),
          nonce: withdrawalNonce.toString(),
          amount: withdrawn.toString(),
          depositAmount: context.depositAmount.toString(),
          originalFreeBalance: context.initialFreeBalance.toString(),
          freeBalance: balance.amount!.toString(),
        });
        const withdrawal = await context.depth.account.withdraw(
          withdrawn,
          withdrawalNonce,
        );
        await record({
          stage: "trader_withdrawal_submitted",
          receipt: withdrawal.id.toBase58(),
          signature: withdrawal.signature,
          nonce: withdrawalNonce.toString(),
          amount: withdrawn.toString(),
        });
        assert.equal(await withdrawal.confirm({ timeoutMs: 180_000 }), "paid");
        const receipt = await context.maker.read<{
          owner: PublicKey;
          destination: PublicKey;
          computation: PublicKey;
        }>("WithdrawalReceipt", withdrawal.id);
        assert.ok(receipt.owner.equals(context.depth.options.wallet.publicKey));
        const restored = await context.depth.account.summary({
          timeoutMs: 90_000,
        });
        assert.equal(restored.status, "ready");
        assert.equal(restored.amount, balance.amount! - withdrawn);
        assert.ok(restored.amount! >= context.initialFreeBalance);
        await record({
          stage: "trader_withdrawal_paid",
          receipt: withdrawal.id.toBase58(),
          signature: withdrawal.signature,
          destination: receipt.destination.toBase58(),
          computation: receipt.computation.toBase58(),
          amount: withdrawn.toString(),
          freeBalance: restored.amount!.toString(),
        });
      } else {
        await record({
          stage: "trader_withdrawal_skipped",
          depositAmount: context.depositAmount.toString(),
          originalFreeBalance: context.initialFreeBalance.toString(),
          freeBalance: balance.amount!.toString(),
        });
      }
    }
    const proof = {
      stage: "trade_round_trip",
      quote: quote.id.toBase58(),
      openQuote: (resume?.openingQuote ?? quote.id).toBase58(),
      openOrder: open.id.toBase58(),
      closeOrder: close.id.toBase58(),
      openSignature:
        open.signature ??
        resume?.records.find(({ stage }) => stage === "trade_open_submitted")
          ?.signature,
      closeSignature:
        close.signature ??
        resume?.records.find(({ stage }) => stage === "trade_close_submitted")
          ?.signature,
      size: openFill.size!.toString(),
      allocationAmount: context.allocationAmount.toString(),
      releasedAmount: released.toString(),
      depositAmount: context.depositAmount.toString(),
      withdrawnAmount: withdrawn.toString(),
      status: "closed",
    };
    await record(proof);
    return proof;
  } catch (error) {
    await record({
      stage: "trade_recovery_required",
      quote: quote.id.toBase58(),
      openOrder: open?.id.toBase58(),
      closeOrder: close?.id.toBase58(),
      nonce: context.nonce.toString(),
      error: safeError(error),
    });
    throw error;
  }
}
