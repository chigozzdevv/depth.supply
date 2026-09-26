import { integerString, keyString, slotNumber } from "@/common";

export type OperationKind =
  "deposit" | "withdraw" | "quote" | "trade" | "margin" | "view" | "risk";

export type OperationStatus =
  "queued" | "finalized" | "rejected" | "expired" | "failed";

export type OperationSnapshot = {
  id: string;
  kind: OperationKind;
  owner: string;
  market_id?: string;
  status: OperationStatus;
  outcome?: "filled" | "active" | "cancelled" | "no_change";
  state_version?: string;
  tx_signature?: string;
  slot: number;
};

export const operationSnapshotSchema = {
  type: "object",
  required: ["id", "kind", "owner", "status", "slot"],
  additionalProperties: false,
  properties: {
    id: keyString,
    kind: {
      type: "string",
      enum: ["deposit", "withdraw", "quote", "trade", "margin", "view", "risk"],
    },
    owner: keyString,
    market_id: { type: "string", const: "SOL-USD" },
    status: {
      type: "string",
      enum: ["queued", "finalized", "rejected", "expired", "failed"],
    },
    outcome: {
      type: "string",
      enum: ["filled", "active", "cancelled", "no_change"],
    },
    state_version: integerString,
    tx_signature: { type: "string" },
    slot: slotNumber,
  },
} as const;
