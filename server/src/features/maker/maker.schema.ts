import { errorResponse } from "@/shared/http/http.schema";

export const challengeSchema = {
  querystring: {
    type: "object",
    required: ["wallet"],
    additionalProperties: false,
    properties: {
      wallet: { type: "string", pattern: "^[1-9A-HJ-NP-Za-km-z]{32,44}$" },
    },
  },
  response: { 401: errorResponse, 403: errorResponse },
} as const;
export const sessionSchema = {
  body: {
    type: "object",
    required: ["nonce", "signature"],
    additionalProperties: false,
    properties: {
      nonce: { type: "string", pattern: "^[0-9a-f]{64}$" },
      signature: { type: "string", minLength: 88, maxLength: 88 },
    },
  },
  response: { 401: errorResponse, 403: errorResponse },
} as const;
