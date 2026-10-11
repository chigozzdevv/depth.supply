export const revisionSchema = {
  type: "integer",
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
} as const;
export const configureSchema = {
  body: {
    type: "object",
    required: ["revision", "config"],
    additionalProperties: false,
    properties: { revision: revisionSchema, config: { type: "object" } },
  },
} as const;
export const commandSchema = {
  body: {
    type: "object",
    required: ["revision"],
    additionalProperties: false,
    properties: { revision: { ...revisionSchema, minimum: 1 } },
  },
} as const;
export const fundingSchema = {
  body: {
    type: "object",
    required: ["revision"],
    additionalProperties: false,
    properties: {
      revision: { ...revisionSchema, minimum: 1 },
      transaction: {
        type: "string",
        minLength: 100,
        maxLength: 1600,
        pattern: "^[A-Za-z0-9+/]+=*$",
      },
      lastValidBlockHeight: {
        type: "integer",
        minimum: 1,
        maximum: Number.MAX_SAFE_INTEGER,
      },
      targetLamports: { type: "string", pattern: "^[0-9]{1,20}$" },
    },
  },
} as const;
