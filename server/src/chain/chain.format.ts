export type IntegerValue = { toString(): string };
export type Variant = Record<string, unknown>;

export function integer(value: IntegerValue): string {
  return value.toString();
}

export function variant(value: Variant): string {
  return Object.keys(value)[0]?.toLowerCase() ?? "unknown";
}
