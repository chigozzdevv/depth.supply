import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { missingChunks, writeInstruction } from "./upload.mjs";

const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

test("resuming uploads checks buffer ownership, authority, size and exact bytes", () => {
  const authority = Keypair.generate().publicKey;
  const binary = Buffer.alloc(1901, 7);
  const data = Buffer.alloc(binary.length + 37);
  data.writeUInt32LE(1);
  data[4] = 1;
  data.set(authority.toBytes(), 5);
  data.set(binary, 37);
  const account = { owner: loader, data };
  assert.deepEqual(missingChunks(binary, account, authority), []);
  data[37 + 900] = 0;
  data[37 + 1900] = 0;
  assert.deepEqual(missingChunks(binary, account, authority), [900, 1800]);
  assert.throws(
    () => missingChunks(binary, account, PublicKey.default),
    /authority/,
  );
  assert.throws(
    () =>
      missingChunks(
        binary,
        { ...account, owner: PublicKey.default },
        authority,
      ),
    /identity/,
  );
  assert.throws(
    () =>
      missingChunks(
        binary,
        { ...account, data: data.subarray(0, -1) },
        authority,
      ),
    /size/,
  );
  data[4] = 0;
  assert.throws(() => missingChunks(binary, account, authority), /authority/);
});

test("loader writes encode the offset and bytes within the Solana packet limit", () => {
  const signer = Keypair.generate();
  const buffer = Keypair.generate().publicKey;
  const bytes = Buffer.alloc(900, 7);
  const instruction = writeInstruction(buffer, signer.publicKey, 1800, bytes);
  assert(instruction.programId.equals(loader));
  assert.equal(instruction.data.readUInt32LE(0), 1);
  assert.equal(instruction.data.readUInt32LE(4), 1800);
  assert.equal(instruction.data.readBigUInt64LE(8), 900n);
  assert.deepEqual(instruction.data.subarray(16), bytes);
  assert.deepEqual(instruction.keys, [
    { pubkey: buffer, isSigner: false, isWritable: true },
    { pubkey: signer.publicKey, isSigner: true, isWritable: false },
  ]);
  const transaction = new Transaction({
    feePayer: signer.publicKey,
    recentBlockhash: PublicKey.default.toBase58(),
  }).add(instruction);
  transaction.sign(signer);
  assert(transaction.serialize().length <= 1232);
});
