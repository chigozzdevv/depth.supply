import { relayRpc } from "@/shared/rpc/relay";

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
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  target.host = request.headers.get("host") ?? target.host;
  if (origin && origin !== target.origin) {
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
  let text: string;
  let payload: { jsonrpc: string; method: string };
  try {
    text = await request.text();
    if (text.length > 100_000)
      return Response.json({ error: "request_too_large" }, { status: 413 });
    payload = JSON.parse(text);
    if (
      !payload ||
      Array.isArray(payload) ||
      payload.jsonrpc !== "2.0" ||
      !methods.has(payload.method)
    ) {
      return Response.json({ error: "invalid_rpc_method" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "invalid_rpc_request" }, { status: 400 });
  }
  try {
    const url = process.env.SOLANA_RPC_URL;
    if (!url)
      return Response.json({ error: "rpc_unconfigured" }, { status: 503 });
    return await relayRpc(
      url,
      text,
      payload.method,
      AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
    );
  } catch {
    return Response.json({ error: "rpc_unavailable" }, { status: 503 });
  }
}
