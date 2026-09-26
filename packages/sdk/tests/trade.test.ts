import * as anchor from "@anchor-lang/core";
import { RescueCipher, x25519 } from "@arcium-hq/client";
import { DEPTH_PROGRAM_ID } from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { randomBytes } from "node:crypto";
import { DepthOperation } from "@/index";
import { encodeSide, u64 } from "@/trade/input";

describe("trader wire and operation lifecycle", () => {
  test("encodes a short as signed 8-bit plaintext accepted by Arcium", () => {
    assert.equal(encodeSide("long"), 1n);
    assert.equal(encodeSide("short"), 255n);
    const secret = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(secret);
    const cipher = new RescueCipher(x25519.getSharedSecret(secret, publicKey));
    const encryptionNonce = randomBytes(16);
    const ciphertext = cipher.encrypt([encodeSide("short")], encryptionNonce);
    assert.deepEqual(cipher.decrypt(ciphertext, encryptionNonce), [255n]);
    assert.throws(() => u64(-1n, "notional"));
    assert.throws(() => u64(1.5 as unknown as bigint, "notional"));
    assert.equal(
      u64((1n << 64n) - 1n, "notional").toString(),
      ((1n << 64n) - 1n).toString(),
    );
    assert.throws(() => u64(1n << 64n, "notional"));
  });

  test("reads terminal status from the confirmed onchain order", async () => {
    const id = PublicKey.unique();
    let state = "matching";
    let owner = DEPTH_PROGRAM_ID;
    const program = {
      programId: DEPTH_PROGRAM_ID,
      coder: {
        accounts: {
          decode: () => ({
            status: { [state]: {} },
            kind: { trade: {} },
            trader: PublicKey.unique(),
          }),
        },
      },
    } as unknown as anchor.Program;
    const connection = {
      getAccountInfoAndContext: async () => ({
        context: { slot: 91 },
        value: { owner, data: Buffer.alloc(8) },
      }),
    } as unknown as Connection;
    const operation = new DepthOperation(id, undefined, program, connection);
    assert.equal((await operation.status()).status, "queued");
    state = "filled";
    const final = await operation.wait({ timeoutMs: 100 });
    assert.equal(final.status, "finalized");
    assert.equal(final.outcome, "filled");
    assert.equal(final.slot, 91);
    owner = PublicKey.unique();
    await assert.rejects(operation.status(), /Order record is unavailable/);
  });

  test("wait timeout keeps an unfinished order queued", async () => {
    const operation = new DepthOperation(
      PublicKey.unique(),
      undefined,
      {} as anchor.Program,
      {} as Connection,
    );
    operation.status = async () => ({
      id: operation.id.toBase58(),
      kind: "trade",
      owner: PublicKey.unique().toBase58(),
      status: "queued",
      slot: 12,
    });
    const snapshot = await operation.wait({ timeoutMs: 0 });
    assert.equal(snapshot.status, "queued");
    assert.equal(snapshot.outcome, undefined);
  });
});
