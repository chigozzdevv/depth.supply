import { integerString, keyString, signedString, slotNumber } from "@/common";

export type PublicMarket = {
  id: string;
  address: string;
  status: "draft" | "active" | "paused" | "settling";
  revision: string;
  settlement_mint: string;
  oracle_price_e8: string;
  oracle_ema_e8: string;
  oracle_confidence_e8: string;
  oracle_timestamp: string;
  oracle_slot: string;
  funding_index: string;
  last_funding_timestamp: string;
  fee_bps: number;
  insurance_fee_bps: number;
  initial_margin_bps: number;
  maintenance_margin_bps: number;
  liquidation_fee_bps: number;
  max_account_notional: string;
  max_market_notional: string;
  max_oracle_age_seconds: number;
  max_confidence_bps: number;
  max_quote_deviation_bps: number;
  max_quote_lifetime_seconds: number;
  max_order_queue_seconds: number;
  funding_interval_seconds: number;
  funding_rate_cap_bps: number;
  quote_tiers: string[];
  backstop_min_collateral: string;
  pending_order?: string;
  slot: number;
};

export const publicMarketSchema = {
  type: "object",
  required: [
    "id",
    "address",
    "status",
    "revision",
    "settlement_mint",
    "oracle_price_e8",
    "oracle_ema_e8",
    "oracle_confidence_e8",
    "oracle_timestamp",
    "oracle_slot",
    "funding_index",
    "last_funding_timestamp",
    "fee_bps",
    "insurance_fee_bps",
    "initial_margin_bps",
    "maintenance_margin_bps",
    "liquidation_fee_bps",
    "max_account_notional",
    "max_market_notional",
    "max_oracle_age_seconds",
    "max_confidence_bps",
    "max_quote_deviation_bps",
    "max_quote_lifetime_seconds",
    "max_order_queue_seconds",
    "funding_interval_seconds",
    "funding_rate_cap_bps",
    "quote_tiers",
    "backstop_min_collateral",
    "slot",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", const: "SOL-USD" },
    address: keyString,
    status: { type: "string", enum: ["draft", "active", "paused", "settling"] },
    revision: integerString,
    settlement_mint: keyString,
    oracle_price_e8: integerString,
    oracle_ema_e8: integerString,
    oracle_confidence_e8: integerString,
    oracle_timestamp: signedString,
    oracle_slot: integerString,
    funding_index: signedString,
    last_funding_timestamp: signedString,
    fee_bps: { type: "integer", minimum: 0 },
    insurance_fee_bps: { type: "integer", minimum: 0 },
    initial_margin_bps: { type: "integer", minimum: 0 },
    maintenance_margin_bps: { type: "integer", minimum: 0 },
    liquidation_fee_bps: { type: "integer", minimum: 0 },
    max_account_notional: integerString,
    max_market_notional: integerString,
    max_oracle_age_seconds: { type: "integer", minimum: 0 },
    max_confidence_bps: { type: "integer", minimum: 0 },
    max_quote_deviation_bps: { type: "integer", minimum: 0 },
    max_quote_lifetime_seconds: { type: "integer", minimum: 0 },
    max_order_queue_seconds: { type: "integer", minimum: 0 },
    funding_interval_seconds: { type: "integer", minimum: 0 },
    funding_rate_cap_bps: { type: "integer", minimum: 0 },
    quote_tiers: { type: "array", items: integerString, minItems: 4, maxItems: 4 },
    backstop_min_collateral: integerString,
    pending_order: keyString,
    slot: slotNumber,
  },
} as const;
