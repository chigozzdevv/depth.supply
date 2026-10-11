import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

export class WalletAccess {
  private readonly challenges = new Map<
    string,
    { message: string; expiresAt: number; wallet: string }
  >();
  private readonly sessions = new Map<
    string,
    { expiresAt: number; wallet: string }
  >();
  constructor(
    readonly owner?: PublicKey,
    readonly scope = "Read hedge history",
  ) {}
  private clean() {
    for (const [key, value] of this.challenges)
      if (value.expiresAt <= Date.now()) this.challenges.delete(key);
    for (const [key, value] of this.sessions)
      if (value.expiresAt <= Date.now()) this.sessions.delete(key);
  }
  challenge(wallet: string) {
    this.clean();
    try {
      if (
        new PublicKey(wallet).toBase58() !== wallet ||
        (this.owner && wallet !== this.owner.toBase58())
      )
        return;
    } catch {
      return;
    }
    if (this.challenges.size >= 128)
      throw new Error("Maker access challenge limit reached");
    const nonce = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 60_000;
    const message = `Depth maker access\nWallet: ${wallet}\nScope: ${this.scope}\nNonce: ${nonce}\nExpires: ${expiresAt}`;
    this.challenges.set(nonce, { message, expiresAt, wallet });
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
        new PublicKey(challenge.wallet).toBuffer(),
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
    this.sessions.set(createHash("sha256").update(token).digest("hex"), {
      expiresAt,
      wallet: challenge.wallet,
    });
    return { token, expiresAt };
  }
  authorized(header?: string) {
    return Boolean(this.wallet(header));
  }
  wallet(header?: string) {
    this.clean();
    if (!header || !/^Bearer [0-9a-f]{64}$/.test(header)) return;
    return this.sessions.get(
      createHash("sha256").update(header.slice(7)).digest("hex"),
    )?.wallet;
  }
}
