export const addressParam = {
  type: "object",
  required: ["address"],
  additionalProperties: false,
  properties: {
    address: { type: "string", minLength: 32, maxLength: 44 },
  },
} as const;

export const marketParam = {
  type: "object",
  required: ["marketId"],
  additionalProperties: false,
  properties: {
    marketId: { type: "string", minLength: 1, maxLength: 32 },
  },
} as const;

export const errorResponse = {
  type: "object",
  required: ["error"],
  additionalProperties: false,
  properties: { error: { type: "string" } },
} as const;
