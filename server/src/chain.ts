import { BorshAccountsCoder, type Idl } from "@anchor-lang/core";
import {
  appAddress,
  DEPTH_IDL,
  DEPTH_PROGRAM_ID,
  marketAddress,
  SOL_USD_MARKET_ID,
} from "@depth/bindings";
import type {
  OperationSnapshot,
  PublicApp,
  PublicMarket,
  PublicQuote,
  PublicRecovery,
  PublicWinddown,
} from "@depth/schema";
import { Connection, PublicKey } from "@solana/web3.js";

type NumberValue = { toString(): string };
type EnumValue = Record<string, unknown>;
type ChainAccount<T> = { value: T; slot: number };

type MarketData = {
  status: EnumValue;
  revision: NumberValue;
  settlementMint: PublicKey;
  oraclePriceE8: NumberValue;
  oracleTimestamp: NumberValue;
  fundingIndex: NumberValue;
  pendingOrder: PublicKey;
  config: {
    tradeFeeBps: number;
    insuranceFeeBps: number;
    initialMarginBps: number;
    maintenanceMarginBps: number;
  };
};

type QuoteData = {
  maker: PublicKey;
  operator: PublicKey;
  market: PublicKey;
  status: EnumValue;
  capacity: NumberValue;
  remainingCapacity: NumberValue;
  tierCount: number;
  expiry: NumberValue;
};

type AppData = {
  app: PublicKey;
  feeBps: number;
  version: NumberValue;
  active: boolean;
};

type OrderData = {
  kind: EnumValue;
  status: EnumValue;
  trader: PublicKey;
};

type DepositData = { status: EnumValue; owner: PublicKey };
type MarginData = { status: EnumValue; owner: PublicKey };
type RecoveryData = {
  market: PublicKey;
  recoveryKey: number[];
  signers: PublicKey[];
  accountCount: number;
};
type WinddownData = {
  market: PublicKey;
  priceE8: NumberValue;
  fundingIndex: NumberValue;
  expectedAccounts: number;
  revealedAccounts: number;
  paidAccounts: number;
  grossPositive: NumberValue;
  payoutPool: NumberValue;
  remainingPool: NumberValue;
  finalized: boolean;
};

const operationAccounts = [
  "OrderRecord",
  "DepositReceipt",
  "QuoteRecord",
  "MarginTransfer",
] as const;

function enumName(value: EnumValue): string {
  return Object.keys(value)[0]?.toLowerCase() ?? "unknown";
}

function numberString(value: NumberValue): string {
  return value.toString();
}

export class ChainReader {
  private readonly coder = new BorshAccountsCoder(DEPTH_IDL as Idl);

  constructor(
    private readonly connection: Connection,
    private readonly programId = DEPTH_PROGRAM_ID
  ) {}

  private async account<T>(
    address: PublicKey,
    accountName: string
  ): Promise<ChainAccount<T> | undefined> {
    const result = await this.connection.getAccountInfoAndContext(
      address,
      "confirmed"
    );
    if (!result.value) return undefined;
    if (!result.value.owner.equals(this.programId)) {
      throw new Error("Account is not owned by Depth");
    }
    return {
      value: this.coder.decode<T>(accountName, result.value.data),
      slot: result.context.slot,
    };
  }

  async market(): Promise<PublicMarket | undefined> {
    const address = marketAddress(this.programId);
    const account = await this.account<MarketData>(address, "Market");
    if (!account) return undefined;
    const { value, slot } = account;
    return {
      id: SOL_USD_MARKET_ID,
      address: address.toBase58(),
      status: enumName(value.status) as PublicMarket["status"],
      revision: numberString(value.revision),
      settlement_mint: value.settlementMint.toBase58(),
      oracle_price_e8: numberString(value.oraclePriceE8),
      oracle_timestamp: numberString(value.oracleTimestamp),
      funding_index: numberString(value.fundingIndex),
      fee_bps: value.config.tradeFeeBps,
      insurance_fee_bps: value.config.insuranceFeeBps,
      initial_margin_bps: value.config.initialMarginBps,
      maintenance_margin_bps: value.config.maintenanceMarginBps,
      ...(!value.pendingOrder.equals(PublicKey.default)
        ? { pending_order: value.pendingOrder.toBase58() }
        : {}),
      slot,
    };
  }

