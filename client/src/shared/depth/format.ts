export function units(value: string, decimals = 6): bigint {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(value.trim()))
    throw new Error(`Enter an amount with at most ${decimals} decimal places`);
  const [whole, fraction = ""] = value.trim().split(".");
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0"))
  );
}
export function decimal(
  value: bigint | undefined,
  decimals = 6,
  digits = 2,
): string {
  if (value === undefined) return "—";
  const sign = value < 0n ? "-" : "";
  const amount = value < 0n ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const fraction = (amount % scale)
    .toString()
    .padStart(decimals, "0")
    .slice(0, digits);
  return `${sign}${(amount / scale).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}
export function short(value: string): string {
  return `${value.slice(0, 5)}…${value.slice(-4)}`;
}
export function nonce(): bigint {
  return new DataView(
    crypto.getRandomValues(new Uint8Array(8)).buffer,
  ).getBigUint64(0, true);
}
export function explorer(id: string, environment: string): string {
  return `https://explorer.solana.com/address/${id}?cluster=${environment === "localnet" ? "custom" : environment}`;
}
export function transactionUrl(signature: string, environment: string): string {
  const cluster =
    environment === "mainnet" || environment === "mainnet-beta"
      ? ""
      : `?cluster=${environment === "localnet" ? "custom" : environment}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}
