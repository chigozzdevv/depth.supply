import { ctr } from "@noble/ciphers/aes";
import { sha256 } from "@noble/hashes/sha256";
import { sha3_256 } from "@noble/hashes/sha3";
import { concatBytes } from "@noble/hashes/utils";
import { Buffer } from "buffer";

export function randomBytes(length) {
  if (!Number.isSafeInteger(length) || length < 0)
    throw new RangeError("Invalid random byte length");
  const bytes = Buffer.alloc(length);
  for (let offset = 0; offset < length; offset += 65536)
    globalThis.crypto.getRandomValues(
      bytes.subarray(offset, Math.min(length, offset + 65536)),
    );
  return bytes;
}

export function createHash(algorithm) {
  const hash =
    algorithm === "sha256"
      ? sha256.create()
      : algorithm === "sha3-256"
        ? sha3_256.create()
        : undefined;
  if (!hash) throw new Error(`Unsupported Arcium hash ${algorithm}`);
  return {
    update(bytes) {
      hash.update(bytes);
      return this;
    },
    digest(encoding) {
      const result = Buffer.from(hash.digest());
      return encoding ? result.toString(encoding) : result;
    },
  };
}

export function createCipheriv(algorithm, key, counter) {
  const match = /^aes-(128|192|256)-ctr$/.exec(algorithm);
  if (!match || key.length !== Number(match[1]) / 8 || counter.length !== 16)
    throw new Error("Invalid Arcium AES-CTR parameters");
  const chunks = [];
  let finished = false;
  return {
    update(bytes) {
      if (finished) throw new Error("Cipher already finalized");
      chunks.push(Uint8Array.from(bytes));
      return Buffer.alloc(0);
    },
    final() {
      if (finished) throw new Error("Cipher already finalized");
      finished = true;
      return Buffer.from(
        ctr(Uint8Array.from(key), Uint8Array.from(counter)).encrypt(
          concatBytes(...chunks),
        ),
      );
    },
  };
}
export const createDecipheriv = createCipheriv;
