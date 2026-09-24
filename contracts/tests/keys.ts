import { x25519 } from "@arcium-hq/client";

export const recoveryPrivateKey = new Uint8Array(32).fill(7);
export const recoveryKey = x25519.getPublicKey(recoveryPrivateKey);
