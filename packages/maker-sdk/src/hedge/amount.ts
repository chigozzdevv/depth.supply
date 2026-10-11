export function units(value: string, decimals: number, exact = true): bigint {
  if (!/^-?\d+(?:\.\d+)?$/.test(value))
    throw new Error("External decimal is invalid");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const extra = fraction.slice(decimals);
  if (exact && /[1-9]/.test(extra))
    throw new Error("External decimal exceeds precision");
  const amount =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.slice(0, decimals).padEnd(decimals, "0") || "0");
  return negative
    ? -amount - (!exact && /[1-9]/.test(extra) ? 1n : 0n)
    : amount;
}
export function decimal(value: bigint, decimals: number): string {
  const magnitude = value < 0n ? -value : value;
  const base = 10n ** BigInt(decimals);
  const fraction = (magnitude % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${value < 0n ? "-" : ""}${magnitude / base}${fraction ? `.${fraction}` : ""}`;
}
