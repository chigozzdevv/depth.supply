const temporary = new Set([408, 429, 500, 502, 503, 504]);

export async function relayRpc(
  url: string,
  body: string,
  method: string,
  signal: AbortSignal,
): Promise<Response> {
  const attempts = method === "sendTransaction" ? 1 : 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let delay = 200 * (attempt + 1);
    try {
      signal.throwIfAborted();
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        cache: "no-store",
      });
      if (response.ok) {
        const text = await response.text();
        const payload = JSON.parse(text);
        if (
          payload.jsonrpc !== "2.0" ||
          !("result" in payload || "error" in payload)
        )
          throw new Error("Invalid RPC response");
        if (payload.error?.code !== -32005 || attempt + 1 === attempts)
          return new Response(text, {
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          });
      } else {
        console.warn("RPC upstream rejected request", {
          method,
          status: response.status,
          attempt: attempt + 1,
        });
        await response.body?.cancel();
        if (!temporary.has(response.status) || attempt + 1 === attempts) break;
        const retry = Number(response.headers.get("retry-after"));
        if (Number.isFinite(retry) && retry > 0)
          delay = Math.min(retry * 1000, 1000);
      }
    } catch (cause) {
      console.warn("RPC upstream request interrupted", {
        method,
        attempt: attempt + 1,
        reason: cause instanceof Error ? cause.name : "unknown",
      });
      if (signal.aborted || attempt + 1 === attempts) break;
    }
    await new Promise<void>((resolve) => {
      if (signal.aborted) return resolve();
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, delay);
      signal.addEventListener("abort", done, { once: true });
    });
  }
  return Response.json(
    { error: "rpc_unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}
