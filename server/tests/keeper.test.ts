import { marketAddress } from "@depthhq/bindings";
import { PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Keeper } from "@/features/settlement/settlement.keeper";

test("keeper advances only the market's pending order", async () => {
  const market = marketAddress();
  const orderId = PublicKey.unique();
  const quoteId = PublicKey.unique();
  const trader = PublicKey.unique();
  const maker = PublicKey.unique();
  const payer = PublicKey.unique();
  let status = "matched";
  let claimStage = "idle";
  let tradeDeadline = Math.floor(Date.now() / 1_000) + 100;
  let pendingOrder = orderId;
  type RecordedAccounts = {
    payer: PublicKey;
    trade?: { order: PublicKey };
    [key: string]: unknown;
  };
  const calls: Array<{ stage: string; accounts: RecordedAccounts }> = [];
  const method = (stage: string) => () => ({
    accountsPartial: (accounts: RecordedAccounts) => ({
      remainingAccounts: () => ({
        rpc: async () => {
          calls.push({ stage, accounts });
          return `${stage}-signature`;
        },
      }),
      rpc: async () => {
        calls.push({ stage, accounts });
        return `${stage}-signature`;
      },
    }),
  });
  const keeper = Object.assign(Object.create(Keeper.prototype), {
    market,
    clearing: PublicKey.unique(),
    wallet: { publicKey: payer },
    read: async (name: string) => {
      if (name === "Market") {
        return {
          pendingOrder,
          pendingOrders: pendingOrder.equals(PublicKey.default) ? 0 : 1,
        };
      }
      if (name === "OrderRecord") {
        return {
          market,
          status: { [status]: {} },
          kind: { trade: {} },
          trader,
          maker,
          selectedQuote: quoteId,
          deadline: { toNumber: () => tradeDeadline },
          claimDeadline: {
            toNumber: () => Math.floor(Date.now() / 1_000) + 100,
          },
          claimStage: { [claimStage]: {} },
          app: PublicKey.unique(),
        };
      }
      if (name === "Protocol") return { authority: maker };
      return { market, maker };
    },
    queue: async () => ({}),
    program: {
      methods: {
        settleTrade: method("settle_trade"),
        sealMarket: method("seal_market"),
        sealClearing: method("seal_clearing"),
        sealTradeFees: method("seal_trade_fees"),
      },
    },
  }) as Keeper;
  const settlement = await keeper.advance();
  assert.equal(settlement?.stage, "settle_trade");
  assert.equal(calls[0].accounts.trade?.order.toBase58(), orderId.toBase58());
  assert.equal(calls[0].accounts.payer.toBase58(), payer.toBase58());
  status = "riskApproved";
  assert.equal((await keeper.advance())?.stage, "seal_market");
  status = "makerSealed";
  assert.equal((await keeper.advance())?.stage, "seal_clearing");
  status = "filled";
  claimStage = "ready";
  tradeDeadline = Math.floor(Date.now() / 1_000) - 100;
  assert.equal((await keeper.advance())?.stage, "seal_trade_fees");
  pendingOrder = PublicKey.default;
  assert.equal(await keeper.advance(), undefined);
  assert.deepEqual(
    calls.map((call) => call.stage),
    ["settle_trade", "seal_market", "seal_clearing", "seal_trade_fees"],
  );
});
