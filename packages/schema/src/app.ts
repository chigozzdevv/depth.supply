import { integerString, keyString, slotNumber } from "@/common";

export type PublicApp = {
  id: string;
  fee_bps: number;
  version: string;
  active: boolean;
  slot: number;
};

export const publicAppSchema = {
  type: "object",
  required: ["id", "fee_bps", "version", "active", "slot"],
  additionalProperties: false,
  properties: {
    id: keyString,
    fee_bps: { type: "integer", minimum: 0 },
    version: integerString,
    active: { type: "boolean" },
    slot: slotNumber,
  },
} as const;
