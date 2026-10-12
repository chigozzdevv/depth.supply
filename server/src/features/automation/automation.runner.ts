import * as anchor from "@anchor-lang/core";
import { chainConnection } from "@/shared/chain/connection";
import { Keypair, PublicKey } from "@solana/web3.js";
import { create_depth_maker, automationConfig } from "@depthhq/maker-sdk";
import {
  create_maker_bot,
  create_hyperliquid,
  HedgeEngine,
  type BotSnapshot,
  type HedgeSnapshot,
} from "@depthhq/maker-sdk/node";
import { AutomationStore } from "@/features/automation/automation.store";
import {
  automationError,
  type AutomationRecord,
} from "@/features/automation/automation.model";

export interface AutomationBot {
  tick(): Promise<BotSnapshot>;
  stop(): void;
  close(): Promise<void>;
  hedge?: { snapshot?: HedgeSnapshot };
}
export type AutomationFactory = (
  record: AutomationRecord,
  stopping: boolean,
) => Promise<AutomationBot>;
export function automationFactory(options: {
  rpcUrl: string;
  serviceUrl: string;
  stateDirectory: string;
}): AutomationFactory {
  return async (record, stopping) => {
    const config = automationConfig(record.config);
    const maker = await create_depth_maker({
      environment: record.environment,
      connection: chainConnection(
        `${options.serviceUrl.replace(/\/+$/, "")}/rpc`,
      ),
      serviceUrl: options.serviceUrl,
      wallet: new anchor.Wallet(
        Keypair.fromSecretKey(Buffer.from(record.operatorSecret, "base64")),
      ),
      makerOwner: new PublicKey(record.owner),
    });
    if (!stopping) {
      const [grant, market, balance, account] = await Promise.all([
        maker.read<{
          active: boolean;
          canView: boolean;
          maker: PublicKey;
          operator: PublicKey;
          market: PublicKey;
          maxCapacity: anchor.BN;
          expiresAt: anchor.BN;
        }>("OperatorGrant", maker.grantAddress()),
        maker.read<{
          config: {
            quoteTiers: anchor.BN[];
            maxQuoteLifetimeSeconds: number;
            maxQuoteDeviationBps: number;
            maxAccountNotional: anchor.BN;
          };
        }>("Market", maker.marketAddress),
        maker.options.connection.getBalance(
          maker.options.wallet.publicKey,
          "confirmed",
        ),
        maker.read<{
          owner: PublicKey;
          market: PublicKey;
          status: Record<string, unknown>;
        }>("MarketAccount", maker.marketAccount()),
      ]);
      if (
        !grant.active ||
        !grant.canView ||
        !grant.maker.equals(maker.options.maker) ||
        !grant.operator.equals(maker.options.wallet.publicKey) ||
        !grant.market.equals(maker.marketAddress) ||
        BigInt(grant.maxCapacity.toString()) < config.quote.maxCapacity ||
        grant.expiresAt.toNumber() <
          Math.floor(Date.now() / 1000) + config.quote.lifetimeSeconds
      )
        throw new Error(
          "Approve a current operator grant covering capacity, quote lifetime, and private views",
        );
      if (
        !account.owner.equals(maker.options.maker) ||
        !account.market.equals(maker.marketAddress) ||
        !("ready" in account.status)
      )
        throw new Error(
          "Open and fund a ready maker market account before starting",
        );
      if (BigInt(balance) <= config.quote.gasReserveLamports!)
        throw new Error(
          "Fund the operator above its SOL reserve before starting",
        );
      if (
        config.quote.lifetimeSeconds > market.config.maxQuoteLifetimeSeconds ||
        Math.ceil(config.quote.spreadBps / 2) >
          market.config.maxQuoteDeviationBps ||
        config.quote.maxCapacity <
          BigInt(market.config.quoteTiers[0].toString()) ||
        config.quote.maxInventoryNotional >
          BigInt(market.config.maxAccountNotional.toString())
      )
        throw new Error("Automation limits are outside this market's policy");
    }
    const hedge = config.hedge
      ? new HedgeEngine(
          await create_hyperliquid({
            account: config.hedge.account,
            agentKey: record.agentSecret,
            network: record.environment === "devnet" ? "testnet" : "mainnet",
          }),
          config.hedge.policy,
        )
      : undefined;
    if (hedge && !stopping) {
      const state = await hedge.adapter.account();
      if (
        state.availableMargin < 10_000_000n ||
        state.leverage > config.hedge!.policy.maxLeverage ||
        state.openOrders.length
      )
        throw new Error(
          "Fund the Hyperliquid account, approve its agent, and clear unmanaged orders before starting",
        );
    }
    return create_maker_bot({
      maker,
      policy: config.quote,
      stateDirectory: options.stateDirectory,
      hedge,
    });
  };
}

