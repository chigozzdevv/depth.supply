import { createHash, randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import type { MakerClient } from "@/client/client";
import { BotStore, type BotState } from "@/bot/store";
import {
  botQuote,
  executionCosts,
  quoteHealth,
  validateBotPolicy,
  type BotMarket,
  type BotPolicy,
  type BotPricing,
} from "@/bot/policy";
import type { PositionSnapshot } from "@depthhq/sdk";
import { HedgeEngine } from "@/hedge/engine";
import { validateBook } from "@/hedge/policy";
import { chainTime } from "@/chain/clock";

export type BotSnapshot = {
  phase: "active" | "pending" | "idle" | "stopped";
  reason?: string;
  quoteId?: string;
  fillCount: number;
};
const terminal = new Set(["filled", "cancelled", "rejected"]);
const nonce = () => BigInt(`0x${randomBytes(8).toString("hex")}`);

export class MakerBot {
  private state?: BotState;
  private position?: PositionSnapshot;
  private verifiedPosition?: PositionSnapshot;
  private dirty = true;
  private busy = false;
  private stopping = false;
  private pricing?: BotPricing;
  private hedgeLease?: BotStore;
  private pricingDirty = false;
  private lastCleanup = 0;
  private lastFills = 0;
  private inventoryVersion?: bigint;
  private reservationView?: ReturnType<MakerClient["quote"]["get"]>;
  private constructor(
    readonly maker: MakerClient,
    readonly policy: BotPolicy,
    readonly store: BotStore,
    readonly hedge?: HedgeEngine,
  ) {}
  static async create(options: {
    maker: MakerClient;
    policy: BotPolicy;
    stateDirectory: string;
    hedge?: HedgeEngine;
  }) {
    validateBotPolicy(options.policy);
    const client = options.maker;
    const store = new BotStore(
      await client.options.connection.getGenesisHash(),
      client.options.maker.toBase58(),
      client.options.wallet.publicKey.toBase58(),
      options.stateDirectory,
    );
    await store.acquire();
    const bot = new MakerBot(client, options.policy, store, options.hedge);
    try {
      bot.state = await store.load();
      if (!options.hedge && bot.state.hedge)
        throw new Error(
          "Restore the configured hedge adapter before restarting a previously hedged maker",
        );
      if (options.hedge) {
        if (
          bot.state.hedge &&
          bot.state.hedge.identity !== options.hedge.adapter.identity
        )
          throw new Error(
            "Hedge checkpoint belongs to another account or network",
          );
        bot.hedgeLease = new BotStore(
          PublicKey.default.toBase58(),
          new PublicKey(
            createHash("sha256")
              .update(options.hedge.adapter.identity)
              .digest(),
          ).toBase58(),
          PublicKey.default.toBase58(),
          options.stateDirectory,
        );
        await bot.hedgeLease.acquire();
        const shared = await bot.hedgeLease.load();
        if (shared.hedge) bot.state.hedge = shared.hedge;
        bot.state.hedge ??= {
          identity: options.hedge.adapter.identity,
          nonce: 0,
          history: [],
        };
        if (bot.state.hedge.identity !== options.hedge.adapter.identity)
          throw new Error("Shared hedge checkpoint belongs to another account");
        const depthAccount = `${store.genesis}:${client.marketAccount().toBase58()}`;
        if (
          bot.state.hedge.depthAccount &&
          bot.state.hedge.depthAccount !== depthAccount
        )
          throw new Error(
            "Hedge account is already assigned to another Depth maker or network",
          );
        bot.state.hedge.depthAccount = depthAccount;
        await bot.saveHedge();
        await store.save(bot.state);
      }
      await bot.reconcile();
      return bot;
    } catch (error) {
      await bot.hedgeLease?.release();
      await store.release();
      throw error;
    }
  }
  private async saveHedge() {
    const store = this.hedgeLease!;
    await store.save({
      genesis: store.genesis,
      maker: store.maker,
      operator: store.operator,
      fills: {},
      hedge: this.state!.hedge,
    });
    await this.store.save(this.state!);
  }
  private async hedgeTick() {
    if (!this.hedge) return;
    type InventoryAccount = {
      status: Record<string, unknown>;
      version: { toString(): string };
      pendingComputation?: PublicKey;
    };
    const [account, confirmed] = await Promise.all([
      this.maker.read<InventoryAccount>(
        "MarketAccount",
        this.maker.marketAccount(),
        "finalized",
      ),
      this.maker.read<InventoryAccount>(
        "MarketAccount",
        this.maker.marketAccount(),
      ),
    ]);
    const write = this.state!.quoteWrite;
    if (
      !this.state!.hedge?.pending &&
      ("reserving" in confirmed.status || "releasing" in confirmed.status)
    ) {
      const ids = [
        this.state!.quote,
        write?.quote,
        this.state!.replacement
          ? this.maker.quote
              .replacement(
                new PublicKey(this.state!.replacement.prior),
                this.state!.replacement.nonce,
              )
              .nextId.toBase58()
          : undefined,
      ];
      for (const id of new Set(ids.filter((id): id is string => Boolean(id)))) {
        const quote = await this.maker.quoteState(new PublicKey(id));
        if (
          ("reserving" in quote.status || "releasing" in quote.status) &&
          quote.pendingComputation?.equals(
            confirmed.pendingComputation ?? PublicKey.default,
          )
        )
          return "updating quote margin";
      }
    }
    let ready =
      "ready" in account.status &&
      "ready" in confirmed.status &&
      account.version.toString() === confirmed.version.toString();
    const currentVersion = BigInt(confirmed.version.toString());
    const candidate =
      write &&
      this.position &&
      "ready" in confirmed.status &&
      currentVersion === write.version + 1n &&
      (this.inventoryVersion ?? this.position.version) >= write.version &&
      (this.inventoryVersion ?? this.position.version) <= currentVersion;
    const completedQuote =
      write &&
      "ready" in confirmed.status &&
      currentVersion === write.version + 1n &&
      (await this.maker.quoteState(new PublicKey(write.quote)));
    const completedWrite =
      candidate && completedQuote ? completedQuote.status : undefined;
    const ownCommit =
      write &&
      completedWrite &&
      (write.release
        ? "cancelled" in completedWrite || "filled" in completedWrite
        : "active" in completedWrite);
    const riskWrite = [
      this.state!.quoteRisk,
      this.state!.replacement?.risk,
    ].find((risk) => risk?.quote === write?.quote);
    if (completedQuote && "active" in completedQuote.status && riskWrite) {
      riskWrite.version = currentVersion;
      riskWrite.balanceNonce = Buffer.from(
        completedQuote.balanceNonce,
      ).toString("hex");
      await this.store.save(this.state!);
    }
    if (ownCommit) {
      this.inventoryVersion = currentVersion;
      ready = true;
      if (account.version.toString() === confirmed.version.toString()) {
        this.state!.quoteWrite = undefined;
        await this.store.save(this.state!);
      }
    }
    if (
      "ready" in confirmed.status &&
      (!this.position ||
        this.position.status !== "ready" ||
        this.position.position === undefined ||
        ((this.inventoryVersion ?? this.position.version) !== currentVersion &&
          this.position.version !== currentVersion))
    ) {
      const prior = this.position;
      this.position = await this.maker.position.summary({ timeoutMs: 0 });
      ready = false;
      if (this.position.status === "ready") {
        const [fresh, latest] = await Promise.all([
          this.maker.read<InventoryAccount>(
            "MarketAccount",
            this.maker.marketAccount(),
            "finalized",
          ),
          this.maker.read<InventoryAccount>(
            "MarketAccount",
            this.maker.marketAccount(),
          ),
        ]);
        ready =
          "ready" in fresh.status &&
          "ready" in latest.status &&
          fresh.version.toString() === latest.version.toString() &&
          this.position.version === BigInt(fresh.version.toString());
      }
      if (ready) {
        this.inventoryVersion = this.position.version;
        if (write && this.position.version >= write.version) {
          this.state!.quoteWrite = undefined;
          await this.store.save(this.state!);
        }
        this.pricingDirty ||=
          prior !== undefined &&
          (prior.position !== this.position.position ||
            prior.collateral !== this.position.collateral);
        this.dirty = false;
      }
    }
    if (ready && this.position?.status === "ready") {
      this.pricingDirty ||=
        this.verifiedPosition !== undefined &&
        (this.verifiedPosition.position !== this.position.position ||
          this.verifiedPosition.collateral !== this.position.collateral);
      this.verifiedPosition = this.position;
      this.dirty = false;
    }
    const snapshot = await this.hedge.tick(
      this.state!.hedge!,
      () => this.saveHedge(),
      ready ? this.position?.position : undefined,
    );
    if (snapshot.phase === "pending" || snapshot.phase === "blocked") {
      const risk = this.state!.quoteRisk;
      const inventoryWait =
        snapshot.phase === "pending" &&
        !this.state!.hedge?.pending &&
        (snapshot.reason === "Waiting for finalized Depth inventory" ||
          snapshot.reason ===
            "Waiting for the external account to include the confirmed hedge" ||
          snapshot.reason ===
            "Hedge submitted; reconciling confirmed exposure");
      if (
        inventoryWait &&
        risk &&
        risk.quote === this.state!.quote &&
        this.hedge.policy.ratioBps === 10_000
      ) {
        const [book, external] = await Promise.all([
          this.hedge.adapter.book(),
          this.hedge.adapter.account(),
        ]);
        validateBook(book, Date.now(), this.hedge.policy.maxPriceAgeMs);
        if (
          !Number.isSafeInteger(external.timestamp) ||
          external.timestamp > Date.now() + 1000 ||
          Date.now() - external.timestamp > this.hedge.policy.maxPriceAgeMs ||
          external.openOrders.length ||
          !Number.isInteger(external.leverage) ||
          external.leverage < 1 ||
          external.availableMargin < 0n ||
          external.leverage > this.hedge.policy.maxLeverage
        )
          throw new Error(
            "External account is unavailable for quote continuity",
          );
        const market = await this.maker.read<BotMarket>(
          "Market",
          this.maker.marketAddress,
        );
        const price = BigInt(market.oraclePriceE8.toString());
        const expected =
          risk.externalPosition +
          this.state!.hedge!.history.filter(
            (fill) => fill.nonce > risk.hedgeNonce,
          ).reduce(
            (total, fill) =>
              total + (fill.buy ? fill.filledSize : -fill.filledSize),
            0n,
          );
        const quote = await this.maker.quoteState(new PublicKey(risk.quote));
        const balanceNonce = Buffer.from(quote.balanceNonce).toString("hex");
        const unchanged = currentVersion === risk.version;
        const ownFill =
          "ready" in confirmed.status &&
          currentVersion === risk.version + 1n &&
          risk.balanceNonce !== undefined &&
          balanceNonce !== risk.balanceNonce;
        if (ownFill) {
          risk.version = currentVersion;
          risk.balanceNonce = balanceNonce;
          this.state!.inventoryPendingSince ??= Date.now();
          await this.store.save(this.state!);
        }
        const bounded =
          (unchanged || ownFill) &&
          external.position === expected &&
          risk.notional * price <=
            this.hedge.policy.maxUnhedgedNotional * risk.price;
        if (market.pendingOrders > 0 && bounded) return snapshot.reason;
        if (
          bounded &&
          unchanged &&
          this.state!.inventoryPendingSince === undefined &&
          this.state!.hedge!.unhedgedSince === undefined
        )
          return snapshot.reason;
        this.state!.inventoryPendingSince ??= Date.now();
        await this.store.save(this.state!);
        if (
          bounded &&
          Date.now() - this.state!.inventoryPendingSince <
            this.hedge.policy.maxUnhedgedMs
        )
          return snapshot.reason;
      }
      await this.cancel(true);
      return snapshot.reason ?? "hedge reconciliation pending";
    }
    if (this.state!.inventoryPendingSince !== undefined) {
      this.state!.inventoryPendingSince = undefined;
      await this.store.save(this.state!);
    }
    const [book, costs] = await Promise.all([
      this.hedge.adapter.book(),
      this.hedge.adapter.costs(),
    ]);
    if (this.pricing) {
      const before =
        this.pricing.book.bids[0].priceE8 + this.pricing.book.asks[0].priceE8;
      const after = book.bids[0].priceE8 + book.asks[0].priceE8;
      const change = after > before ? after - before : before - after;
      const priorCosts = executionCosts(this.policy, this.pricing);
      const nextCosts = executionCosts(this.policy, costs);
      this.pricingDirty ||=
        change * 10_000n >= before * BigInt(this.policy.repriceBps) ||
        priorCosts.bid !== nextCosts.bid ||
        priorCosts.ask !== nextCosts.ask;
    }
    this.pricing = {
      book,
      ...costs,
      externalPosition: snapshot.externalPosition!,
      maxPriceAgeMs: this.hedge.policy.maxPriceAgeMs,
    };
  }
  private async quoteWrite(
    handle: ReturnType<MakerClient["quote"]["get"]>,
    release = false,
  ) {
    const before = await this.maker.read<{
      status: Record<string, unknown>;
      version: { toString(): string };
    }>("MarketAccount", this.maker.marketAccount());
    const version = BigInt(before.version.toString());
    const result = release
      ? await handle.cancel()
      : await handle.activate({ timeoutMs: 0 });
    if (
      (release ? handle.releaseSignature : handle.reserveSignature) &&
      "ready" in before.status &&
      version === (this.inventoryVersion ?? this.position?.version)
    ) {
      this.state!.quoteWrite = {
        quote: handle.id.toBase58(),
        version,
        release,
      };
      await this.store.save(this.state!);
    }
    return result;
  }
  private snapshot(phase: BotSnapshot["phase"], reason?: string): BotSnapshot {
    return {
      phase,
      reason,
      quoteId: this.state?.quote,
      fillCount: Object.keys(this.state?.fills ?? {}).length,
    };
  }
  private requestId() {
    const value = this.state?.request?.clientNonce;
    if (value === undefined) return;
    const bytes = Buffer.alloc(8);
    bytes.writeBigUInt64LE(value);
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("quote"),
        this.maker.marketAddress.toBuffer(),
        this.maker.options.maker.toBuffer(),
        bytes,
      ],
      DEPTH_PROGRAM_ID,
    )[0];
  }
  private async reconcile() {
    const state = this.state!;
    if (
      state.quote &&
      !(await this.maker.options.connection.getAccountInfo(
        new PublicKey(state.quote),
        "confirmed",
      ))
    ) {
      if (
        !state.request ||
        state.request.expiresAt + 180 < Math.floor(Date.now() / 1000)
      ) {
        state.quote = undefined;
        state.request = undefined;
        state.referencePrice = undefined;
        await this.store.save(state);
      }
    }
    if (state.replacement) {
      const flow = this.maker.quote.replacement(
        new PublicKey(state.replacement.prior),
        state.replacement.nonce,
      );
      const [prior, next] = await Promise.all([
        this.maker.options.connection.getAccountInfo(
          new PublicKey(state.replacement.prior),
          "confirmed",
        ),
        this.maker.options.connection.getAccountInfo(flow.nextId, "confirmed"),
      ]);
      const successor = next && (await this.maker.quoteState(flow.nextId));
      const predecessor =
        prior &&
        (await this.maker.quoteState(new PublicKey(state.replacement.prior)));
      const completed =
        predecessor &&
        successor &&
        terminal.has(Object.keys(predecessor.status)[0]) &&
        "active" in successor.status &&
        predecessor.replacementNonce?.toString() ===
          state.replacement.nonce.toString();
      if (successor && (!prior || completed)) {
        if (
          !successor.operator.equals(this.maker.options.wallet.publicKey) ||
          !state.replacement.request ||
          BigInt(successor.capacity.toString()) !==
            state.replacement.request.maxCapacity
        )
          throw new Error(
            "Recovered successor does not match this operator's checkpoint",
          );
        const risk = state.replacement.risk;
        if (risk && "active" in successor.status) {
          const account = await this.maker.read<{
            status: Record<string, unknown>;
            version: { toString(): string };
          }>("MarketAccount", this.maker.marketAccount());
          const version = BigInt(account.version.toString());
          if ("ready" in account.status && version === risk.version + 1n) {
            risk.version = version;
            risk.balanceNonce = Buffer.from(successor.balanceNonce).toString(
              "hex",
            );
            state.quoteWrite = undefined;
          }
        }
        state.quote = flow.nextId.toBase58();
        state.request = state.replacement.request;
        state.referencePrice = state.replacement.referencePrice;
        state.quoteRisk = state.replacement.risk;
        state.replacement = undefined;
        await this.store.save(state);
      } else if (
        !prior &&
        !next &&
        (!state.replacement.request ||
          state.replacement.request.expiresAt + 180 <
            Math.floor(Date.now() / 1000))
      ) {
        state.replacement = undefined;
        await this.store.save(state);
      }
    }
    let cursor: string | undefined;
    const managed: string[] = [];
    do {
      const page = await this.maker.quote.list({ cursor, limit: 100 });
      for (const item of page.items) {
        const quote = await this.maker.quoteState(item.id);
        if (
          quote.operator.equals(this.maker.options.wallet.publicKey) &&
          !terminal.has(Object.keys(quote.status)[0])
        )
          managed.push(item.id.toBase58());
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const allowed = new Set(
      [
        state.quote,
        state.replacement?.prior,
        state.replacement
          ? this.maker.quote
              .replacement(
                new PublicKey(state.replacement.prior),
                state.replacement.nonce,
              )
              .nextId.toBase58()
          : undefined,
        this.requestId()?.toBase58(),
      ].filter(Boolean),
    );
    for (const id of managed)
      if (!allowed.has(id)) {
        const quote = await this.maker.quote.get(new PublicKey(id)).status();
        if (
          ["active", "waiting", "validated", "validating", "closing"].includes(
            quote.status,
          )
        )
          await this.maker.quote.get(new PublicKey(id)).cancel();
      }
  }
  private async fills() {
    if (Date.now() - this.lastFills < 10_000) return;
    const state = this.state!;
    let before: string | undefined;
    let head: string | undefined;
    const records = new Map<string, { signature: string; slot: number }>();
    do {
      const page = await this.maker.fills.list({
        before,
        until: state.cursor,
        limit: 100,
      });
      head ??= page.head;
      for (const fill of page.fills)
        if (!state.fills[fill.id])
          records.set(fill.id, { signature: fill.signature, slot: fill.slot });
      before = page.cursor;
    } while (before);
    if (records.size) {
      for (const [id, value] of records) state.fills[id] = value;
      this.dirty = true;
    }
    if (head) {
      state.cursor = head;
      await this.store.save(state);
    }
    this.lastFills = Date.now();
  }
  private async cancel(preserve = false): Promise<boolean> {
    const state = this.state!;
    let successorPending = false;
    if (state.replacement?.request) {
      const next = this.maker.quote.replacement(
        new PublicKey(state.replacement.prior),
        state.replacement.nonce,
      ).nextId;
      if (
        await this.maker.options.connection.getAccountInfo(next, "confirmed")
      ) {
        const handle = this.maker.quote.get(next);
        const snapshot = await handle.status();
        if (!terminal.has(snapshot.status)) {
          const result = [
            "active",
            "waiting",
            "validated",
            "validating",
            "closing",
            "reserving",
          ].includes(snapshot.status)
            ? await this.quoteWrite(handle, true)
            : snapshot;
          successorPending = !terminal.has(result.status);
        }
      }
    }
    if (!state.quote) {
      const request = this.requestId();
      if (
        request &&
        (await this.maker.options.connection.getAccountInfo(
          request,
          "confirmed",
        ))
      )
        state.quote = request.toBase58();
      else {
        if (
          state.request &&
          (preserve ||
            state.request.expiresAt + 180 > Math.floor(Date.now() / 1000))
        )
          return false;
        state.request = undefined;
        if (!preserve) state.replacement = undefined;
        await this.store.save(state);
        return true;
      }
    }
    const handle = this.maker.quote.get(new PublicKey(state.quote));
    const quote = await handle.status();
    if (terminal.has(quote.status)) {
      if (successorPending) return false;
      state.quote = undefined;
      state.request = undefined;
      state.referencePrice = undefined;
      if (!preserve) state.replacement = undefined;
      await this.store.save(state);
      return true;
    }
    if (
      [
        "active",
        "waiting",
        "validated",
        "validating",
        "closing",
        "reserving",
      ].includes(quote.status)
    )
      await this.quoteWrite(handle, true);
    return false;
  }
  private async replace(market: BotMarket, now: number): Promise<BotSnapshot> {
    const state = this.state!;
    const replacement = state.replacement!;
    const flow = this.maker.quote.replacement(
      new PublicKey(replacement.prior),
      replacement.nonce,
    );
    if (
      now - market.oracleTimestamp.toNumber() >
      market.config.maxOracleAgeSeconds -
        Math.min(
          Math.floor(market.config.maxOracleAgeSeconds / 2),
          this.policy.lifetimeSeconds,
        )
    )
      return this.snapshot("pending", "waiting for a fresh oracle update");
    if (!replacement.request) {
      const account = await this.maker.read<{
        status: Record<string, unknown>;
        version: { toString(): string };
      }>("MarketAccount", this.maker.marketAccount());
      if (!("ready" in account.status) || market.pendingOrders)
        return this.snapshot("pending", "settlement in progress");
      if (
        !this.position ||
        this.position.status !== "ready" ||
        this.position.version !== BigInt(account.version.toString())
      ) {
        this.position = await this.maker.position.summary({
          timeoutMs: 0,
        });
        if (
          this.position.status !== "ready" ||
          this.position.version !== BigInt(account.version.toString())
        )
          return this.snapshot("pending", "maker view changed");
        this.inventoryVersion = this.position.version;
        this.dirty = false;
        return this.snapshot("pending", "maker view refreshed");
      }
      this.inventoryVersion = this.position.version;
      this.dirty = false;
      const previous = await this.maker.quote
        .get(new PublicKey(replacement.prior))
        .status();
      const policy = this.quotePolicy(market);
      const planned = botQuote(
        policy,
        market,
        this.position,
        replacement.nonce,
        now,
        this.pricing,
      );
      let credit = 0n;
      if (
        previous.status === "active" &&
        (!planned || planned.maxCapacity < policy.maxCapacity)
      ) {
        this.reservationView ??= this.maker.quote.get(
          new PublicKey(replacement.prior),
        );
        const margin = await this.reservationView.reservation();
        if (margin === undefined)
          return this.snapshot("pending", "reading remaining quote margin");
        credit = margin;
        this.reservationView = undefined;
      }
      replacement.request = botQuote(
        policy,
        market,
        this.position,
        replacement.nonce,
        now,
        this.pricing,
        credit,
      );
      if (!replacement.request)
        return this.snapshot("pending", "inventory or collateral limit");
      replacement.referencePrice = BigInt(market.oraclePriceE8.toString());
      replacement.risk = this.quoteRisk(
        flow.nextId,
        replacement.request,
        market,
      );
      await this.store.save(state);
    }
    await flow.begin();
    const exists = await this.maker.options.connection.getAccountInfo(
      flow.nextId,
      "confirmed",
    );
    const next = exists
      ? this.maker.quote.get(flow.nextId)
      : await this.maker.quote.publish(replacement.request);
    const snapshot = await next.status();
    if (snapshot.status === "validating" && replacement.request.expiresAt > now)
      return this.snapshot("pending", "validating successor quote");
    if (
      ["rejected", "cancelled"].includes(snapshot.status) ||
      replacement.request.expiresAt <= now
    ) {
      await flow.discard();
      state.replacement = undefined;
      this.reservationView = undefined;
      await this.store.save(state);
      return this.snapshot("pending", "retrying expired successor");
    }
    const prior = this.maker.quote.get(new PublicKey(replacement.prior));
    const previous = await prior.status();
    if (
      previous.status === "active" &&
      ["validated", "reserving"].includes(snapshot.status)
    ) {
      const price = BigInt(market.oraclePriceE8.toString());
      const size = this.position!.position!;
      const exposure =
        ((size < 0n ? -size : size) * price + 99_999_999_999n) /
        100_000_000_000n;
      const risk = this.quoteRisk(next.id, replacement.request, market);
      if (
        snapshot.status === "validated" &&
        (exposure + snapshot.maxCapacity > this.policy.maxInventoryNotional ||
          (risk && risk.notional > this.hedge!.policy.maxUnhedgedNotional))
      ) {
        await flow.discard();
        state.replacement = undefined;
        await this.store.save(state);
        return this.snapshot("pending", "repricing changed inventory");
      }
      if (snapshot.status === "validated") replacement.risk = risk;
      await this.store.save(state);
      const account = await this.maker.read<{
        version: { toString(): string };
      }>("MarketAccount", this.maker.marketAccount());
      await flow.rotate(next);
      if (next.reserveSignature) {
        state.quoteWrite = {
          quote: next.id.toBase58(),
          version: BigInt(account.version.toString()),
          release: false,
        };
        await this.store.save(state);
      }
      return this.snapshot("pending", "rotating quote reservation");
    }
    if (!terminal.has(previous.status)) {
      if (
        ["active", "waiting", "validated", "validating", "closing"].includes(
          previous.status,
        )
      )
        await this.quoteWrite(prior, true);
      return this.snapshot("pending", "releasing prior quote");
    }
    state.quote = flow.nextId.toBase58();
    state.request = replacement.request;
    state.referencePrice = replacement.referencePrice;
    state.quoteRisk = replacement.risk;
    state.replacement = undefined;
    this.pricingDirty = false;
    await this.store.save(state);
    await this.quoteWrite(next);
    return this.snapshot("pending", "activating successor quote");
  }
  async tick(): Promise<BotSnapshot> {
    if (this.busy) throw new Error("Maker bot tick is already running");
    if (!this.state) throw new Error("Maker bot has been closed");
    this.busy = true;
    try {
      const state = this.state;
      if (Date.now() - this.lastCleanup >= 60_000) {
        await this.maker.quote.cleanup({
          exclude: [
            state.quoteWrite?.quote,
            state.quote,
            state.replacement?.prior,
            this.requestId()?.toBase58(),
            state.replacement
              ? this.maker.quote
                  .replacement(
                    new PublicKey(state.replacement.prior),
                    state.replacement.nonce,
                  )
                  .nextId.toBase58()
              : undefined,
          ].filter((id): id is string => Boolean(id)),
        });
        this.lastCleanup = Date.now();
      }
      let [market, lamports, now] = await Promise.all([
        this.maker.read<BotMarket>("Market", this.maker.marketAddress),
        this.maker.options.connection.getBalance(
          this.maker.options.wallet.publicKey,
          "confirmed",
        ),
        chainTime(this.maker.options.connection),
      ]);
      const reason = this.stopping
        ? "shutdown"
        : (quoteHealth(market, now) ??
          (BigInt(lamports) < (this.policy.gasReserveLamports ?? 50_000_000n)
            ? "operator SOL reserve"
            : undefined));
      if (reason) {
        const stopped = await this.cancel();
        if (this.stopping && this.hedge && state.hedge)
          await this.hedge.tick(
            state.hedge,
            () => this.saveHedge(),
            undefined,
            undefined,
            true,
          );
        if (!this.stopping && this.hedge && state.hedge?.pending)
          await this.hedge.tick(state.hedge, () => this.saveHedge(), undefined);
        return this.snapshot(
          stopped && !state.hedge?.pending ? "stopped" : "pending",
          reason,
        );
      }
      if (state.quote) await this.renew(market, now);
      await this.fills();
      const hedgeReason = await this.hedgeTick();
      if (hedgeReason) return this.snapshot("pending", hedgeReason);
      if (this.hedge) {
        market = await this.maker.read<BotMarket>(
          "Market",
          this.maker.marketAddress,
        );
        now = await chainTime(this.maker.options.connection);
        const changed = quoteHealth(market, now);
        if (changed) {
          const stopped = await this.cancel();
          return this.snapshot(stopped ? "stopped" : "pending", changed);
        }
      }
      if (state.replacement) return this.replace(market, now);
      if (
        !state.quote &&
        this.requestId() &&
        (await this.maker.options.connection.getAccountInfo(
          this.requestId()!,
          "confirmed",
        ))
      ) {
        state.quote = this.requestId()!.toBase58();
        await this.store.save(state);
      }
      if (state.quote) {
        const handle = this.maker.quote.get(new PublicKey(state.quote));
        const quote = await handle.status();
        if (terminal.has(quote.status)) {
          state.quote = undefined;
          state.request = undefined;
          await this.store.save(state);
        } else if (
          ["validating", "validated", "waiting", "reserving"].includes(
            quote.status,
          )
        ) {
          const current = await this.maker.quoteState(handle.id);
          if (
            current.expiry.toNumber() <= now &&
            ["validating", "validated", "waiting"].includes(quote.status)
          )
            await this.cancel();
          else await this.quoteWrite(handle);
          return this.snapshot("pending", "activating quote");
        } else if (["closing", "releasing"].includes(quote.status)) {
          await this.cancel();
          return this.snapshot("pending", "releasing quote");
        } else if (quote.status === "active") {
          if (this.dirty && !this.hedge) {
            const account = await this.maker.read<{
              status: Record<string, unknown>;
              version: { toString(): string };
            }>("MarketAccount", this.maker.marketAccount());
            if ("ready" in account.status) {
              const before = this.position;
              this.position = await this.maker.position.summary({
                timeoutMs: 0,
              });
              if (
                this.position.status === "ready" &&
                this.position.version === BigInt(account.version.toString())
              ) {
                this.dirty = false;
                this.pricingDirty ||=
                  before !== undefined &&
                  before.position !== this.position.position;
                this.inventoryVersion = this.position.version;
              }
            }
            if (this.dirty)
              return this.snapshot("pending", "reading maker inventory");
          }
          const price = BigInt(market.oraclePriceE8.toString());
          const difference =
            state.referencePrice === undefined
              ? undefined
              : (price > state.referencePrice
                  ? price - state.referencePrice
                  : state.referencePrice - price) * 10_000n;
          const current = await this.maker.quoteState(handle.id);
          const reference = BigInt(current.oracleReferenceE8.toString());
          const drift =
            price > reference ? price - reference : reference - price;
          const compatible =
            current.marketRevision.eq(market.revision) &&
            drift * 10_000n <=
              reference *
                BigInt(
                  Math.min(
                    Math.floor(market.config.maxQuoteDeviationBps / 4),
                    25,
                  ),
                );
          if (
            !this.dirty &&
            !this.pricingDirty &&
            compatible &&
            current.expiry.toNumber() > now &&
            difference !== undefined &&
            difference < BigInt(this.policy.repriceBps) * state.referencePrice!
          )
            return this.snapshot("active");
          state.replacement = { prior: state.quote, nonce: nonce() };
          this.pricingDirty = false;
          await this.store.save(state);
          await this.maker.quote
            .replacement(handle.id, state.replacement.nonce)
            .begin();
          await this.replace(market, now);
          return this.snapshot("pending", "repricing quote");
        }
      }
      if (market.pendingOrders > 0)
        return this.snapshot("idle", "settlement in progress");
      const account = await this.maker.read<{
        status: Record<string, unknown>;
        version: { toString(): string };
      }>("MarketAccount", this.maker.marketAccount());
      if (!("ready" in account.status))
        return this.snapshot("idle", "maker account busy");
      if (
        this.dirty ||
        !this.position ||
        this.position.version !== BigInt(account.version.toString())
      ) {
        this.position = await this.maker.position.summary({
          timeoutMs: 0,
        });
        if (
          this.position.status !== "ready" ||
          this.position.version !== BigInt(account.version.toString())
        )
          return this.snapshot("idle", "maker view changed");
        this.dirty = false;
        return this.snapshot("idle", "maker view refreshed");
      }
      if (!state.request) {
        const request = botQuote(
          this.quotePolicy(market),
          market,
          this.position,
          nonce(),
          now,
          this.pricing,
        );
        if (!request)
          return this.snapshot("idle", "inventory or collateral limit");
        state.request = request;
        this.pricingDirty = false;
        state.referencePrice = BigInt(market.oraclePriceE8.toString());
        state.quoteRisk = this.quoteRisk(this.requestId()!, request, market);
        await this.store.save(state);
      }
      const request = state.request;
      if (request.expiresAt <= now) {
        state.request = undefined;
        await this.store.save(state);
        return this.snapshot("idle", "prepared quote expired");
      }
      const handle = await this.maker.quote.publish(request);
      state.quote = handle.id.toBase58();
      state.replacement = undefined;
      await this.store.save(state);
      await this.quoteWrite(handle);
      return this.snapshot("pending", "quote submitted");
    } catch (error) {
      try {
        await this.cancel(true);
      } catch (cause) {
        throw new AggregateError(
          [error, cause],
          "Maker bot failed and quote cancellation could not be confirmed",
        );
      }
      throw error;
    } finally {
      this.busy = false;
    }
  }
  private async renew(market: BotMarket, now: number) {
    const state = this.state!;
    if (
      this.hedge &&
      (state.hedge?.pending ||
        (state.inventoryPendingSince !== undefined &&
          Date.now() - state.inventoryPendingSince >=
            this.hedge.policy.maxUnhedgedMs))
    )
      return;
    const handle = this.maker.quote.get(new PublicKey(state.quote!));
    const quote = await this.maker.quoteState(handle.id);
    if (!("active" in quote.status) || quote.expiry.toNumber() <= now) return;
    const duration = Math.min(
      this.policy.lifetimeSeconds,
      market.config.maxQuoteLifetimeSeconds,
    );
    if (
      quote.expiry.toNumber() - now >
      Math.max(
        this.policy.refreshSeconds,
        duration - this.policy.refreshSeconds,
      )
    )
      return;
    const price = BigInt(market.oraclePriceE8.toString());
    const reference = BigInt(quote.oracleReferenceE8.toString());
    const drift = price > reference ? price - reference : reference - price;
    if (
      !quote.marketRevision.eq(market.revision) ||
      reference <= 0n ||
      drift * 10_000n >
        reference *
          BigInt(
            Math.min(Math.floor(market.config.maxQuoteDeviationBps / 4), 25),
          )
    )
      return;
    let renewed;
    try {
      renewed = await handle.renew({ validForSeconds: duration });
    } catch (error) {
      const code = (error as { error?: { errorCode?: { code?: string } } })
        .error?.errorCode?.code;
      if (!["InvalidQuote", "WrongQuoteStatus"].includes(code ?? ""))
        throw error;
      const [latest, current] = await Promise.all([
        this.maker.read<BotMarket>("Market", this.maker.marketAddress),
        this.maker.quoteState(handle.id),
      ]);
      const currentPrice = BigInt(latest.oraclePriceE8.toString());
      const quotedPrice = BigInt(current.oracleReferenceE8.toString());
      const moved =
        currentPrice > quotedPrice
          ? currentPrice - quotedPrice
          : quotedPrice - currentPrice;
      if (
        !("active" in current.status) ||
        current.expiry.toNumber() <= Math.floor(Date.now() / 1000) ||
        !current.marketRevision.eq(latest.revision) ||
        quoteHealth(latest, Math.floor(Date.now() / 1000)) ||
        moved * 10_000n >
          quotedPrice *
            BigInt(
              Math.min(Math.floor(latest.config.maxQuoteDeviationBps / 4), 25),
            )
      )
        return;
      throw error;
    }
    if (state.request) state.request.expiresAt = renewed.expiresAt;
    await this.store.save(state);
  }
  private quotePolicy(market: BotMarket): BotPolicy {
    if (!this.hedge || !this.pricing || this.position?.position === undefined)
      return this.policy;
    const price = BigInt(market.oraclePriceE8.toString());
    const size = this.position.position + this.pricing.externalPosition;
    const risk =
      ((size < 0n ? -size : size) * price + 99_999_999_999n) / 100_000_000_000n;
    const remaining = (this.hedge.policy.maxUnhedgedNotional * 9n) / 10n - risk;
    const capacity =
      (remaining * 10_000n) /
      BigInt(10_000 + market.config.maxQuoteDeviationBps);
    return {
      ...this.policy,
      maxCapacity:
        capacity < this.policy.maxCapacity
          ? capacity > 0n
            ? capacity
            : 1n
          : this.policy.maxCapacity,
    };
  }
  private quoteRisk(
    id: PublicKey,
    request: NonNullable<BotState["request"]>,
    market: BotMarket,
  ) {
    if (!this.hedge || !this.pricing || this.position?.position === undefined)
      return;
    const price = BigInt(market.oraclePriceE8.toString());
    const size = this.position.position + this.pricing.externalPosition;
    const notional =
      ((size < 0n ? -size : size) * price + 99_999_999_999n) /
        100_000_000_000n +
      (request.maxCapacity *
        BigInt(10_000 + market.config.maxQuoteDeviationBps) +
        9_999n) /
        10_000n;
    return {
      quote: id.toBase58(),
      notional,
      price,
      version: this.position.version,
      externalPosition: this.pricing.externalPosition,
      hedgeNonce: this.state!.hedge!.nonce,
    };
  }
  stop() {
    this.stopping = true;
  }
  async close() {
    if (this.busy)
      throw new Error("Wait for the active maker tick before closing");
    await this.store.release();
    await this.hedgeLease?.release();
    this.state = undefined;
  }
}

export const create_maker_bot = MakerBot.create;
