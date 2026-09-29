import * as anchor from "@anchor-lang/core";
import { SOL_USD_FEED_ID } from "@depth/bindings";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { priceTimestamp } from "@/features/oracle/oracle.price";
import { OraclePublisher } from "@/features/oracle/oracle.publisher";
import { publisherConfig } from "@/shared/config/env";

const receiver = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

function priceAccount() {
  const data = Buffer.alloc(134);
  Buffer.from("22f123639d7ef4cd", "hex").copy(data);
  data[40] = 1;
  SOL_USD_FEED_ID.copy(data, 41);
  data.writeBigInt64LE(1_800_000_000n, 93);
  return {
    data,
    owner: receiver,
    executable: false,
    lamports: 1,
    rentEpoch: 0,
  };
}

test("oracle account validation rejects unverified or wrong-feed prices", () => {
  const account = priceAccount();
  assert.equal(priceTimestamp(account), 1_800_000_000);
  account.data[40] = 0;
  assert.throws(() => priceTimestamp(account), /not a verified SOL\/USD/);
  account.data[40] = 1;
  account.data[41] ^= 1;
  assert.throws(() => priceTimestamp(account), /not a verified SOL\/USD/);
  account.data[41] ^= 1;
  account.owner = PublicKey.default;
  assert.throws(() => priceTimestamp(account), /not a verified SOL\/USD/);
  account.owner = receiver;
  account.data = account.data.subarray(0, 133);
  assert.throws(() => priceTimestamp(account), /not a verified SOL\/USD/);
});

test("publisher leaves a recently updated verified feed alone", async () => {
  const account = priceAccount();
  account.data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1_000)), 93);
  const signer = Keypair.generate();
  const config = publisherConfig({
    DEPTH_RPC_URL: "https://rpc.example.test",
    DEPTH_KEEPER_KEYPAIR: JSON.stringify(Array.from(signer.secretKey)),
    PYTH_ORACLE_MODE: "hermes",
    PYTH_API_KEY: "test-key",
  });
  const connection = {
    getAccountInfo: async () => account,
  } as unknown as Connection;
  const publisher = new OraclePublisher(
    connection,
    new anchor.Wallet(signer),
    config
  );
  assert.equal(await publisher.advance(), undefined);
});
