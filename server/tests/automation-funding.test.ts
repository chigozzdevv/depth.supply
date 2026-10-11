import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as anchor from "@anchor-lang/core";
import {
  Keypair,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  Transaction,
  type Connection,
} from "@solana/web3.js";
import { automationWire } from "@depthhq/maker-sdk";
import { AutomationStore } from "@/features/automation/automation.store";
import { AutomationService } from "@/features/automation/automation.service";
import { AutomationFunding } from "@/features/automation/funding.service";

const config = automationWire({
  quote: {
    maxCapacity: 100_000_000n,
    maxInventoryNotional: 1_000_000_000n,
    spreadBps: 20,
    repriceBps: 10,
    lifetimeSeconds: 120,
    refreshSeconds: 60,
  },
});
const transfer = (owner: Keypair, operator: string, amount = 250_000_000n) => {
  const transaction = new Transaction({
    feePayer: owner.publicKey,
    recentBlockhash: PublicKey.unique().toBase58(),
  }).add(
    SystemProgram.transfer({
      fromPubkey: owner.publicKey,
      toPubkey: new PublicKey(operator),
      lamports: amount,
    }),
  );
  transaction.sign(owner);
  return {
    revision: 1,
    transaction: transaction.serialize().toString("base64"),
    lastValidBlockHeight: 200,
    targetLamports: "250000000",
  };
};

test("operator funding persists before broadcast and recovers a lost response without a second payment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-funding-"));
  const secret = randomBytes(32).toString("hex");
  let store = await AutomationStore.open(directory, secret, "devnet");
  const owner = Keypair.generate();
  const address = owner.publicKey.toBase58();
  let balance = 0n;
  let finalized = false;
  let broadcasts = 0;
  const paid = new Set<string>();
  const rpc = {
    getBlockHeight: async () => 100,
    getBalance: async () => Number(balance),
    getSignatureStatuses: async () => ({
      value: [
        finalized ? { confirmationStatus: "finalized", err: null } : null,
      ],
    }),
    sendRawTransaction: async (bytes: Uint8Array) => {
      const transaction = Transaction.from(bytes);
      const signature = anchor.utils.bytes.bs58.encode(transaction.signature!);
      assert.equal(store.get(address)!.funding?.signature, signature);
      assert.equal(
        store.get(address)!.fundingTransaction?.bytes,
        Buffer.from(bytes).toString("base64"),
      );
      broadcasts++;
      if (!paid.has(signature)) {
        balance += SystemInstruction.decodeTransfer(
          transaction.instructions[0],
        ).lamports;
        paid.add(signature);
      }
      throw new Error("RPC response was lost");
    },
  } as unknown as Connection;
  try {
    let funding = new AutomationFunding(store, rpc);
    let service = new AutomationService(store, () => false, funding);
    const profile = await service.configure(address, 0, config);
    const input = transfer(owner, profile.operator);
    const receipt = await funding.request(address, input);
    assert.equal((receipt as typeof profile).funding!.status, "pending");
    assert.equal(balance, 250_000_000n);
    await assert.rejects(service.configure(address, 1, config), /finalize/);
    await assert.rejects(service.command(address, 1, "start"), /finalize/);
    assert.equal(
      JSON.stringify(service.summary(address)).includes("fundingTransaction"),
      false,
    );
    await funding.close();
    await store.close();
    store = await AutomationStore.open(directory, secret, "devnet");
    funding = new AutomationFunding(store, rpc);
    service = new AutomationService(store, () => false, funding);
    await funding.tick();
    assert.equal(broadcasts, 2);
    assert.equal(balance, 250_000_000n);
    finalized = true;
    await funding.tick();
    assert.equal(service.summary(address)!.funding!.status, "confirmed");
    assert.equal(
      ((await funding.request(address, input)) as typeof profile).funding!
        .signature,
      service.summary(address)!.funding!.signature,
    );
    assert.equal(broadcasts, 2);
    assert.equal(paid.size, 1);
    await funding.close();
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("funding rejects unreviewed destinations and authority and only expires an absent, invalid blockhash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-funding-"));
  const store = await AutomationStore.open(
    directory,
    randomBytes(32).toString("hex"),
    "devnet",
  );
  const owner = Keypair.generate();
  const address = owner.publicKey.toBase58();
  let height = 100;
  let valid = true;
  let status: object | null = null;
  let broadcasts = 0;
  const funding = new AutomationFunding(store, {
    getBlockHeight: async () => height,
    getBalance: async () => 0,
    getSignatureStatuses: async () => ({ value: [status] }),
    isBlockhashValid: async () => ({ value: valid }),
    sendRawTransaction: async () => {
      broadcasts++;
      return "signature";
    },
  } as unknown as Connection);
  try {
    const profile = await new AutomationService(
      store,
      () => false,
      funding,
    ).configure(address, 0, config);
    await assert.rejects(
      funding.request(
        address,
        transfer(owner, Keypair.generate().publicKey.toBase58()),
      ),
      /destination/,
    );
    await assert.rejects(
      funding.request(address, transfer(Keypair.generate(), profile.operator)),
      /maker owner/,
    );
    await assert.rejects(
      funding.request(address, transfer(owner, profile.operator, 250_000_001n)),
      /amount/,
    );
    await assert.rejects(
      funding.request(address, {
        ...transfer(owner, profile.operator),
        lastValidBlockHeight: 301,
      }),
      /budget/,
    );
    await assert.rejects(
      funding.request(address, { revision: 1, targetLamports: "250000000" }),
      /incomplete/,
    );
    assert.equal(broadcasts, 0);
    await funding.request(address, transfer(owner, profile.operator));
    height = 201;
    await funding.tick();
    assert.equal(store.get(address)!.funding!.status, "pending");
    valid = false;
    status = { confirmationStatus: "confirmed", err: null };
    await funding.tick();
    assert.equal(store.get(address)!.funding!.status, "pending");
    status = null;
    await funding.tick();
    assert.equal(store.get(address)!.funding!.status, "expired");
  } finally {
    await funding.close();
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
