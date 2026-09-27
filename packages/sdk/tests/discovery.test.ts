import * as anchor from "@anchor-lang/core";
import {
  depositAddress,
  marketAddress,
  transferAddress,
  withdrawalAddress,
} from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { FundingDiscovery } from "@/account/discovery";

test("pending discovery restores owner receipts after a wallet reconnect", async () => {
  const programId = PublicKey.unique();
  const owner = PublicKey.unique();
  const market = marketAddress(programId);
  const deposit = depositAddress(owner, 1n, programId);
  const transfer = transferAddress(owner, 2n, programId);
  const withdrawal = withdrawalAddress(owner, 3n, programId);
  const entries = new Map([
    [
      deposit.toBase58(),
      {
        name: "depositReceipt",
        owner,
        nonce: new anchor.BN(1),
        status: { pending: {} },
      },
    ],
    [
      transfer.toBase58(),
      {
        name: "marginTransfer",
        owner,
        market,
        nonce: new anchor.BN(2),
        toMarket: true,
        status: { escrow: {} },
      },
    ],
    [
      withdrawal.toBase58(),
      {
        name: "withdrawalReceipt",
        owner,
        nonce: new anchor.BN(3),
        status: { paid: {} },
      },
    ],
  ]);
  const program = {
    programId,
    coder: {
      accounts: {
        memcmp: (name: string) => ({ offset: 0, bytes: name }),
        decode: (name: string, data: Buffer) => {
          const entry = entries.get(data.toString());
          assert.equal(entry?.name, name);
          return entry;
        },
      },
    },
  } as unknown as anchor.Program;
  const connection = {
    getProgramAccounts: async (
      _programId: PublicKey,
      options: { filters: Array<{ memcmp: { bytes: string } }> },
    ) =>
      [...entries]
        .filter(([, value]) => value.name === options.filters[0].memcmp.bytes)
        .map(([key]) => ({ pubkey: new PublicKey(key) })),
    getMultipleAccountsInfo: async (keys: PublicKey[]) =>
      keys.map((key) => ({ owner: programId, data: Buffer.from(key.toBase58()) })),
  } as unknown as Connection;
  const discovery = new FundingDiscovery(program, connection, owner);
  const items = [];
  let cursor: string | undefined;
  do {
    const page = await discovery.pending({ cursor, limit: 1 });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(
    items
      .map((item) => [item.kind, item.nonce])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [["allocation", 2n], ["deposit", 1n]],
  );
});
