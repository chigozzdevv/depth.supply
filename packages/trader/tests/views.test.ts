import * as anchor from "@anchor-lang/core";
import { createPacker, RescueCipher, x25519 } from "@arcium-hq/client";
import { DEPTH_PROGRAM_ID } from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { DepthView } from "@/views";

test("owner-authorized private views decrypt balance and signed position fields", async () => {
  const owner = PublicKey.unique();
  const mxeSecret = x25519.utils.randomSecretKey();
  const mxePublicKey = x25519.getPublicKey(mxeSecret);
  const secret = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(secret);
  const cipher = new RescueCipher(x25519.getSharedSecret(secret, mxePublicKey));
  const outputNonce = randomBytes(16);
  const first = (500n << 128n) | ((1n << 127n) - 12n);
  const second = (30n << 128n) | 9n;
  const third = (20_000_000_000n << 64n) | ((1n << 63n) - 2n);
  const state = {
    owner,
    viewKey: Array.from(publicKey),
    status: { ready: {} },
    version: new anchor.BN(7),
    ciphertext: cipher.encrypt([500n], outputNonce)[0],
    ciphertexts: cipher.encrypt([first, second, third], outputNonce),
    outputNonce: Array.from(outputNonce),
  };
  const program = {
    coder: { accounts: { decode: () => state } },
  } as unknown as anchor.Program;
  const connection = {
    getAccountInfoAndContext: async () => ({
      context: { slot: 73 },
      value: { owner: DEPTH_PROGRAM_ID, data: Buffer.alloc(8) },
    }),
  } as unknown as Connection;
  const balance = new DepthView(
    PublicKey.unique(),
    "balance-signature",
    "balance",
    owner,
    secret,
    publicKey,
    mxePublicKey,
    program,
    connection
  );
  const balanceSnapshot = await balance.status();
  assert.equal(balanceSnapshot.status, "ready");
  assert.equal("amount" in balanceSnapshot && balanceSnapshot.amount, 500n);
  const position = new DepthView(
    PublicKey.unique(),
    "position-signature",
    "market",
    owner,
    secret,
    publicKey,
    mxePublicKey,
    program,
    connection
  );
  const positionSnapshot = await position.status();
  assert.equal(
    "position" in positionSnapshot && positionSnapshot.position,
    -2n
  );
  assert.equal(
    "fundingCheckpoint" in positionSnapshot &&
      positionSnapshot.fundingCheckpoint,
    -12n
  );
  state.owner = PublicKey.unique();
  await assert.rejects(
    position.status(),
    /Private view authorization does not match/
  );
});

test("sealed maker fills preserve the third packed rebate word", async () => {
  const owner = PublicKey.unique();
  const mxeSecret = x25519.utils.randomSecretKey();
  const mxePublicKey = x25519.getPublicKey(mxeSecret);
  const secret = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(secret);
  const cipher = new RescueCipher(x25519.getSharedSecret(secret, mxePublicKey));
  const outputNonce = randomBytes(16);
  const packer = createPacker<
    {
      side: bigint;
      size: bigint;
      margin: bigint;
      execution_price: bigint;
      fee: bigint;
      insurance_fee: bigint;
      app_fee: bigint;
    },
    {
      side: bigint;
      size: bigint;
      margin: bigint;
      execution_price: bigint;
      fee: bigint;
      insurance_fee: bigint;
      app_fee: bigint;
    }
  >([
    { name: "side", type: { Integer: { signed: true, width: 8 } } },
    { name: "size", type: { Integer: { signed: false, width: 64 } } },
    { name: "margin", type: { Integer: { signed: false, width: 64 } } },
    {
      name: "execution_price",
      type: { Integer: { signed: false, width: 64 } },
    },
    { name: "fee", type: { Integer: { signed: false, width: 64 } } },
    { name: "insurance_fee", type: { Integer: { signed: false, width: 64 } } },
    { name: "app_fee", type: { Integer: { signed: false, width: 64 } } },
  ] as const);
  const packed = packer.pack({
    side: 1n,
    size: 5_000_000n,
    margin: 200_000n,
    execution_price: 20_100_000_000n,
    fee: 1_000n,
    insurance_fee: 200n,
    app_fee: 200n,
  });
  const program = {
    coder: {
      accounts: {
        decode: () => ({
          owner,
          viewKey: Array.from(publicKey),
          status: { ready: {} },
          ciphertexts: cipher.encrypt([...packed, 100n], outputNonce),
          outputNonce: Array.from(outputNonce),
        }),
      },
    },
  } as unknown as anchor.Program;
  const connection = {
    getAccountInfoAndContext: async () => ({
      context: { slot: 88 },
      value: { owner: DEPTH_PROGRAM_ID, data: Buffer.alloc(8) },
    }),
  } as unknown as Connection;
  const view = new DepthView(
    PublicKey.unique(),
    "fill-signature",
    "fill",
    owner,
    secret,
    publicKey,
    mxePublicKey,
    program,
    connection
  );
  const snapshot = await view.status();
  assert.equal("size" in snapshot && snapshot.size, 5_000_000n);
  assert.equal("makerRebate" in snapshot && snapshot.makerRebate, 100n);
});
