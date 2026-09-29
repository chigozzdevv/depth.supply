import { x25519 } from "@arcium-hq/client";
import { PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combineRecoveryShares,
  createRecoveryShares,
  openRecoveryShare,
} from "@/recovery/shares";

test("three independently encrypted recovery shares reconstruct the committed market key", () => {
  const market = PublicKey.unique();
  const members = Array.from({ length: 5 }, () =>
    x25519.utils.randomSecretKey()
  );
  const { recoveryKey, envelopes } = createRecoveryShares(
    market,
    members.map((secret) => x25519.getPublicKey(secret))
  );
  assert.equal(envelopes.length, 5);
  assert.notEqual(envelopes[0].ciphertext, envelopes[1].ciphertext);
  const shares = envelopes.map((envelope, index) =>
    openRecoveryShare(envelope, members[index])
  );
  for (let first = 0; first < 3; first++) {
    const secret = combineRecoveryShares(market, recoveryKey, [
      shares[first],
      shares[first + 1],
      shares[first + 2],
    ]);
    assert.deepEqual(x25519.getPublicKey(secret), recoveryKey);
    secret.fill(0);
  }
  assert.throws(() =>
    combineRecoveryShares(market, recoveryKey, shares.slice(0, 2))
  );
  assert.throws(() =>
    combineRecoveryShares(PublicKey.unique(), recoveryKey, shares.slice(0, 3))
  );
  assert.throws(() => openRecoveryShare(envelopes[0], members[1]));
  const damaged = {
    ...envelopes[0],
    ciphertext: Buffer.alloc(32).toString("base64"),
  };
  assert.throws(() => openRecoveryShare(damaged, members[0]));
});
