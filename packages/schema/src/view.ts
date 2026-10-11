import { integerString, keyString } from "@/common";

export type ViewKind = "balance" | "market" | "fill" | "quote";
export const viewScopes = { balance: 1, market: 2, fill: 4, quote: 8 } as const;
export type ViewRequest = {
  owner: string;
  reader: string;
  permit: string;
  kind: ViewKind;
  source: string;
  nonce: string;
  expiresAt: number;
  signature: string;
};
export type ViewReceipt = { id: string; payer: string; signature: string };

export function viewMessage(
  program: string,
  request: Omit<ViewRequest, "signature">,
  action: "read" | "close" = "read",
): string {
  return [
    "Depth private views v1",
    program,
    action,
    request.owner,
    request.reader,
    request.permit,
    request.kind,
    request.source,
    request.nonce,
    String(request.expiresAt),
  ].join("\n");
}

export const viewRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "owner",
    "reader",
    "permit",
    "kind",
    "source",
    "nonce",
    "expiresAt",
    "signature",
  ],
  properties: {
    owner: keyString,
    reader: keyString,
    permit: keyString,
    kind: { type: "string", enum: ["balance", "market", "fill", "quote"] },
    source: keyString,
    nonce: { ...integerString, maxLength: 20 },
    expiresAt: { type: "integer", minimum: 1 },
    signature: { type: "string", minLength: 88, maxLength: 88 },
  },
} as const;
