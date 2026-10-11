import { serviceUrl } from "@/shared/config/runtime";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const pathname = path.join("/");
  if (
    !/^(v1\/(markets|apps|quotes|operations|recovery|views)(\/[^.\s]*)?|v1\/maker\/(challenge|hedges|automation(?:\/challenge)?)|\.well-known\/depth\/(devnet|localnet)\.json)$/.test(
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
  const pathname = path.join("/");
  if (
    !/^(v1\/views(?:\/close)?|v1\/maker\/(session|automation\/(session|configure|start|pause|fund)))$/.test(
      pathname,
    )
  )
    return Response.json({ error: "not_found" }, { status: 404 });
  const body = await request.text();
  if (body.length > (/\/(configure|fund)$/.test(pathname) ? 4096 : 1024))
    return Response.json({ error: "invalid_request" }, { status: 400 });
  try {
    const upstream = await fetch(`${serviceUrl()}/${pathname}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(request.headers.has("authorization")
          ? { authorization: request.headers.get("authorization")! }
          : {}),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(pathname.startsWith("v1/views") ? 60_000 : 10_000),
      ]),
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
