import { Buffer } from "buffer";
import type { PublicKey } from "@solana/web3.js";
import { hedgeView } from "@/hedge/schema";

type Wire<T> = T extends bigint
  ? string
  : T extends Array<infer U>
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;
export type MakerHedgeView = {
  enabled: boolean;
  maker: string;
  snapshot: Wire<import("@/hedge/types").HedgeSnapshot> | null;
};
export const accessMessage = (
  wallet: string,
  nonce: string,
  expiresAt: number,
) =>
  `Depth maker access\nWallet: ${wallet}\nScope: Read hedge history\nNonce: ${nonce}\nExpires: ${expiresAt}`;

export class MakerAccess {
  private token?: { value: string; expiresAt: number };
  constructor(
    private readonly options: {
      serviceUrl?: string;
      wallet: {
        publicKey: PublicKey;
        signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
      };
    },
  ) {}
  private async request(path: string, init?: RequestInit) {
    if (!this.options.serviceUrl)
      throw new Error("A maker service URL is required");
    const response = await fetch(
      `${this.options.serviceUrl.replace(/\/$/, "")}/v1/maker/${path}`,
      {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (response.status === 401) {
      this.token = undefined;
      throw new Error("Authorize access with your maker wallet");
    }
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "This worker belongs to another maker"
          : "Maker worker is unavailable",
      );
    return response.json();
  }
  async authorize() {
    const wallet = this.options.wallet;
    if (!wallet.signMessage)
      throw new Error("This wallet cannot sign access messages");
    const challenge = (await this.request(
      `challenge?wallet=${wallet.publicKey.toBase58()}`,
    )) as { wallet: string; nonce: string; expiresAt: number; message: string };
    if (
      challenge.wallet !== wallet.publicKey.toBase58() ||
      !/^[0-9a-f]{64}$/.test(challenge.nonce) ||
      !Number.isSafeInteger(challenge.expiresAt) ||
      challenge.expiresAt <= Date.now() ||
      challenge.expiresAt > Date.now() + 120_000 ||
      challenge.message !==
        accessMessage(challenge.wallet, challenge.nonce, challenge.expiresAt)
    )
      throw new Error("Maker access challenge is invalid");
    const signature = await wallet.signMessage(
      new TextEncoder().encode(challenge.message),
    );
    const session = (await this.request("session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nonce: challenge.nonce,
        signature: Buffer.from(signature).toString("base64"),
      }),
    })) as { token: string; expiresAt: number };
    if (
      !/^[0-9a-f]{64}$/.test(session.token) ||
      !Number.isSafeInteger(session.expiresAt) ||
      session.expiresAt <= Date.now() ||
      session.expiresAt > Date.now() + 16 * 60_000
    )
      throw new Error("Maker access session is invalid");
    this.token = { value: session.token, expiresAt: session.expiresAt };
  }
  async summary(): Promise<MakerHedgeView> {
    if (!this.token || this.token.expiresAt <= Date.now()) {
      this.token = undefined;
      throw new Error("Authorize access with your maker wallet");
    }
    return hedgeView(
      await this.request("hedges", {
        headers: { authorization: `Bearer ${this.token.value}` },
      }),
      this.options.wallet.publicKey.toBase58(),
    );
  }
  disconnect() {
    this.token = undefined;
  }
}
