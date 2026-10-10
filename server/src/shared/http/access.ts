import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import type { PublicKey } from "@solana/web3.js";

export class WalletAccess {
  private readonly challenges = new Map<
    string,
    { message: string; expiresAt: number }
  >();
  private readonly sessions = new Map<string, number>();
  constructor(readonly owner: PublicKey) {}
  private clean() {
    for (const [key, value] of this.challenges)
      if (value.expiresAt <= Date.now()) this.challenges.delete(key);
    for (const [key, value] of this.sessions)
      if (value <= Date.now()) this.sessions.delete(key);
  }
  challenge(wallet: string) {
    this.clean();
    if (wallet !== this.owner.toBase58()) return;
    if (this.challenges.size >= 128)
      throw new Error("Maker access challenge limit reached");
    const nonce = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 60_000;
    const message = `Depth maker access\nWallet: ${wallet}\nScope: Read hedge history\nNonce: ${nonce}\nExpires: ${expiresAt}`;
    this.challenges.set(nonce, { message, expiresAt });
    return { wallet, nonce, expiresAt, message };
  }
  session(nonce: string, signature: string) {
    this.clean();
    const challenge = this.challenges.get(nonce);
    this.challenges.delete(nonce);
    if (!challenge || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) return;
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        this.owner.toBuffer(),
      ]),
      format: "der",
      type: "spki",
    });
    if (
      !verify(
        null,
        Buffer.from(challenge.message),
        key,
        Buffer.from(signature, "base64"),
      )
    )
      return;
    if (this.sessions.size >= 128)
      throw new Error("Maker access session limit reached");
    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 15 * 60_000;
    this.sessions.set(
      createHash("sha256").update(token).digest("hex"),
      expiresAt,
    );
    return { token, expiresAt };
  }
  authorized(header?: string) {
    this.clean();
    if (!header || !/^Bearer [0-9a-f]{64}$/.test(header)) return false;
    return this.sessions.has(
      createHash("sha256").update(header.slice(7)).digest("hex"),
    );
  }
}
