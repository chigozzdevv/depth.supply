import { integerString, keyString, signedString, slotNumber } from "@/common";

export type PublicMarket = {
  id: string;
  address: string;
  status: "draft" | "active" | "paused" | "settling";
  revision: string;
  settlement_mint: string;
  oracle_price_e8: string;
  oracle_timestamp: string;
  funding_index: string;
  fee_bps: number;
  insurance_fee_bps: number;
  initial_margin_bps: number;
  maintenance_margin_bps: number;
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
    "oracle_timestamp",
    "funding_index",
    "fee_bps",
    "insurance_fee_bps",
    "initial_margin_bps",
    "maintenance_margin_bps",
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
    oracle_timestamp: signedString,
    funding_index: signedString,
    fee_bps: { type: "integer", minimum: 0 },
    insurance_fee_bps: { type: "integer", minimum: 0 },
    initial_margin_bps: { type: "integer", minimum: 0 },
    maintenance_margin_bps: { type: "integer", minimum: 0 },
    pending_order: keyString,
    slot: slotNumber,
  },
} as const;
