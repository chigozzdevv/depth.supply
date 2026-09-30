import { Buffer } from "buffer";
import { x25519 } from "@arcium-hq/client";
import { PublicKey } from "@solana/web3.js";
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type RecoveryEnvelope = {
  market: string;
  recoveryKey: string;
  recipient: string;
  index: number;
  threshold: number;
  ephemeral: string;
  salt: string;
  nonce: string;
  ciphertext: string;
  tag: string;
};

export type RecoveryShare = {
  market: string;
  recoveryKey: string;
  index: number;
  threshold: number;
  data: Uint8Array;
};

function multiply(left: number, right: number): number {
  let result = 0;
  for (let bit = 0; bit < 8; bit++) {
    if (right & 1) result ^= left;
    left = (left << 1) ^ (left & 0x80 ? 0x11b : 0);
    right >>= 1;
  }
  return result & 0xff;
}

function power(value: number, exponent: number): number {
  let result = 1;
  while (exponent > 0) {
    if (exponent & 1) result = multiply(result, value);
    value = multiply(value, value);
    exponent >>= 1;
  }
  return result;
}

function split(
  secret: Uint8Array,
  threshold: number,
  count: number,
): Uint8Array[] {
  const shares = Array.from(
    { length: count },
    () => new Uint8Array(secret.length),
  );
  for (let byte = 0; byte < secret.length; byte++) {
    const coefficients = randomBytes(threshold - 1);
    for (let index = 0; index < count; index++) {
      let value = secret[byte];
      let factor = 1;
      for (const coefficient of coefficients) {
        factor = multiply(factor, index + 1);
        value ^= multiply(coefficient, factor);
      }
      shares[index][byte] = value;
    }
    coefficients.fill(0);
  }
  return shares;
}

function associatedData(
  share: Omit<RecoveryShare, "data">,
  recipient: string,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      market: share.market,
      recoveryKey: share.recoveryKey,
      recipient,
      index: share.index,
      threshold: share.threshold,
    }),
  );
}

function key(shared: Uint8Array, salt: Buffer): Buffer {
  return Buffer.from(
    hkdfSync("sha256", shared, salt, "depth.recovery.share.v1", 32),
  );
}

function seal(
  share: RecoveryShare,
  recipientKey: Uint8Array,
): RecoveryEnvelope {
  if (recipientKey.length !== 32)
    throw new RangeError("Recipient key must be 32 bytes");
  const recipient = Buffer.from(recipientKey).toString("base64");
  const ephemeralSecret = x25519.utils.randomSecretKey();
  const ephemeral = x25519.getPublicKey(ephemeralSecret);
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const encryptionKey = key(
    x25519.getSharedSecret(ephemeralSecret, recipientKey),
    salt,
  );
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
  cipher.setAAD(associatedData(share, recipient));
  const ciphertext = Buffer.concat([cipher.update(share.data), cipher.final()]);
  const tag = cipher.getAuthTag();
  ephemeralSecret.fill(0);
  encryptionKey.fill(0);
  return {
    market: share.market,
    recoveryKey: share.recoveryKey,
    recipient,
    index: share.index,
    threshold: share.threshold,
    ephemeral: Buffer.from(ephemeral).toString("base64"),
    salt: salt.toString("base64"),
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function createRecoveryShares(
  market: PublicKey,
  recipients: Uint8Array[],
): { recoveryKey: Uint8Array; envelopes: RecoveryEnvelope[] } {
  if (
    recipients.length !== 5 ||
    new Set(recipients.map((value) => Buffer.from(value).toString("hex")))
      .size !== 5
  )
    throw new RangeError("Recovery requires five distinct recipient keys");
  const secret = x25519.utils.randomSecretKey();
  const recoveryKey = x25519.getPublicKey(secret);
  const parts = split(secret, 3, 5);
  try {
    const envelopes = parts.map((data, index) =>
      seal(
        {
          market: market.toBase58(),
          recoveryKey: Buffer.from(recoveryKey).toString("base64"),
          index: index + 1,
          threshold: 3,
          data,
        },
        recipients[index],
      ),
    );
    return { recoveryKey, envelopes };
  } finally {
    for (const part of parts) part.fill(0);
    secret.fill(0);
  }
}

export function openRecoveryShare(
  envelope: RecoveryEnvelope,
  recipientSecret: Uint8Array,
): RecoveryShare {
  if (
    recipientSecret.length !== 32 ||
    envelope.index < 1 ||
    envelope.index > 5 ||
    envelope.threshold !== 3
  )
    throw new RangeError("Recovery share metadata is invalid");
  const recipient = x25519.getPublicKey(recipientSecret);
  if (Buffer.from(recipient).toString("base64") !== envelope.recipient)
    throw new Error("Recovery share belongs to another member");
  const salt = Buffer.from(envelope.salt, "base64");
  const nonce = Buffer.from(envelope.nonce, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const ephemeral = Buffer.from(envelope.ephemeral, "base64");
  if (
    salt.length !== 16 ||
    nonce.length !== 12 ||
    tag.length !== 16 ||
    ephemeral.length !== 32
  )
    throw new RangeError("Recovery envelope has invalid cryptographic fields");
  const share = {
    market: envelope.market,
    recoveryKey: envelope.recoveryKey,
    index: envelope.index,
    threshold: envelope.threshold,
  };
  const encryptionKey = key(
    x25519.getSharedSecret(recipientSecret, ephemeral),
    salt,
  );
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, nonce);
  decipher.setAAD(associatedData(share, envelope.recipient));
  decipher.setAuthTag(tag);
  try {
    const data = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    if (data.length !== 32)
      throw new RangeError("Recovery share must be 32 bytes");
    return { ...share, data };
  } finally {
    encryptionKey.fill(0);
  }
}

export function combineRecoveryShares(
  market: PublicKey,
  recoveryKey: Uint8Array,
  shares: RecoveryShare[],
): Uint8Array {
  if (
    recoveryKey.length !== 32 ||
    shares.length < 3 ||
    new Set(shares.map((share) => share.index)).size !== shares.length ||
    shares.some(
      (share) =>
        share.market !== market.toBase58() ||
        share.recoveryKey !== Buffer.from(recoveryKey).toString("base64") ||
        share.threshold !== 3 ||
        share.index < 1 ||
        share.index > 5 ||
        share.data.length !== 32,
    )
  )
    throw new RangeError("Recovery shares do not match this market and key");
  const selected = shares.slice(0, 3);
  const secret = new Uint8Array(32);
  for (let byte = 0; byte < secret.length; byte++) {
    let value = 0;
    for (const share of selected) {
      let weight = 1;
      for (const other of selected) {
        if (share.index === other.index) continue;
        weight = multiply(
          weight,
          multiply(other.index, power(other.index ^ share.index, 254)),
        );
      }
      value ^= multiply(share.data[byte], weight);
    }
    secret[byte] = value;
  }
  const derived = x25519.getPublicKey(secret);
  if (!timingSafeEqual(Buffer.from(derived), Buffer.from(recoveryKey))) {
    secret.fill(0);
    throw new Error("Recovery shares reconstruct a different key");
  }
  return secret;
}
