import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID } from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DepthRecovery } from "@/recovery";

test("recovery status calculates the onchain haircut and retains paid receipts", async () => {
  const owner = PublicKey.unique();
  let paid = false;
  const connection = {
    getAccountInfoAndContext: async () => ({
      context: { slot: 120 },
      value: { owner: DEPTH_PROGRAM_ID, data: Buffer.alloc(8) },
    }),
  } as unknown as Connection;
  let recovery: DepthRecovery;
  const program = {
    provider: { wallet: { publicKey: owner } },
    coder: {
      accounts: {
        decode: (name: string) => {
          if (name === "Winddown") {
            return {
              market: recovery.market,
              expectedAccounts: 2,
              revealedAccounts: 2,
              paidAccounts: Number(paid),
              payoutPool: new anchor.BN("18446744073709551615"),
              grossPositive: new anchor.BN("36893488147419103232"),
              finalized: true,
            };
          }
          if (name === "WinddownClaim") {
            return {
              winddown: recovery.winddown,
              marketAccount: recovery.marketAccount,
              owner,
              positiveEquity: new anchor.BN("18446744073709551616"),
              paid,
            };
          }
          return {
            settlementMint: PublicKey.unique(),
            vault: PublicKey.unique(),
          };
        },
      },
    },
    methods: {
      claimWinddown: () => ({
        accountsPartial: (accounts: Record<string, PublicKey>) => {
          assert.ok(accounts.owner.equals(owner));
          assert.ok(accounts.claim.equals(recovery.claim));
          return { rpc: async () => "claim-signature" };
        },
      }),
    },
  } as unknown as anchor.Program;
  recovery = new DepthRecovery(program, connection, owner);
  const snapshot = await recovery.status();
  assert.equal(snapshot.status, "claimable");
  assert.equal(snapshot.payout, 9_223_372_036_854_775_807n);
  assert.equal(await recovery.claimTo(PublicKey.unique()), "claim-signature");
  paid = true;
  assert.equal((await recovery.status()).status, "claimed");
  await assert.rejects(recovery.claimTo(PublicKey.unique()), /not claimable/);
});
