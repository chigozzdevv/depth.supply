import { serviceUrl } from "@/shared/config/runtime";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const pathname = path.join("/");
  if (
    !/^(v1\/(markets|apps|quotes|operations|recovery)(\/[^.\s]*)?|v1\/maker\/(challenge|hedges)|\.well-known\/depth\/(devnet|localnet)\.json)$/.test(
      pathname,
    )
  ) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const target = new URL(`/${pathname}`, serviceUrl());
  target.search = new URL(request.url).search;
  try {
    const upstream = await fetch(target, {
      cache: "no-store",
      signal: request.signal,
      headers: request.headers.has("authorization")
        ? { authorization: request.headers.get("authorization")! }
        : {},
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch {
    return Response.json({ error: "service_unavailable" }, { status: 503 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (path.join("/") !== "v1/maker/session")
    return Response.json({ error: "not_found" }, { status: 404 });
  const body = await request.text();
  if (body.length > 1024)
    return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const upstream = await fetch(`${serviceUrl()}/v1/maker/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "service_unavailable" }, { status: 503 });
  }
}
