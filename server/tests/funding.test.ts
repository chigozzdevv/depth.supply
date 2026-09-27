import { balanceAddress, depositAddress, transferAddress } from "@depth/bindings";
import { PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { FundingService } from "@/features/funding/funding.service";
import type { ChainSigner } from "@/shared/chain/chain.signer";

const integer = (value: number) => ({ toString: () => String(value) });

test("keeper credits an owner receipt using its own signer exactly once", async () => {
  const owner = PublicKey.unique();
  const keeper = PublicKey.unique();
  const receipt = depositAddress(owner, 7n);
  let pending = true;
  let calls = 0;
  const chain = {
    market: PublicKey.unique(),
    protocol: PublicKey.unique(),
    wallet: { publicKey: keeper },
    connection: {
      getAccountInfo: async () => ({ owner: keeper }),
    },
    read: async (name: string) =>
      name === "DepositReceipt"
        ? { owner, nonce: integer(7), status: pending ? { pending: {} } : { crediting: {} } }
        : { owner, status: { ready: {} } },
    queue: async () => ({}),
    program: {
      methods: {
        creditDeposit: () => ({
          accountsPartial: (accounts: {
            payer: PublicKey;
            balance: PublicKey;
            receipt: PublicKey;
          }) => ({
            rpc: async () => {
              assert.ok(accounts.payer.equals(keeper));
              assert.ok(accounts.balance.equals(balanceAddress(owner)));
              assert.ok(accounts.receipt.equals(receipt));
              pending = false;
              calls++;
              return "credit-signature";
            },
          }),
        }),
      },
    },
  } as unknown as ChainSigner;
  const service = new FundingService(chain);
  let scanned = false;
  Object.assign(service, {
    deposits: {
      next: async () => {
        if (scanned) return [];
        scanned = true;
        return [{ address: receipt, state: {} }];
      },
    },
    transfers: { next: async () => [] },
  });
  assert.deepEqual(await service.advance(), {
    stage: "credit_deposit",
    signature: "credit-signature",
  });
  assert.equal(await service.advance(), undefined);
  assert.equal(calls, 1);
});

test("keeper settles an authorized release to the recorded owner", async () => {
  const owner = PublicKey.unique();
  const keeper = PublicKey.unique();
  const market = PublicKey.unique();
  const transfer = transferAddress(owner, 11n);
  let calls = 0;
  const chain = {
    market,
    protocol: PublicKey.unique(),
    wallet: { publicKey: keeper },
    connection: {
      getAccountInfo: async () => ({ owner: keeper }),
    },
    read: async (name: string) =>
      name === "MarginTransfer"
        ? {
            owner,
            market,
            nonce: integer(11),
            toMarket: false,
            status: { escrow: {} },
          }
        : { owner, status: { ready: {} } },
    queue: async () => ({}),
    program: {
      methods: {
        settleRelease: () => ({
          accountsPartial: (accounts: {
            payer: PublicKey;
            balance: PublicKey;
            transfer: PublicKey;
          }) => ({
            rpc: async () => {
              assert.ok(accounts.payer.equals(keeper));
              assert.ok(accounts.balance.equals(balanceAddress(owner)));
              assert.ok(accounts.transfer.equals(transfer));
              calls++;
              return "release-signature";
            },
          }),
        }),
      },
    },
  } as unknown as ChainSigner;
  const service = new FundingService(chain);
  Object.assign(service, {
    deposits: { next: async () => [] },
    transfers: {
      next: async () => [{ address: transfer, state: {} }],
    },
    depositFirst: false,
  });
  assert.deepEqual(await service.advance(), {
    stage: "settle_release",
    signature: "release-signature",
  });
  assert.equal(calls, 1);
});
