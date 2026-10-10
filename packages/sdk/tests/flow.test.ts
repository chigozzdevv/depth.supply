import {
  DEPTH_PROGRAM_ID,
  SOL_USD_MARKET_ID,
  transferAddress,
} from "@depthhq/bindings";
import { PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { TradeFlow } from "@/trade/flow";
import type { DepthClient } from "@/client/client";
import type { TradeInput } from "@/client/types";

test("trade flow recovers its margin child and resumes with the original nonce", async () => {
  const owner = PublicKey.unique();
  const id = PublicKey.unique();
  const nonce = 91n;
  const receipts: Array<unknown> = [];
  let allocation = true;
  let order = false;
  const client = {
    program: { programId: DEPTH_PROGRAM_ID },
    options: {
      wallet: { publicKey: owner },
      connection: {
        getMultipleAccountsInfo: async () => [
          order ? {} : null,
          allocation ? {} : null,
        ],
      },
    },
    funding: {
      transferHandle: () => ({
        status: async () => ({
          state: "settled",
          toMarket: true,
          amount: 500n,
        }),
      }),
    },
    trade: {
      operation: () => ({
        id,
        status: async () => ({ owner: owner.toBase58(), status: "queued" }),
      }),
      submit: async (input: unknown) => {
        receipts.push(input);
        return { id };
      },
    },
  } as unknown as DepthClient;
  const recovered = new TradeFlow(client, nonce);
  assert.equal(
    recovered.allocationId.toBase58(),
    transferAddress(owner, nonce).toBase58(),
  );
  assert.equal((await recovered.status()).phase, "allocated");
  const terms: TradeInput = {
    marketId: SOL_USD_MARKET_ID,
    direction: "long",
    notional: 1n,
    margin: 500n,
    maxFee: 1n,
  };
  await recovered.resume(terms, "increase");
  assert.equal((receipts[0] as { clientNonce: bigint }).clientNonce, nonce);
  await assert.rejects(
    recovered.resume({ ...terms, clientNonce: 92n }, "increase"),
    /different client nonce/,
  );
  order = true;
  assert.equal((await new TradeFlow(client, nonce).status()).phase, "order");
  order = false;
  allocation = false;
  assert.equal((await recovered.status()).phase, "unstarted");
});
