import { HttpConnection } from "@depthhq/sdk";

export function chainConnection(
  url: string,
  request: typeof fetch = fetch,
): HttpConnection {
  return new HttpConnection(url, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
    fetch: (input, init) =>
      request(input, {
        ...init,
        signal: AbortSignal.any([
          ...(init?.signal ? [init.signal] : []),
          AbortSignal.timeout(15_000),
        ]),
      }),
  });
}
