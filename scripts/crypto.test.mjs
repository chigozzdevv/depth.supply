import { test } from "node:test";
import assert from "node:assert/strict";
import * as native from "node:crypto";
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "./crypto.mjs";

test("browser hashes and AES-CTR match native Arcium crypto operations", () => {
  const data = Buffer.from("Depth circuit and ciphertext compatibility");
  for (const algorithm of ["sha256", "sha3-256"])
    assert.deepEqual(
      createHash(algorithm)
        .update(data.subarray(0, 7))
        .update(data.subarray(7))
        .digest(),
      native.createHash(algorithm).update(data).digest(),
    );
  for (const bits of [128, 192, 256]) {
    const key = native.randomBytes(bits / 8);
    const counter = native.randomBytes(16);
    const algorithm = `aes-${bits}-ctr`;
    const expected = native.createCipheriv(algorithm, key, counter);
    const ciphertext = Buffer.concat([expected.update(data), expected.final()]);
    const browser = createCipheriv(algorithm, key, counter);
    assert.deepEqual(
      Buffer.concat([
        browser.update(data.subarray(0, 3)),
        browser.update(data.subarray(3)),
        browser.final(),
      ]),
      ciphertext,
    );
    const decryptor = createDecipheriv(algorithm, key, counter);
    assert.deepEqual(
      Buffer.concat([decryptor.update(ciphertext), decryptor.final()]),
      data,
    );
    assert.throws(() => browser.update(data), /finalized/);
  }
  assert.equal(randomBytes(70000).length, 70000);
  assert.notDeepEqual(randomBytes(32), randomBytes(32));
});
