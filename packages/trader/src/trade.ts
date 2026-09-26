import * as anchor from "@anchor-lang/core";

export function encodeSide(direction: "long" | "short"): bigint {
  return direction === "long" ? 1n : 255n;
}

export function u64(value: bigint, name: string): anchor.BN {
  if (typeof value !== "bigint" || value < 0n || value > (1n << 64n) - 1n) {
    throw new RangeError(`${name} must be an unsigned 64-bit bigint`);
  }
  return new anchor.BN(value.toString());
}
