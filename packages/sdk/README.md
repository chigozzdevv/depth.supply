# Depth trader SDK

The SDK submits encrypted SOL-USD orders to Solana and reads authenticated private results from Arcium. USDC amounts use six decimals, SOL order sizes use nine decimals, and prices use eight decimals.

## Connect

```ts
import { create_depth } from "@depth/sdk";

const admin = await create_depth({
  connection,
  wallet: appOwnerWallet,
  deployment: { manifest, trustedSigner },
});

const registration = await admin.app.register({ feeBps: 1 });
const { appId } = await registration.confirm();

const depth = await create_depth({
  connection,
  wallet: traderWallet,
  appId,
  deployment: { manifest, trustedSigner },
});
```

Obtain the manifest and its trusted signing key through your release channel. The SDK verifies the signature, expiry, network genesis, deployed program, IDL, MXE, cluster, computation definitions, settlement mint, and market configuration. For a local validator, explicitly use `deployment: { localnet: true }`; this option accepts only loopback RPC addresses.

Release operators can generate a signed manifest with:

```sh
bun packages/sdk/scripts/manifest.ts RPC_URL SIGNER_FILE VERSION EXPIRY_UNIX OUTPUT_FILE
```

The command reads the deployed accounts, signs their configuration, and creates a new output file. It does not deploy or upgrade programs.

## Trade

Persist the client nonce and request before submission. Reusing a nonce resolves the same operation; it never submits a second order with that nonce.

```ts
const position = await depth.position.summary();
if (position.status !== "ready") throw new Error("Position view is not ready");

const order = await depth.trade.submit({
  marketId: "SOL-USD",
  direction: "long",
  size: 5_000_000n,
  margin: 200_000n,
  worstPriceE8: 20_100_000_000n,
  maxFee: 1_000n,
  expiresAt: Math.floor(Date.now() / 1000) + 120,
  clientNonce: savedNonce,
  positionVersion: position.version,
});
const { orderId } = await order.confirm();
const fill = await order.privateResult();
```

`submit` opens or increases the same side. `reduce` permits only an opposite fill no larger than the current position. `close` requires its entire size, and `reverse` requires a size larger than the old position. Every method binds the encrypted request to the supplied position version. A stale version rejects; direction, size, intent, and price limits stay encrypted.

The requested margin must cover the fee and initial margin on newly opened exposure. A full close requires no opening margin; every settlement still checks the remaining position and maker collateral.

Submission confirms the queue transaction. `order.confirm()` waits for a finalized fill and returns its order ID; it raises a typed pending or terminal error otherwise. `order.privateResult()` requests a trader-authorized encrypted fill view, decrypts it, and closes the temporary view after a successful read. A pending computation or uncertain cleanup can be retried on the same operation handle. `order.wait()` returns the latest verified snapshot after its default timeout, including a still pending order. After restarting, use `depth.trade.operation(savedNonce)` or `depth.operation(orderAddress)`. `subscribe(listener, { onError })` returns an unsubscribe function. An ambiguous submission raises `DepthError` with an operation ID and reconciliation action; keep the original nonce.

## Collateral

Open the free balance with `account.open()` and the market account with `position.open()`, then wait for their onchain statuses to become `ready`.

| Action | Next step |
| --- | --- |
| `account.deposit(source, amount, nonce)` | Call the receipt's `credit()` while pending, then wait for `credited`. |
| `account.allocate(amount, nonce)` | Call the transfer's `settle()` when in escrow, then wait for `settled`. |
| `account.release(amount, nonce)` | Settle escrow into free balance after the private debit succeeds. |
| `account.withdraw(destination, amount, nonce)` | Read the withdrawal receipt until `paid`, `rejected`, or `cancelled`. |

Persist each nonce before signing. Restore handles with `depositHandle(nonce)`, `transferHandle(nonce)`, or `withdrawalHandle(nonce)`. Deposits and escrow transfers can be refunded to the owner's token account. Queued withdrawals can be cancelled with `handle.cancel()`. A paid withdrawal receipt remains available after later balance updates.

`account.pending({ cursor, limit })` scans this wallet's confirmed onchain deposit, margin-transfer, withdrawal, and order accounts. It returns public receipt IDs and nonces with a continuation cursor, so a wallet can rediscover pending actions after changing browsers. An RPC that cannot serve account scans returns an error rather than an empty history.

`position.addMargin` and `position.removeMargin` use the allocation and release flow. Removing margin checks current funding, reserved margin, and initial-margin health against a fresh oracle snapshot. It never releases unrealized profit. A changed or expired snapshot rejects the debit.

## Private views and recovery

`account.summary()` and `position.summary()` request fresh owner-signed views. Results report their state version, confirmed slot, and `pending`, `ready`, or `stale` status. Decrypted fields are available only when ready. `requestBalanceView()` and `requestMarketView()` expose handles whose `close()` method returns view-account rent. A new authorized view works after losing a prior session's key.

After a committee-authorized winddown finalizes, read `recovery.status()` and call `recovery.claimTo(usdcTokenAccount)` when it is `claimable`. Claim receipts remain onchain after payment. Emergency recovery publicly reveals the committed positions and fees needed for settlement.

Recovery coordinators can construct `new WinddownOperator(depth.program)`.
`start(clearingWitness, committeeKeys)` returns an unsigned transaction requiring
at least three registered committee signatures. After that transaction confirms,
`reveal(owner, witness)` and `revealFee(order, witness)` submit committed states;
existing claims are detected on restart. `finalize()` succeeds only when the
contract verifies all account counts, exposure, fees, and vault backing.
Witnesses come from the committee's independently held recovery shares. These
methods neither collect those shares nor prove that an MXE failure is permanent.

A pending account initialization can be cancelled with `account.cancelOpen()`
or `position.cancelOpen()`. Deposit and transfer handles expose `cancel()` for
pending credit or debit computations. Read the resulting receipt again before
refunding or retrying; cancellation never means that an already finalized
payment has been reversed.