  async recovery(): Promise<PublicRecovery | undefined> {
    const market = marketAddress(this.programId);
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from("recovery-config"), market.toBuffer()],
      this.programId
    );
    const account = await this.account<RecoveryData>(address, "RecoveryConfig");
    if (!account) return undefined;
    if (!account.value.market.equals(market)) {
      throw new Error("Recovery config belongs to another market");
    }
    return {
      market_id: SOL_USD_MARKET_ID,
      recovery_key: Buffer.from(account.value.recoveryKey).toString("hex"),
      signers: account.value.signers.map((signer) => signer.toBase58()),
      threshold: 3,
      account_count: account.value.accountCount,
      slot: account.slot,
    };
  }

  async winddown(): Promise<PublicWinddown | undefined> {
    const market = marketAddress(this.programId);
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from("winddown"), market.toBuffer()],
      this.programId
    );
    const account = await this.account<WinddownData>(address, "Winddown");
    if (!account) return undefined;
    if (!account.value.market.equals(market)) {
      throw new Error("Winddown belongs to another market");
    }
    const { value, slot } = account;
    return {
      market_id: SOL_USD_MARKET_ID,
      price_e8: numberString(value.priceE8),
      funding_index: numberString(value.fundingIndex),
      expected_accounts: value.expectedAccounts,
      revealed_accounts: value.revealedAccounts,
      paid_accounts: value.paidAccounts,
      gross_positive: numberString(value.grossPositive),
      payout_pool: numberString(value.payoutPool),
      remaining_pool: numberString(value.remainingPool),
      finalized: value.finalized,
      slot,
    };
  }

  async quote(address: PublicKey): Promise<PublicQuote | undefined> {
    const account = await this.account<QuoteData>(address, "QuoteRecord");
    if (!account) return undefined;
    const { value, slot } = account;
    if (!value.market.equals(marketAddress(this.programId))) {
      throw new Error("Quote belongs to another market");
    }
    return {
      id: address.toBase58(),
      maker: value.maker.toBase58(),
      operator: value.operator.toBase58(),
      market_id: SOL_USD_MARKET_ID,
      status: enumName(value.status),
      capacity: numberString(value.capacity),
      remaining_capacity: numberString(value.remainingCapacity),
      tier_count: value.tierCount,
      expiry: numberString(value.expiry),
      slot,
    };
  }

  async app(app: PublicKey): Promise<PublicApp | undefined> {
    const account = await this.account<AppData>(
      appAddress(app, this.programId),
      "AppConfig"
    );
    if (!account) return undefined;
    const { value, slot } = account;
    if (!value.app.equals(app)) throw new Error("App identity mismatch");
    return {
      id: app.toBase58(),
      fee_bps: value.feeBps,
      version: numberString(value.version),
      active: value.active,
      slot,
    };
  }

  async operation(address: PublicKey): Promise<OperationSnapshot | undefined> {
    const result = await this.connection.getAccountInfoAndContext(
      address,
      "confirmed"
    );
    if (!result.value) return undefined;
    if (!result.value.owner.equals(this.programId)) {
      throw new Error("Account is not owned by Depth");
    }
    const accountName = operationAccounts.find((name) =>
      result
        .value!.data.subarray(0, 8)
        .equals(this.coder.accountDiscriminator(name))
    );
    if (!accountName) return undefined;
    const id = address.toBase58();
    const slot = result.context.slot;
    if (accountName === "OrderRecord") {
      const value = this.coder.decode<OrderData>(
        accountName,
        result.value.data
      );
      const status = enumName(value.status);
      const liquidation = enumName(value.kind) === "liquidation";
      return {
        id,
        kind: liquidation ? "risk" : "trade",
        owner: value.trader.toBase58(),
        market_id: SOL_USD_MARKET_ID,
        status:
          status === "filled"
            ? "finalized"
            : status === "rejected"
            ? "rejected"
            : status === "cancelled"
            ? "finalized"
            : "queued",
        ...(status === "filled" ? { outcome: "filled" as const } : {}),
        ...(status === "cancelled" ? { outcome: "cancelled" as const } : {}),
        slot,
      };
    }
    if (accountName === "DepositReceipt") {
      const value = this.coder.decode<DepositData>(
        accountName,
        result.value.data
      );
      const status = enumName(value.status);
      return {
        id,
        kind: "deposit",
        owner: value.owner.toBase58(),
        status:
          status === "credited" || status === "refunded"
            ? "finalized"
            : "queued",
        ...(status === "refunded" ? { outcome: "cancelled" as const } : {}),
        slot,
      };
    }
    if (accountName === "QuoteRecord") {
      const value = this.coder.decode<QuoteData>(
        accountName,
        result.value.data
      );
      const status = enumName(value.status);
      return {
        id,
        kind: "quote",
        owner: value.maker.toBase58(),
        market_id: SOL_USD_MARKET_ID,
        status:
          status === "active" || status === "filled" || status === "cancelled"
            ? "finalized"
            : status === "rejected"
            ? "rejected"
            : "queued",
        ...(status === "active" ? { outcome: "active" as const } : {}),
        ...(status === "cancelled" ? { outcome: "cancelled" as const } : {}),
        slot,
      };
    }
    const value = this.coder.decode<MarginData>(accountName, result.value.data);
    const status = enumName(value.status);
    return {
      id,
      kind: "margin",
      owner: value.owner.toBase58(),
      market_id: SOL_USD_MARKET_ID,
      status:
        status === "settled" || status === "refunded"
          ? "finalized"
          : status === "rejected"
          ? "rejected"
          : "queued",
      ...(status === "refunded" ? { outcome: "cancelled" as const } : {}),
      slot,
    };
  }
}
