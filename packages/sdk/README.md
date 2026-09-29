# Depth trader SDK

The SDK submits encrypted SOL-USD orders to Solana and reads authenticated private results from Arcium. USDC amounts use six decimals, SOL position quantities use nine decimals, and prices use eight decimals.

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

Supply a stable client nonce when you need to retry a request after a disconnect. Reusing a nonce resolves the same onchain order. The SDK generates a nonce when you omit it.

```ts
const order = await depth.trade.submit({
  marketId: "SOL-USD",
  direction: "long",
  notional: 1_000_000n,
  margin: 200_000n,
  slippageBps: 50,
  maxFee: 1_000n,
  validForSeconds: 120,
  clientNonce: savedNonce,
});
const { orderId } = await order.confirm();
const fill = await order.privateResult();
```

`notional` is the requested USDC execution value. Matching derives SOL quantity at the selected encrypted maker price, rounding down. `submit` opens or increases the same side. `reduce` takes a SOL quantity, `close` derives the full position quantity, and `reverse` takes the desired final USDC exposure on the opposite side. The SDK reads a fresh private position view and binds the encrypted request to its version.

`slippageBps` derives the worst executable price from the verified oracle mark; `validForSeconds` derives the deadline within the market policy. Advanced callers can supply `worstPriceE8` and `expiresAt` instead. The SDK rejects requests that mix both forms.

`margin` is additional USDC collateral allocated from the free balance before an opening or reversal. Use `0n` when current market collateral is sufficient. If the later trade fails, the allocation remains in the market account and can be released through `position.removeMargin`. Every settlement checks current collateral and risk.

Submission confirms the queue transaction. `order.confirm()` waits for a finalized fill and returns its order ID; it raises a typed pending or terminal error otherwise. `order.privateResult()` requests a trader-authorized encrypted fill view, decrypts it, and closes the temporary view after a successful read. A pending computation or uncertain cleanup can be retried on the same operation handle. `order.wait()` returns the latest verified snapshot after its default timeout, including a still pending order. After restarting, use `depth.trade.operation(savedNonce)` or `depth.operation(orderAddress)`. `subscribe(listener, { onError })` returns an unsubscribe function. An ambiguous submission raises `DepthError` with an operation ID and reconciliation action; keep the original nonce.

`order.cancel()` cancels an expired order. If the market pauses after an active-market order has matched, it can be cancelled immediately so the trader can submit a fresh reduction or close. A paused-market increase is rejected by the private match check; an exit still needs a fresh oracle and an active quote.

## Collateral

Open the free balance with `account.open()` and the market account with `position.open()`, then wait for their onchain statuses to become `ready`.

| Action | Next step |
| --- | --- |
| `account.deposit(source, amount, nonce)` | `confirm()` advances private credit and waits for `credited`. |
| `account.allocate(amount, nonce)` | `confirm()` settles escrow into the market account. |
| `account.release(amount, nonce)` | `confirm()` settles escrow into the free balance. |
| `account.withdraw(destination, amount, nonce)` | `confirm()` waits for `paid` or reports a terminal outcome. |

Persist each nonce before signing. Restore handles with `depositHandle(nonce)`, `transferHandle(nonce)`, or `withdrawalHandle(nonce)`. Deposits and escrow transfers can be refunded to the owner's token account. Queued withdrawals can be cancelled with `handle.cancel()`. A paid withdrawal receipt remains available after later balance updates.

`account.pending({ cursor, limit })` scans this wallet's confirmed onchain deposit, margin-transfer, withdrawal, and order accounts. It returns public receipt IDs and nonces with a continuation cursor, so a wallet can rediscover pending actions after changing browsers. An RPC that cannot serve account scans returns an error rather than an empty history.

`trade.unpairedAllocations({ cursor, limit })` finds settled allocations whose nonce has no corresponding order. The results include each transfer ID, amount, nonce, and canonical order ID. A standalone allocation can also appear, so inspect the original action before resubmitting a trade with that nonce or releasing excess margin.

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
