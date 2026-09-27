# Depth maker SDK

The maker SDK manages prefunded encrypted quotes, scoped quote operators, and authenticated fill views on SOL-USD.

```ts
import { create_depth_maker } from "@depth/maker-sdk";

const maker = await create_depth_maker({
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
const { quoteId } = await quote.confirm();
```

Quote tier sizes and capacity are USDC notional units with six decimals; prices use eight decimals. Tiers must match the market's published configuration. Persist the request nonce before signing. Republishing that nonce returns the existing handle. Local validators accept the explicit `deployment: { localnet: true }` setting.

## Funding and quotes

The maker wallet opens its free balance and market account with `account.open()` and `account.openMarket()`. Deposit and allocate collateral using the same nonce-based receipt flow as the trader SDK. Quote operators cannot move collateral.

`publish` queues validation and returns its handle. `quote.confirm()` waits for validation, submits the reservation, and resolves when the quote is active. After restarting, restore the handle with `maker.quote.get(id)` and call `confirm()` again. Execution is permitted only in the `active` state.

`quote.cancel()` stops selection and releases margin when attached orders have resolved. If attached orders remain, it returns their current state; call it again after settlement. `maker.quote.active()` returns this maker's active handles. `maker.quote.replace(priorId, input, { timeoutMs })` stops and releases the exact prior quote before publishing the replacement. If the prior quote is still pending, resume with the same IDs. Replacement is asynchronous and may temporarily leave no active quote.

## Backstop offers

The maker owner can opt into liquidation backstop capacity after opening and funding its market account. The offer reserves the market's initial margin onchain. The market must have a fresh oracle update, no pending orders, and no existing backstop; the owner account must be ready and meet the minimum collateral policy.

```ts
const offering = await maker.backstop.offer({
  marketId: "SOL-USD",
  maxCapacity: 1_000_000_000n,
  validForSeconds: 3_600,
  clientNonce: savedNonce,
});
const { offerId } = await offering.confirm();

const offer = maker.backstop(offerId);
const release = await offer.release();
await release.confirm();
await offer.close();
```

Persist the nonce or offer ID before signing, and restore a submitted offer with `maker.backstop(offerId)` after a restart. A submission error may leave an offer onchain; inspect its canonical ID before using another nonce. Releasing an active offer pauses trading until the protocol authority resumes the market under its normal checks. Closing a cancelled, rejected, or consumed offer returns its account rent to the owner.

## Fills

`fills.get(orderAddress)` requests a fresh maker-authorized private fill view. `position.summary()` requests a private current position. Operators need an active view grant; funding and position changes require the maker wallet.

`fills.list({ before, until, limit })` reads finalized Solana transaction history and verifies the corresponding onchain fill records. It returns public fill IDs, slots, signatures, and a pagination cursor. Use an archival RPC that retains the required history. Private fill details still require an authorized view.

`fills.subscribe(listener, { cursor, saveCursor, onError })` replays missed finalized fills in chronological order and saves its checkpoint only after the listener succeeds. The listener must persist each fill ID as an idempotency key before requesting an external hedge. A crash after a hedge but before checkpoint persistence can redeliver the fill. The SDK never treats an external hedge as part of the Depth transaction.

The maker owner can use `recovery.status()` and `recovery.claimTo(destination)` after a finalized emergency winddown. An operator cannot sign the maker's payout claim.
