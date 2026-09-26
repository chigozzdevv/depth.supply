import { integerString, keyString, signedString, slotNumber } from "@/common";

export type PublicRecovery = {
  market_id: string;
  recovery_key: string;
  signers: string[];
  threshold: number;
  account_count: number;
  slot: number;
};

export type PublicWinddown = {
  market_id: string;
  price_e8: string;
  funding_index: string;
  expected_accounts: number;
  revealed_accounts: number;
  paid_accounts: number;
  gross_positive: string;
  payout_pool: string;
  remaining_pool: string;
  finalized: boolean;
  slot: number;
};

export const publicRecoverySchema = {
  type: "object",
  required: [
    "market_id",
    "recovery_key",
    "signers",
    "threshold",
    "account_count",
    "slot",
  ],
  additionalProperties: false,
  properties: {
    market_id: { type: "string", const: "SOL-USD" },
    recovery_key: { type: "string", pattern: "^[0-9a-f]{64}$" },
    signers: { type: "array", items: keyString, minItems: 5, maxItems: 5 },
    threshold: { type: "integer", const: 3 },
    account_count: { type: "integer", minimum: 0 },
    slot: slotNumber,
  },
} as const;

export const publicWinddownSchema = {
  type: "object",
  required: [
    "market_id",
    "price_e8",
    "funding_index",
    "expected_accounts",
    "revealed_accounts",
    "paid_accounts",
    "gross_positive",
    "payout_pool",
    "remaining_pool",
    "finalized",
    "slot",
  ],
  additionalProperties: false,
  properties: {
    market_id: { type: "string", const: "SOL-USD" },
    price_e8: integerString,
    funding_index: signedString,
    expected_accounts: { type: "integer", minimum: 0 },
    revealed_accounts: { type: "integer", minimum: 0 },
    paid_accounts: { type: "integer", minimum: 0 },
    gross_positive: integerString,
    payout_pool: integerString,
    remaining_pool: integerString,
    finalized: { type: "boolean" },
    slot: slotNumber,
  },
} as const;
