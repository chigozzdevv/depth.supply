# Depth maker SDK

The maker SDK signs quote and operator transactions directly to the Depth program. The maker funds its market account before publishing quotes. An operator can quote only within the capacity, expiry, and view scope granted by the maker wallet.

```ts
import { createDepthMaker } from "@depth/maker-sdk";

const maker = await createDepthMaker({
  connection,
  wallet,
  maker: makerPublicKey,
});

const quote = await maker.quote.publish({
  tiers: [
    {
      size: 1_000_000n,
      bidE8: 19_900_000_000n,
      askE8: 20_100_000_000n,
    },
  ],
  maxCapacity: 3_000_000n,
  expiresAt: Math.floor(Date.now() / 1000) + 120,
});

persist(quote.id.toBase58());
const state = await quote.wait({ timeoutMs: 30_000 });
```

Before publishing, the maker opens its free balance and market account with `maker.account.open()` and `maker.account.openMarket()`, then waits for both callbacks to reach `ready`. It deposits USDC with `maker.account.deposit()`, credits the pending receipt, allocates margin with `maker.account.allocate()`, and settles the escrow transfer. Wait for each callback to finish before advancing. The returned transaction signatures confirm queue submission, not private computation completion. The maker wallet signs funding and margin changes; a quote operator cannot move collateral.

`publish` submits the encrypted quote, waits up to 30 seconds for validation, and signs its reservation when validation completes. It may return a pending handle if computation takes longer; call `quote.activate({ timeoutMs })` to resume, including after a restart with `maker.quote.get(id)`. The quote is executable only when its onchain status is `active`.

`quote.cancel()` stops an active quote from new selection and queues release of its reserved margin. The margin becomes available only when the release callback sets the quote to `cancelled`.

The maker wallet or an operator with view scope can request its sealed position and finalized fill details:

```ts
const position = await maker.position.summary();
const fill = await maker.fills.get(orderAddress);
```

These views return decrypted fields only after the authenticated callback is ready. The maker can request a fresh view after a restart.

The maker owner uses `maker.recovery.status()` and
`maker.recovery.claimTo(usdcTokenAccount)` for a finalized market winddown.
An operator can read the public recovery status but cannot sign the maker's
payout claim.
