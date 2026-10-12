import { randomBytes } from "node:crypto";
import { validateBook, validateHedgePolicy } from "@/hedge/policy";
import {
  abs,
  notional,
  type HedgeAdapter,
  type HedgePolicy,
  type HedgeSnapshot,
  type HedgeState,
} from "@/hedge/types";

export class HedgeEngine {
  snapshot?: HedgeSnapshot;
  private busy = false;
  constructor(
    readonly adapter: HedgeAdapter,
    readonly policy: HedgePolicy,
  ) {
    validateHedgePolicy(policy);
    if (adapter.sizeStep <= 0n || adapter.minNotional <= 0n)
      throw new Error("External order limits are invalid");
  }
  async tick(
    state: HedgeState,
    save: () => Promise<void>,
    depthPosition: bigint | undefined,
    timestamp?: number,
    reconcileOnly = false,
  ) {
    if (this.busy) throw new Error("Hedge engine tick is already running");
    if (state.identity !== this.adapter.identity)
      throw new Error("Hedge checkpoint belongs to another account or network");
    this.busy = true;
    const clock = () => timestamp ?? Date.now();
    let now = clock();
    const result = (
      phase: HedgeSnapshot["phase"],
      reason?: string,
      externalPosition?: bigint,
    ) => {
      this.snapshot = {
        venue: "hyperliquid",
        network: this.adapter.network,
        account: this.adapter.address,
        updatedAt: now,
        phase,
        reason,
        depthPosition,
        externalPosition,
        unhedgedPosition:
          externalPosition === undefined || depthPosition === undefined
            ? undefined
            : depthPosition + externalPosition,
        pending: state.pending,
        history: state.history.slice(-50),
      };
      return this.snapshot;
    };
    try {
      if (state.pending) {
        const order = state.pending;
        const receipt = await this.adapter.receipt(order);
        now = clock();
        if (receipt.status === "unknown") {
          if (reconcileOnly)
            return result(
              "blocked",
              "Paused with an unresolved hedge receipt; no order will be resubmitted",
            );
          if (now >= order.expiresAt)
            return result(
              "blocked",
              "Hedge submission is unresolved; reconcile the persisted order before trading",
            );
          const retry = await this.adapter.submit(order);
          now = clock();
          if (retry.status === "unknown" || retry.status === "open")
            return result("pending", "Hedge confirmation pending");
          state.history.push({
            ...order,
            ...retry,
            completedAt: Math.max(now, order.nonce),
          });
        } else if (receipt.status === "open") {
          state.nonce = Math.max(now, state.nonce + 1);
          await save();
          await this.adapter.cancel(order, state.nonce);
          return result("pending", "Cancelling an outstanding hedge order");
        } else {
          state.history.push({
            ...order,
            ...receipt,
            completedAt: Math.max(now, order.nonce),
          });
        }
        state.history = state.history.slice(-100);
        state.pending = undefined;
        await save();
      }
      if (reconcileOnly) {
        const account = await this.adapter.account();
        return result(
          "waiting",
          "Automation paused; existing positions remain open",
          account.position,
        );
      }
      if (depthPosition === undefined)
        return result("pending", "Waiting for finalized Depth inventory");
      const [account, book] = await Promise.all([
        this.adapter.account(),
        this.adapter.book(),
      ]);
      now = clock();
      validateBook(book, now, this.policy.maxPriceAgeMs);
      if (
        !Number.isSafeInteger(account.timestamp) ||
        account.timestamp > now + 1000 ||
        now - account.timestamp > this.policy.maxPriceAgeMs
      )
        throw new Error("External account snapshot is stale");
      if (
        !Number.isInteger(account.leverage) ||
        account.leverage < 1 ||
        account.leverage > this.policy.maxLeverage
      )
        throw new Error("External leverage exceeds hedge policy");
      const latest = state.history[state.history.length - 1];
      if (latest && account.timestamp < (latest.filledAt ?? latest.completedAt))
        return result(
          "pending",
          "Waiting for the external account to include the confirmed hedge",
          account.position,
        );
      if (account.openOrders.length)
        return result(
          "blocked",
          "Hedge account has unmanaged open orders",
          account.position,
        );
      const price = (book.bids[0].priceE8 + book.asks[0].priceE8) / 2n;
      const target =
        -(
          (depthPosition * BigInt(this.policy.ratioBps)) /
          10_000n /
          this.adapter.sizeStep
        ) * this.adapter.sizeStep;
      const delta = target - account.position;
      const risk = notional(depthPosition + account.position, price);
      const difference = notional(delta, price);
      const hard = risk >= this.policy.maxUnhedgedNotional;
      if (difference === 0n) {
        state.unhedgedSince = undefined;
        await save();
        return result(
          hard ? "blocked" : "balanced",
          hard ? "Unhedged exposure exceeds policy" : undefined,
          account.position,
        );
      }
      state.unhedgedSince ??= now;
      await save();
      const age = now - state.unhedgedSince;
      if (
        !hard &&
        age < this.policy.maxUnhedgedMs &&
        (difference < this.policy.thresholdNotional ||
          age < this.policy.batchMs)
      )
        return result(
          "waiting",
          "Net exposure is within the batching window",
          account.position,
        );
      const buy = delta > 0n;
      const levels = buy ? book.asks : book.bids;
      const rawLimit =
        (levels[0].priceE8 *
          BigInt(10_000 + (buy ? 1 : -1) * this.policy.maxSlippageBps)) /
        10_000n;
      const limit = this.adapter.price(rawLimit, buy);
      let capacity = (this.policy.maxOrderNotional * 100_000_000_000n) / limit;
      const available = levels
        .filter((level) =>
          buy ? level.priceE8 <= limit : level.priceE8 >= limit,
        )
        .reduce((sum, level) => sum + level.size, 0n);
      capacity = capacity < available ? capacity : available;
      const reducing = account.position !== 0n && account.position > 0n !== buy;
      if (reducing)
        capacity =
          capacity < abs(account.position) ? capacity : abs(account.position);
      else {
        if (
          !Number.isInteger(account.leverage) ||
          account.leverage < 1 ||
          account.availableMargin < 0n
        )
          throw new Error("External margin state is invalid");
        const marginCapacity =
          (account.availableMargin *
            BigInt(account.leverage) *
            99n *
            100_000_000_000n) /
          (100n * limit);
        capacity = capacity < marginCapacity ? capacity : marginCapacity;
      }
      let size = abs(delta) < capacity ? abs(delta) : capacity;
      size = (size / this.adapter.sizeStep) * this.adapter.sizeStep;
      if (
        size === 0n ||
        (!reducing && notional(size, limit) < this.adapter.minNotional)
      )
        return result(
          hard || age >= this.policy.maxUnhedgedMs ? "blocked" : "waiting",
          "Hedge size is below venue limits or available margin",
          account.position,
        );
      const order = {
        cloid: `0x${randomBytes(16).toString("hex")}`,
        nonce: Math.max(now, state.nonce + 1),
        expiresAt: now + this.policy.orderTtlMs,
        buy,
        size,
        limitPriceE8: limit,
        reduceOnly: reducing,
      };
      state.nonce = order.nonce;
      state.pending = order;
      await save();
      const receipt = await this.adapter.submit(order);
      now = clock();
      if (receipt.status !== "unknown" && receipt.status !== "open") {
        state.history.push({
          ...order,
          ...receipt,
          completedAt: Math.max(now, order.nonce),
        });
        state.history = state.history.slice(-100);
        state.pending = undefined;
        await save();
      }
      return result(
        receipt.status === "rejected" ? "blocked" : "pending",
        receipt.status === "rejected"
          ? (receipt.reason ?? "Hedge rejected")
          : state.pending
            ? "Hedge confirmation pending"
            : "Hedge submitted; reconciling confirmed exposure",
        account.position,
      );
    } catch (error) {
      result(
        "blocked",
        error instanceof Error
          ? error.message
          : "External hedge service unavailable",
      );
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