export class AutomationRunner {
  private readonly bots = new Map<string, AutomationBot>();
  private readonly tasks = new Map<string, Promise<void>>();
  private readonly retries = new Map<
    string,
    { attempts: number; after: number }
  >();
  private closing = false;
  private readonly startedAt = new Map<string, number>();
  constructor(
    readonly store: AutomationStore,
    private readonly factory: AutomationFactory,
  ) {}
  has = (owner: string) => this.bots.has(owner) || this.tasks.has(owner);
  health(now = Date.now()) {
    const workers = this.store
      .list()
      .filter((record) => record.desired === "running")
      .map((record) => {
        const started = this.startedAt.get(record.owner);
        const stalled = started !== undefined && now - started > 240_000;
        const healthy =
          !stalled &&
          record.phase !== "blocked" &&
          now - record.updatedAt < 240_000;
        return {
          owner: record.owner,
          healthy,
          stalled,
          phase: record.phase,
          updatedAt: record.updatedAt,
          reason: record.reason,
        };
      });
    return { healthy: workers.every((worker) => worker.healthy), workers };
  }
  async tick() {
    const records = this.store
      .list()
      .filter((record) =>
        this.closing
          ? this.bots.has(record.owner)
          : record.desired === "running" ||
            record.phase === "pausing" ||
            this.bots.has(record.owner),
      );
    const results = await Promise.allSettled(
      records.map((record) => {
        if (
          this.tasks.has(record.owner) ||
          (this.retries.get(record.owner)?.after ?? 0) > Date.now()
        )
          return;
        this.startedAt.set(record.owner, Date.now());
        const task = this.advance(record.owner).finally(() => {
          this.tasks.delete(record.owner);
          this.startedAt.delete(record.owner);
        });
        this.tasks.set(record.owner, task);
        return task;
      }),
    );
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Automation checkpoint failed; workers stopped");
  }
  private async advance(owner: string) {
    let bot = this.bots.get(owner);
    try {
      let record = this.store.get(owner)!;
      if (!bot) {
        bot = await this.factory(
          record,
          this.closing || record.desired === "paused",
        );
        this.bots.set(owner, bot);
        await this.store.change((records) => {
          const current = records.find((value) => value.owner === owner)!;
          current.started = true;
          if (record.config.hedge) current.hedgeBound = true;
        });
      }
      record = this.store.get(owner)!;
      const stopping = this.closing || record.desired === "paused";
      if (stopping) bot.stop();
      const snapshot = await bot.tick();
      const hedge = bot.hedge?.snapshot;
      await this.store.change((records) => {
        const current = records.find((value) => value.owner === owner)!;
        current.bot = snapshot;
        current.hedge = {
          maker: owner,
          enabled: Boolean(current.config.hedge),
          snapshot: hedge
            ? JSON.parse(
                JSON.stringify(hedge, (_key, value) =>
                  typeof value === "bigint" ? value.toString() : value,
                ),
              )
            : current.hedge.snapshot,
        };
        current.phase = stopping
          ? snapshot.phase === "stopped"
            ? "paused"
            : "pausing"
          : current.desired === "paused"
            ? "pausing"
            : snapshot.phase === "stopped"
              ? "blocked"
              : "running";
        current.reason = snapshot.reason;
        current.updatedAt = Date.now();
      });
      this.retries.delete(owner);
      if (stopping && snapshot.phase === "stopped") {
        await bot.close();
        this.bots.delete(owner);
      }
    } catch (error) {
      const attempts = (this.retries.get(owner)?.attempts ?? 0) + 1;
      this.retries.set(owner, {
        attempts,
        after: Date.now() + Math.min(30000, 2000 * 2 ** Math.min(attempts, 4)),
      });
      try {
        await this.store.change((records) => {
          const record = records.find((value) => value.owner === owner)!;
          record.phase =
            record.desired === "paused"
              ? !record.started && !bot
                ? "paused"
                : "pausing"
              : "blocked";
          record.reason = automationError(error);
          record.updatedAt = Date.now();
        });
      } catch {
        bot?.stop();
        throw new Error("Automation checkpoint failed; worker stopped");
      }
    }
  }
  async close(timeoutMs = 300000) {
    this.closing = true;
    await Promise.allSettled(this.tasks.values());
    for (const bot of this.bots.values()) bot.stop();
    const deadline = Date.now() + timeoutMs;
    while (this.bots.size && Date.now() < deadline) {
      await this.tick();
      if (this.bots.size)
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (this.bots.size)
      throw new Error(
        "Quote cancellation or hedge receipts remain unresolved; restore the retained checkpoint",
      );
  }
}
