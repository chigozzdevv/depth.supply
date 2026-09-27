# Depth maker SDK

The maker SDK manages prefunded encrypted quotes, scoped quote operators, and authenticated fill views on SOL-USD.

```ts
import { createDepthMaker } from "@depth/maker-sdk";

const maker = await createDepthMaker({
  connection,
  wallet,
  maker: makerPublicKey,
  deployment: { manifest, trustedSigner },
});

const quote = await maker.quote.publish({
  tiers: [{ size: 1_000_000n, bidE8: 19_900_000_000n, askE8: 20_100_000_000n }],
  maxCapacity: 3_000_000n,
  expiresAt: Math.floor(Date.now() / 1000) + 120,
  clientNonce: savedNonce,
});
const state = await quote.wait({ timeoutMs: 30_000 });
```

Quote tier sizes and capacity are USDC notional units with six decimals; prices use eight decimals. Tiers must match the market's published configuration. Persist the request nonce before signing. Republishing that nonce returns the existing handle. Local validators accept the explicit `deployment: { localnet: true }` setting.

## Funding and quotes

The maker wallet opens its free balance and market account with `account.open()` and `account.openMarket()`. Deposit and allocate collateral using the same nonce-based receipt flow as the trader SDK. Quote operators cannot move collateral.

`publish` queues validation and attempts reservation when validation completes. A returned handle may still be pending. Resume with `quote.activate({ timeoutMs })`, including after restarting through `maker.quote.get(id)`. Execution is permitted only in the `active` state.

`quote.cancel()` stops selection and releases margin when attached orders have resolved. If attached orders remain, it returns their current state; call it again after settlement. `maker.quote.active()` returns this maker's active handles. `maker.quote.replace(priorId, input, { timeoutMs })` stops and releases the exact prior quote before publishing the replacement. If the prior quote is still pending, resume with the same IDs. Replacement is asynchronous and may temporarily leave no active quote.

## Fills

`fills.get(orderAddress)` requests a fresh maker-authorized private fill view. `position.summary()` requests a private current position. Operators need an active view grant; funding and position changes require the maker wallet.

`fills.list({ before, until, limit })` reads finalized Solana transaction history and verifies the corresponding onchain fill records. It returns public fill IDs, slots, signatures, and a pagination cursor. Use an archival RPC that retains the required history. Private fill details still require an authorized view.

`fills.subscribe(listener, { cursor, saveCursor, onError })` replays missed finalized fills in chronological order and saves its checkpoint only after the listener succeeds. The listener must persist each fill ID as an idempotency key before requesting an external hedge. A crash after a hedge but before checkpoint persistence can redeliver the fill. The SDK never treats an external hedge as part of the Depth transaction.

The maker owner can use `recovery.status()` and `recovery.claimTo(destination)` after a finalized emergency winddown. An operator cannot sign the maker's payout claim.
