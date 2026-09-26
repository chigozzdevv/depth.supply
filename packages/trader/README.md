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

Private balance and position reads queue owner-signed Arcium views:

```ts
const balance = await depth.account.summary();
const position = await depth.position.summary();
```

Each result includes `pending`, `ready`, or `stale`, its confirmed slot, and decrypted values only when ready. Use `requestBalanceView()` or `requestMarketView()` to retain the view handle and call `close()` after reading it to recover its rent. A new view can be requested after a reload.
