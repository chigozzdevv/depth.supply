type Source = { source?: string };
const wire = JSON as typeof JSON & { rawJSON(source: string): unknown };

export function rpcJson(source: string): Record<string, unknown> {
  return JSON.parse(source, (_key, value: unknown, context?: Source) => {
    if (typeof value !== "number" || Number.isSafeInteger(value)) return value;
    if (!context?.source || typeof wire.rawJSON !== "function")
      throw new Error("RPC relay requires lossless JSON support");
    return wire.rawJSON(context.source);
  });
}
