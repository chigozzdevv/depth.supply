import type { PublicKey } from "@solana/web3.js";
import type { MakerHedgeView } from "@depthhq/maker-sdk";
import { WalletAccess } from "@/shared/http/access";

export class MakerService {
  readonly access: WalletAccess;
  constructor(
    owner: PublicKey,
    readonly read: () => MakerHedgeView,
  ) {
    this.access = new WalletAccess(owner);
  }
}

export class MakerProxy {
  constructor(private readonly url: string) {
    const value = new URL(url);
    if (
      value.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(value.hostname)
    )
      throw new Error("Maker worker must use a loopback HTTP endpoint");
  }
  async request(path: string, authorization?: string, body?: unknown) {
    const response = await fetch(`${this.url}/v1/maker/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(authorization ? { authorization } : {}),
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (![200, 401, 403].includes(response.status))
      throw new Error("Maker worker unavailable");
    return { status: response.status, body: await response.json() };
  }
}
