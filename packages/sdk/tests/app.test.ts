import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID, appAddress } from "@depthhq/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { FundingClient } from "@/account/funding";
import { AppAdmin } from "@/app/app";

test("app registration confirms its private revenue balance and can resume", async () => {
  const owner = PublicKey.unique();
  let registered = false;
  let feeBps = 0;
  let active = true;
  let balanceReady = false;
  let opens = 0;
  let registrations = 0;
  const program = {
    programId: DEPTH_PROGRAM_ID,
    coder: {
      accounts: {
        decode: () => ({
          app: owner,
          feeBps,
          active,
          version: new anchor.BN(1),
        }),
      },
    },
    methods: {
      registerApp: (fee: number) => ({
        accountsPartial: (accounts: { app: PublicKey; config: PublicKey }) => ({
          rpc: async () => {
            assert.ok(accounts.app.equals(owner));
            assert.ok(accounts.config.equals(appAddress(owner)));
            registered = true;
            feeBps = fee;
            registrations++;
            return "register-signature";
          },
        }),
      }),
      setAppFee: (fee: number, enabled: boolean) => ({
        accountsPartial: () => ({
          rpc: async () => {
            feeBps = fee;
            active = enabled;
            return "update-signature";
          },
        }),
      }),
    },
  } as unknown as anchor.Program;
  const connection = {
    getAccountInfo: async () =>
      registered ? { owner: DEPTH_PROGRAM_ID, data: Buffer.alloc(8) } : null,
  } as unknown as Connection;
  const funding = {
    balance: PublicKey.unique(),
    read: async () =>
      balanceReady ? { owner, status: { ready: {} } } : undefined,
    openBalance: async () => {
      opens++;
      balanceReady = true;
      return { address: PublicKey.unique(), signature: "open-signature" };
    },
  } as unknown as FundingClient;
  const app = new AppAdmin(program, connection, owner, funding);
  await assert.rejects(app.register({ feeBps: 3 }), /0 to 2 bps/);
  const registration = await app.register({ feeBps: 1 });
  assert.equal(registration.signature, "register-signature");
  assert.deepEqual(await registration.confirm(), { appId: owner });
  assert.equal(opens, 1);
  assert.deepEqual(await (await app.register({ feeBps: 1 })).confirm(), {
    appId: owner,
  });
  assert.equal(registrations, 1);
  assert.equal(opens, 1);
  await assert.rejects(app.register({ feeBps: 2 }), /use setFee/);
  await (await app.setFee(2)).confirm();
  assert.equal((await app.summary())?.feeBps, 2);
  await (await app.setActive(false)).confirm();
  assert.equal((await app.summary())?.active, false);
});
