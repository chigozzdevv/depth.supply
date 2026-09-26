export const integerString = { type: "string", pattern: "^[0-9]+$" } as const;
export const signedString = { type: "string", pattern: "^-?[0-9]+$" } as const;
export const slotNumber = { type: "integer", minimum: 0 } as const;
export const keyString = {
  type: "string",
  minLength: 32,
  maxLength: 44,
} as const;
