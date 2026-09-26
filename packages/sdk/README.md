# Depth trader SDK

The trader SDK submits encrypted SOL-USD orders directly to the Depth Solana program. It reads the confirmed protocol, market, app, MXE, and account state before signing. The program checks the same state again when it admits the transaction.

```ts
import { createDepth } from "@depth/sdk";

const depth = await createDepth({ connection, wallet, appId });
const order = await depth.trade.submit({
  marketId: "SOL-USD",
  direction: "long",
  notional: 1_000_000n,
  margin: 200_000n,
  worstPriceE8: 20_100_000_000n,
  maxFee: 1_000n,
  expiresAt: Math.floor(Date.now() / 1000) + 120,
});

persist(order.id.toBase58());
const snapshot = await order.wait({ timeoutMs: 30_000 });
```

Amounts are integer USDC units, and prices use eight decimal places. `submit` returns the onchain order address and submission signature after the queue transaction confirms. Matching and settlement continue asynchronously. A timeout returns the current onchain status; it does not imply a fill. After a restart, `depth.operation(orderAddress)` reads the same record.

Before trading, use `account.open()` and `position.open()` to queue account creation, then wait for their onchain status to become `ready`. `account.deposit(source, amount)` returns a receipt handle; call `credit()` while its status is `pending`, then wait for `credited`. `account.allocate(amount)` returns a transfer handle; call `settle()` while its state is `escrow`, then wait for `settled`. Transaction signatures confirm queue submission; Arcium callbacks advance the private balances asynchronously.

Persist the deposit or transfer nonce and reconstruct its handle after a restart with `depositHandle(nonce)` or `transferHandle(nonce)`. Pending deposits and escrow transfers can be refunded to the owner’s USDC account. `account.release(amount)` moves margin back to the free balance through the same transfer lifecycle. `account.withdraw(destination, amount)` queues a private debit and payout; its handle reports `queued`, `rejected`, or `balance_advanced`. The last status means the balance version advanced and does not by itself prove that this particular withdrawal paid, because the program has no lasting withdrawal receipt. The owner can cancel a queued withdrawal with `handle.cancel()`.

Private balance and position reads queue owner-signed Arcium views:

```ts
const balance = await depth.account.summary();
const position = await depth.position.summary();
```

Each result includes `pending`, `ready`, or `stale`, its confirmed slot, and decrypted values only when ready. Use `requestBalanceView()` or `requestMarketView()` to retain the view handle and call `close()` after reading it to recover its rent. A new view can be requested after a reload.

When a committee-authorized market winddown has finalized, the owner can read
the public recovery claim and withdraw its exact onchain payout:

```ts
const recovery = await depth.recovery.status();
if (recovery.status === "claimable") {
  await depth.recovery.claimTo(myUsdcTokenAccount);
}
```

The claim record remains onchain after payment so a later session can confirm
that the payout was made. Emergency position disclosure is public.
