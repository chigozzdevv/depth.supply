export const runtime = "nodejs";
const methods = new Set([
  "getGenesisHash",
  "getAccountInfo",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getLatestBlockhash",
  "getBlockHeight",
  "getSignatureStatuses",
  "getTransaction",
  "getSignaturesForAddress",
  "getBalance",
  "getTokenAccountsByOwner",
  "getTokenAccountBalance",
  "getMinimumBalanceForRentExemption",
  "getSlot",
  "getFeeForMessage",
  "getRecentPrioritizationFees",
  "simulateTransaction",
  "sendTransaction",
  "isBlockhashValid",
]);
const buckets = new Map<string, { count: number; since: number }>();
export async function POST(request: Request) {
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  ) {
    return Response.json({ error: "origin_mismatch" }, { status: 403 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const current = buckets.get(ip);
  const bucket =
    current && Date.now() - current.since < 60_000
      ? current
      : { count: 0, since: Date.now() };
  if (++bucket.count > 240)
    return Response.json({ error: "rate_limited" }, { status: 429 });
  buckets.set(ip, bucket);
  if (buckets.size > 1000) buckets.delete(buckets.keys().next().value!);
  try {
    const text = await request.text();
    if (text.length > 100_000)
      return Response.json({ error: "request_too_large" }, { status: 413 });
    const payload = JSON.parse(text);
    if (
      Array.isArray(payload) ||
      payload.jsonrpc !== "2.0" ||
      !methods.has(payload.method)
    ) {
      return Response.json({ error: "invalid_rpc_method" }, { status: 400 });
    }
    const url = process.env.SOLANA_RPC_URL;
    if (!url)
      return Response.json({ error: "rpc_unconfigured" }, { status: 503 });
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!response.ok)
      return Response.json({ error: "rpc_unavailable" }, { status: 503 });
    return new Response(response.body, {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "rpc_unavailable" }, { status: 503 });
  }
}
