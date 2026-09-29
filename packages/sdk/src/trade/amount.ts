import { u64 } from "@/trade/input";

export type AmountSelector = bigint | "all" | `${number}%`;

export function resolveAmount(
  selector: AmountSelector,
  available: bigint,
  name: string
): bigint {
  u64(available, "available");
  let amount: bigint;
  if (typeof selector === "bigint") {
    amount = selector;
  } else if (selector === "all") {
    amount = available;
  } else {
    const match = /^(\d{1,3})(?:\.(\d{1,4}))?%$/.exec(selector);
    if (!match) throw new RangeError(`${name} percentage is invalid`);
    const parts =
      BigInt(match[1]) * 10_000n +
      BigInt((match[2] ?? "").padEnd(4, "0") || "0");
    if (parts === 0n || parts > 1_000_000n)
      throw new RangeError(
        `${name} percentage must be above zero and at most 100%`
      );
    amount = (available * parts) / 1_000_000n;
  }
  u64(amount, name);
  if (amount === 0n || amount > available)
    throw new RangeError(`${name} is zero or exceeds the available amount`);
  return amount;
}
