import { integerString, keyString, slotNumber } from "@/common";

export type PublicQuote = {
  id: string;
  maker: string;
  operator: string;
  market_id: string;
  status: string;
  capacity: string;
  tier_count: number;
  expiry: string;
  slot: number;
};

export const publicQuoteSchema = {
  type: "object",
  required: [
    "id",
    "maker",
    "operator",
    "market_id",
    "status",
    "capacity",
    "tier_count",
    "expiry",
    "slot",
  ],
  additionalProperties: false,
  properties: {
    id: keyString,
    maker: keyString,
    operator: keyString,
    market_id: { type: "string", const: "SOL-USD" },
    status: { type: "string" },
    capacity: integerString,
    tier_count: { type: "integer", minimum: 0, maximum: 4 },
    expiry: integerString,
    slot: slotNumber,
  },
} as const;
