import {
  DEPTH_PROGRAM_ID,
  quoteQueueAddress,
  SOL_USD_MARKET_ID,
} from "@depthhq/bindings";
import { PublicKey } from "@solana/web3.js";
import type { DepthClient } from "@/client/client";
import type { MarketState } from "@/client/types";

type QueueState = { market: PublicKey; entries: PublicKey[]; count: number };

export type MarketPolicy = {
  initialMarginBps: number;
  maintenanceMarginBps: number;
  liquidationFeeBps: number;
  tradeFeeBps: number;
  insuranceFeeBps: number;
  maxAccountNotional: bigint;
  maxMarketNotional: bigint;
  maxOracleAgeSeconds: number;
  maxConfidenceBps: number;
  maxQuoteDeviationBps: number;
  maxQuoteLifetimeSeconds: number;
  maxOrderQueueSeconds: number;
  fundingIntervalSeconds: number;
  fundingRateCapBps: number;
  quoteTiers: bigint[];
  backstopMinCollateral: bigint;
};

export type MarketSummary = {
  id: typeof SOL_USD_MARKET_ID;
  address: PublicKey;
  settlementMint: PublicKey;
  status: string;
  incident: string;
  revision: bigint;
  oraclePriceE8: bigint;
  oracleEmaE8: bigint;
  oracleConfidenceE8: bigint;
  oracleTimestamp: bigint;
  oracleSlot: bigint;
  fundingIndex: bigint;
  lastFundingTimestamp: bigint;
  activeQuoteIds: PublicKey[];
  waitingQuoteIds: PublicKey[];
  policy: MarketPolicy;
  slot: number;
};

function value(input: { toString(): string }): bigint {
  return BigInt(input.toString());
}

function name(input: Record<string, unknown>): string {
  return Object.keys(input)[0] ?? "unknown";
}

function policy(market: MarketState): MarketPolicy {
  const config = market.config;
  return {
    initialMarginBps: config.initialMarginBps,
    maintenanceMarginBps: config.maintenanceMarginBps,
    liquidationFeeBps: config.liquidationFeeBps,
    tradeFeeBps: config.tradeFeeBps,
    insuranceFeeBps: config.insuranceFeeBps,
    maxAccountNotional: value(config.maxAccountNotional),
    maxMarketNotional: value(config.maxMarketNotional),
    maxOracleAgeSeconds: config.maxOracleAgeSeconds,
    maxConfidenceBps: config.maxConfidenceBps,
    maxQuoteDeviationBps: config.maxQuoteDeviationBps,
    maxQuoteLifetimeSeconds: config.maxQuoteLifetimeSeconds,
    maxOrderQueueSeconds: config.maxOrderQueueSeconds,
    fundingIntervalSeconds: config.fundingIntervalSeconds,
    fundingRateCapBps: config.fundingRateCapBps,
    quoteTiers: config.quoteTiers.map(value),
    backstopMinCollateral: value(config.backstopMinCollateral),
  };
}

export class MarketCatalog {
  constructor(private readonly client: DepthClient) {}

  async market(id: string): Promise<MarketSummary> {
    if (id !== SOL_USD_MARKET_ID) throw new RangeError("Unsupported market");
    const response =
      await this.client.options.connection.getMultipleAccountsInfoAndContext(
        [this.client.marketAddress, quoteQueueAddress()],
        "confirmed",
      );
    const [marketInfo, queueInfo] = response.value;
    if (
      !marketInfo?.owner.equals(DEPTH_PROGRAM_ID) ||
      !queueInfo?.owner.equals(DEPTH_PROGRAM_ID)
    )
      throw new Error("Market policy or waiting queue is unavailable");
    const market = this.client.program.coder.accounts.decode<MarketState>(
      "market",
      marketInfo.data,
    );
    const queue = this.client.program.coder.accounts.decode<QueueState>(
      "quoteQueue",
      queueInfo.data,
    );
    if (
      !queue.market.equals(this.client.marketAddress) ||
      queue.count > queue.entries.length
    )
      throw new Error("Market waiting queue is invalid");
    return {
      id: SOL_USD_MARKET_ID,
      address: this.client.marketAddress,
      settlementMint: market.settlementMint,
      status: name(market.status),
      incident: name(market.incident),
      revision: value(market.revision),
      oraclePriceE8: value(market.oraclePriceE8),
      oracleEmaE8: value(market.oracleEmaE8),
      oracleConfidenceE8: value(market.oracleConfidenceE8),
      oracleTimestamp: value(market.oracleTimestamp),
      oracleSlot: value(market.oracleSlot),
      fundingIndex: value(market.fundingIndex),
      lastFundingTimestamp: value(market.lastFundingTimestamp),
      activeQuoteIds: market.activeQuotes.slice(0, market.activeQuoteCount),
      waitingQuoteIds: queue.entries.slice(0, queue.count),
      policy: policy(market),
      slot: response.context.slot,
    };
  }

  async markets(): Promise<{ items: MarketSummary[]; nextCursor?: string }> {
    return { items: [await this.market(SOL_USD_MARKET_ID)] };
  }

  async marketPolicy(id: string): Promise<MarketPolicy> {
    return (await this.market(id)).policy;
  }
}
