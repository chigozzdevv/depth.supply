import * as anchor from "@anchor-lang/core";
import { accountOffsets, enumValues, SOL_USD_FEED_ID } from "@depth/bindings";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { priceTimestamp } from "@/features/oracle/oracle.price";
import { OraclePublisher } from "@/features/oracle/oracle.publisher";
import { OracleService } from "@/features/oracle/oracle.service";
import type { ChainSigner } from "@/shared/chain/chain.signer";
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
    SOLANA_RPC_URL: "https://rpc.example.test",
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

test("oracle refresh preserves pending quote snapshots until expiry", async () => {
  const now = Math.floor(Date.now() / 1_000);
  const price = priceAccount();
  price.data.writeBigInt64LE(BigInt(now), 93);
  const market = PublicKey.unique();
  const oracle = PublicKey.unique();
  let quoteStatus: number = enumValues.QuoteStatus.Validating;
  let expiry = now + 60;
  let refreshes = 0;
  const queriedStatuses = new Set<number>();
  const chain = {
    market,
    read: async () => ({
      pendingOrders: 0,
      status: { active: {} },
      oracleAccount: oracle,
      oracleTimestamp: new anchor.BN(now - 1),
    }),
    connection: {
      getAccountInfo: async () => price,
      getProgramAccounts: async (
        _program: PublicKey,
        options: {
          dataSlice: { offset: number; length: number };
          filters: Array<{ memcmp: { offset: number; bytes: string } }>;
        }
      ) => {
        if (options.filters[0].memcmp.bytes !== "quoteRecord") return [];
        assert.deepEqual(options.dataSlice, {
          offset: accountOffsets.QuoteRecord.expiry,
          length: 8,
        });
        const marketFilter = options.filters.find(
          ({ memcmp }) => memcmp.offset === accountOffsets.QuoteRecord.market
        );
        assert.equal(marketFilter?.memcmp.bytes, market.toBase58());
        const statusFilter = options.filters.find(
          ({ memcmp }) => memcmp.offset === accountOffsets.QuoteRecord.status
        );
        assert.ok(statusFilter);
        const statusBytes = anchor.utils.bytes.bs58.decode(
          statusFilter.memcmp.bytes
        );
        assert.equal(statusBytes.length, 1);
        queriedStatuses.add(statusBytes[0]);
        if (statusBytes[0] !== quoteStatus) return [];
        const data = Buffer.alloc(8);
        data.writeBigInt64LE(BigInt(expiry));
        return [{ pubkey: PublicKey.unique(), account: { data } }];
      },
    },
    program: {
      coder: {
        accounts: { memcmp: (name: string) => ({ offset: 0, bytes: name }) },
      },
      methods: {
        refreshOracle: () => ({
          accountsPartial: () => ({
            rpc: async () => {
              refreshes++;
              return "oracle-signature";
            },
          }),
        }),
      },
    },
  } as unknown as ChainSigner;
  const service = new OracleService(chain, oracle);

  assert.equal(await service.advance(), undefined);
  quoteStatus = enumValues.QuoteStatus.Validated;
  assert.equal(await service.advance(), undefined);
  quoteStatus = enumValues.QuoteStatus.Reserving;
  assert.equal(await service.advance(), undefined);
  assert.equal(refreshes, 0);
  assert.deepEqual(
    queriedStatuses,
    new Set([
      enumValues.QuoteStatus.Validating,
      enumValues.QuoteStatus.Validated,
      enumValues.QuoteStatus.Reserving,
    ])
  );

  expiry = now - 1;
  for (const status of [
    enumValues.QuoteStatus.Validating,
    enumValues.QuoteStatus.Validated,
    enumValues.QuoteStatus.Reserving,
  ]) {
    quoteStatus = status;
    assert.equal(await service.advance(), "oracle-signature");
  }
  assert.equal(refreshes, 3);

  expiry = now + 60;
  for (const status of [
    enumValues.QuoteStatus.Waiting,
    enumValues.QuoteStatus.Active,
  ]) {
    quoteStatus = status;
    assert.equal(await service.advance(), "oracle-signature");
  }
  assert.equal(refreshes, 5);
});
