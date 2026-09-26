# Depth

Depth is a shared, confidential perpetual trading venue on Solana. Trading
applications bring users through their own interfaces. Independent makers post
collateral and compete to take the other side of trades. Depth holds the
collateral, clears fills, keeps the position ledger, checks risk, and settles
cash flows.

A Depth market tracks the price of an external asset. It settles in a supported
Solana token. The trader does not receive or deliver the underlying asset.
Each market has a published oracle, margin policy, funding rule, fees, and
failure policy. An app that integrates Depth routes a trade into Depth's
clearing system. Its existing venue may continue to serve other trades, but it
does not own a Depth position.

This protocol specification defines the required trading, custody, privacy,
and recovery behavior. No market should claim live position privacy or safe
clearing until the acceptance checks at the end pass.

## People and terms

| Term | Meaning |
| --- | --- |
| Trader | Opens, manages, and closes a market position. |
| Maker | Posts collateral and publishes firm prices on both sides of a market. A maker can serve every integrating app. |
| App | Presents Depth markets to users. It may use the hosted Depth trade interface or build its own interface with the SDK. |
| Depth account | One wallet's free balance, locked margin, positions, and pending operations inside Depth. |
| Market | A cash-settled perpetual contract with one settlement mint, oracle feed, and risk policy. |
| Quote | A maker's signed, time-limited bid and ask for stated size tiers and capacity. |
| Position | The account's net long or short exposure in one market. A maker has positions under the same rules as a trader. |
| Clearing vault | A Solana token account controlled by the Depth program. It holds deposited settlement tokens. |
| Private ledger | Encrypted balances, positions, quote prices, and risk data that Depth updates through Arcium computations. |
| Operation | One submitted change. It can be queued, finalized, rejected, expired, or failed. |
| Keeper | Anyone who pays to submit an eligible oracle, funding, or liquidation operation. A keeper cannot choose its own risk result. |
| Insurance fund | Separately accounted collateral that absorbs losses after the distressed account's margin. |

All token amounts are integer base units. Price precision, rounding, time units,
quote tiers, and risk parameters belong to a versioned market configuration.
The first market is a SOL perpetual margined and settled in native Solana
USDC. Its position tracks SOL/USD; no SOL is delivered. Example amounts
elsewhere in this document are illustrative.

### First market identity

| Field | Value |
| --- | --- |
| Underlying and quote | SOL/USD perpetual |
| Collateral and settlement | Native USDC on Solana mainnet, mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Risk oracle | Pyth Core stable SOL/USD feed `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| Pyth receiver | `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` on Solana mainnet |
| Market hours | Continuous while the oracle and clearing system are available |

The USDC mint is Circle's native Solana mainnet issuance. The Pyth feed ID is
the SOL/USD identifier in Pyth's receiver SDK, and the receiver address is
Pyth's current Solana deployment. Deployments on other clusters must specify
their own settlement mint and verify oracle availability; a test token must
never be presented as mainnet USDC. Feed freshness, confidence bounds, and
delayed-price handling remain part of the market's risk policy.

## Economic model

Depth is a cash-settled perp market. A trader buys at a maker's ask or sells
at a maker's bid; the maker takes the equal and opposite exposure. Both
participants allocate settlement tokens as margin, and the vault holds the
actual tokens. A normal close trades against any eligible maker and realizes
profit or loss at that new execution price. The oracle supplies the risk mark
and liquidation reference, not the normal execution price.

Initial margin sets the collateral required to add exposure. Maintenance
margin sets the threshold for liquidation. Each active maker quote also ties
up enough collateral for its promised capacity, including simultaneous fills
on both sides if the quote rules permit them. Funding periodically transfers
value between longs and shorts under the market's published formula; it does
not create tokens. Trade fees move from the paying account to the declared
maker, app, protocol, and insurance recipients under the signed fee limit.

An account's profitable position is a claim against the vault and the losing
side, not a new token mint. If a losing account cannot pay, its margin is used
first, then the market insurance allocation, then the published final loss
rule. Each transition must leave total claims, fee balances, insurance, and
token payouts reconciled with the vault. The first market implements onchain
oracle validation, margin and capacity limits, funding, fees, a backstop, and
a final payout haircut. Its parameters still require calibration and
independent review before real collateral is accepted.

## What each part owns

Depth has four authoritative layers.

1. **The Solana program** owns the custody vault and public rules. It verifies
   wallet authorization, registered markets, settlement mints, program
   addresses, oracle accounts, nonces, deadlines, state versions, and Arcium
   callbacks. It moves tokens only according to accepted state transitions.
2. **The Arcium MXE** runs Depth's encrypted instructions. It compares encrypted
   orders with encrypted quotes, updates private balances and positions, checks
   margin, and decides whether a liquidation condition holds. Depth writes these
   instructions in Arcis. Arcium does not supply the trading rules.
3. **The SDK and hosted trade interface** encrypt sensitive inputs in the user's
   client, obtain wallet signatures, submit transactions, track asynchronous
   computations, and show information the user is allowed to see.
4. **The service and indexer** help apps discover markets, track public
   operations, and resume interrupted interfaces. They cannot fabricate fills,
   release collateral, decide liquidations, or replace the onchain ledger.

Encrypted matching and risk checks run through Arcium, outside Solana
validator execution. Solana coordinates the request and enforces custody and
the accepted callback.

The real tokens stay in the clearing vault. The private ledger states whose
claim each token represents and how much is free, committed as margin, owed
through PnL, or reserved for a pending operation. Each accepted update must
conserve value after explicit fees and insurance transfers. The Solana program
checks the authenticated computation result, state version, permitted token
movement, destination, and actual vault balance before applying it. The
program cannot itself inspect all encrypted balances. Correct private
accounting therefore depends on Depth's circuit and Arcium's stated MPC
security model. It is not an ordinary Solana-only verification of each hidden
balance.

Each account has isolated risk by market. Profits in one market do not silently
support losses in another. Free settlement balance can fund a new market
position only after an explicit allocation. One market operation changes one
version of that market's private state. The correctness model serializes
state-changing computations for a market. It also locks each affected
account across markets while its balance is pending. Allocation from a
global free balance, withdrawal, and quote reservation obey that account
lock. A later operation must use finalized versions, so two pending fills
cannot spend the same maker capacity or free balance. Parallel market
processing is possible only after a separate concurrency design proves
that shared balances cannot be spent twice.

## One trade from request to exit

This walkthrough follows one long trade. A short uses the maker's bid
rather than its ask. It states which event changes economic ownership.
The later sections give the rules for each step.

### Prepare the market and maker quotes

1. Depth publishes a market revision with its settlement mint, oracle,
   funding, margin, quote tiers, fees, and loss rules. The Solana program,
   Arcium computation definitions, and vault addresses are pinned in the
   deployment manifest. A market does not open merely because a
   frontend lists it.
2. Makers register wallets, deposit settlement tokens into the Depth
   vault, and allocate free balance to the market. A maker may grant a
   narrowly scoped bot key permission to publish quotes and another
   scope to view its own fills. The wallet keeps withdrawal and margin
   authority.
3. A maker bot decides a bid and ask for each size tier. The bid is the
   price at which the maker takes the other side of a trader short.
   The ask is the price for a trader long. The bot sets capacity and a
   short expiry. It prices inventory and its expected cost to hedge
   after a fill.
4. In the maker client, the exact bid and ask are packed into the
   generated Arcis input layout and encrypted with a fresh nonce and
   the MXE public key. The public envelope identifies the market,
   maker, tiers, capacity bound, expiry, quote version, and ciphertext
   hash. The maker wallet or scoped operator signs the envelope and
   ciphertext commitment. The app and rival makers do not receive
   the price plaintext.
5. The Solana program checks signer scope, market revision, nonce,
   deadlines, and public bounds. It queues quote activation. The
   Arcium computation checks the maker's encrypted free balance
   against existing positions and quote reservations. Its callback
   persists an MXE-encrypted quote and reserves enough margin for the
   promised capacity. Only then does the public quote record say
   active. A queued quote is never offered to a trader as firm.

### Submit a trader request

6. A trader enters the Depth market through an app. In Depth's hosted
   interface, the trader enters direction, exact notional, margin,
   worst price, maximum fee, and expiry on the isolated Depth origin.
   A custom app that collects these inputs knows them itself. The
   trader sees the market rules, oracle reference, and available
   balance before approval. If needed, the trader deposits first
   and waits for the Depth balance credit to finalize.
7. The client reads a deterministic active-quote snapshot and the
   current market revision. It creates a fresh X25519 client key and
   nonce, derives a shared secret with the MXE public key, and uses
   Arcium's client encryption flow on the private order fields.
   This is encrypted input the MXE can compute on; a hash of the
   order alone would not work. Public fields include the trader
   account, market, app attribution, deadline, snapshot ID, order
   nonce, client public key, and ciphertext. The exact side, size,
   limit, and margin do not appear in that public envelope.
8. The wallet signs the exact transaction and ciphertext commitment.
   The program checks wallet authority, accepted mint and account,
   nonce, current market and oracle rules, snapshot, and pending
   locks. It records the operation and locks the account and market
   versions against conflicting spending while the Arcium computation
   is queued. The program cannot read the private free balance; the
   circuit checks and reserves it at a valid callback. The submission
   transaction is an order request, not an executed position.

### Match and create the position

9. The Arcis matching instruction reads the encrypted trader input,
   MXE-encrypted active quote snapshot, encrypted balances, and
   current encrypted positions. It evaluates the hidden side and
   size against every eligible maker's price and capacity. It
   enforces the trader's price and fee bounds, collateral, oracle
   deviation, exposure caps, proof that each quote was active and
   unexpired when this order was admitted, and the no-self-match
   rule. It selects the best eligible full fill under the
   published tie rule. It does not let the app nominate a favored
   subset of makers.
10. If no quote qualifies, the computation returns a rejection and
    the pending reservation is released through the verified
    recovery path. If one qualifies, the computation calculates
    the trader's new exposure and the winning maker's equal
    opposite exposure. It moves margin from available to locked,
    accounts for fees and any realized PnL, consumes maker quote
    capacity, and produces updated MXE-encrypted ledger and
    position data. Matching does not move the vault tokens to a
    maker's external wallet.
11. The Solana callback verifies the signed Arcium result and the
    exact computation, market, quote snapshot, oracle rule, input
    versions, and pending operation. It applies the trader and
    maker state changes together or applies neither. It stores
    the new ciphertext, updates the public operation and quote
    records, and prevents replay. A finalized operation is a
    fill only if its result says filled and its callback is final
    at the published Solana commitment level.
12. The public can see accounts, market, timing, result status, and
    possibly the winning maker identity. Solana stores only ciphertext
    for the position's direction, notional, entry, margin, funding
    checkpoint, and health; there is no plaintext position ledger.
    The trader and maker each request a signed private view of
    their own fill and position. Depth re-seals those fields to
    that requester's fresh session key. Losing makers receive no
    order side or fill details. A direct same-callback sealed
    notice would be an optimization only if its recipient
    selection and callback size are proved.

### Hedge, maintain, and exit

13. After its fill and private view finalize, the maker updates
    inventory and may hedge at a separate venue. That hedge may
    partially fill, fail, or be omitted. The maker still owes
    its Depth margin and takes the risk until it hedges. Depth
    cannot roll back the trader's fill because the external
    hedge failed.
14. The market's funding index and oracle mark update under
    published rules. Both parties can view their own current
    equity and health with owner authorization. They can add
    margin. Removing margin or withdrawing free tokens requires
    a fresh private check and a signed Depth operation. The
    keeper can request a liquidation check but cannot supply
    its own position value.
15. The trader closes by sending an opposite request with a
    current snapshot and signed price limit. The matching
    process runs again. The closing maker need not be the
    opening maker. For example, if Maker A remains short and
    Maker B buys from the closing long trader, Maker B becomes
    long while Maker A remains short; Depth's aggregate
    exposures still balance. The trader realizes PnL, pays
    fees, and releases eligible margin only after the close
    callback finalizes. An unfilled close leaves the original
    position open.
16. If an account falls below maintenance margin, the
    liquidation flow moves its exposure to the funded
    backstop and applies the insurance and final loss rules.
    If the position closes normally, the user may withdraw
    its free settlement balance from the vault. That payout
    is a public Solana token transfer. If the MXE fails
    permanently, the recovery committee can start the
    market-wide winddown described below.

The accounting boundary is simple: a deposit or withdrawal transfers
real tokens; a pending deposit is a separate vault claim until credited
or refunded; quote activation reserves a private claim; a fill,
funding payment, margin move, close, or liquidation changes private
claims against the same vault. Keeper rewards and other explicit
payouts also transfer tokens. Every accepted update must reconcile
private claims with the actual vault assets.

| Data | Where it lives during normal operation | Who can read it |
| --- | --- | --- |
| Exact maker bid and ask on submission | Client-encrypted input; then MXE-encrypted active quote state | Maker and MXE computation |
| Trader direction, size, margin, and bounds on submission | Client-encrypted input | Trader and MXE computation; also a custom app that collected the inputs |
| Open balances, positions, and health | MXE-encrypted Solana state | MXE computation; owner through an authorized re-sealed view |
| Market, account addresses, quote tiers, capacity envelope, expiry, operation status, and token transfers | Public Solana accounts and transactions | Anyone |
| Final fill terms | MXE-encrypted receipt and owner-authorized views | Trader and winning maker for their own fill |

The cryptographic types behind this boundary are Arcium's
client-and-MXE encrypted input (Enc<Shared>) and MXE-only encrypted
state (Enc<Mxe>). Depth must implement the conversion, account
authorization, storage, and re-sealing rules. Arcium supplies the
primitives, not this trading lifecycle.

## Privacy promise and its limits

Depth's intended protection is about trading data, not wallet anonymity.

| Information | Public observer | Losing maker | Winning maker | Trader |
| --- | --- | --- | --- | --- |
| Market, transaction timing, account addresses, and a pending operation | Visible or inferable | Visible or inferable | Visible or inferable | Visible |
| Trader direction, exact notional, limit, and entry price before selection | Encrypted | Encrypted | Encrypted until its fill | Known |
| Maker bid and ask prices | Encrypted | Own quote only | Own quote and its fill | Only the executed price after a fill |
| Open position direction, size, entry, margin, funding, and health | Stored encrypted; metadata may leak clues | No direct view of another position | Knows its own exposure and the paired fill needed to manage it | Authorized view |
| Deposits, withdrawals, program accounts, and token mint | Generally visible with normal token transfers | Visible | Visible | Visible |
| A public emergency exit | Reveals the fields needed for onchain settlement | Revealed fields become public | Revealed fields become public | Revealed fields become public |

A winning maker must learn its own fill. It can hedge, share, or act on that
information. Depth cannot promise to stop this. A custom app that collects the
trade details in its own page already knows them. The hosted Depth interface
can keep the raw input away from the integrating app if it uses an isolated
Depth-controlled origin and sends the app only non-sensitive status.

Normal Solana token transfers expose addresses and amounts. A public deposit
close to an order can reveal a rough size. A visible maker account selected for
a fill can also leak clues. Depth must measure these correlations before
describing live positions as fully hidden. Token-2022 Confidential Balances can
hide transfer amounts for supported mints and accounts, but they do not hide
participants or market activity. They are a separate integration, not an
automatic property of Arcium or of ordinary USDC.

The privacy assumption is also explicit. Arcium documents Cerberus as a
dishonest-majority, detect-and-abort MPC protocol. Its stated privacy and
integrity property depends on at least one honest cluster member. Cluster
availability and recovery remain liveness assumptions. Depth must disclose its
selected cluster and recovery policy.

## Rules that cannot be bypassed

1. Only the trader's wallet may authorize a trader action. A maker wallet
   or its registered, narrowly scoped quote operator may publish and cancel
   that maker's quotes. An operator cannot withdraw funds, move margin, or
   change its own authority. App identifiers and servers grant no spending
   authority.
2. A quote becomes firm only after Depth confirms its maker collateral and
   reserves capacity. A maker cannot withdraw reserved capacity or retract a
   quote for an order already admitted under it.
3. Every fill changes the trader and maker exposures together. No side gets an
   unbacked position or a unilateral credit to its balance.
4. A maker must quote both directions for each offered tier. Its bid is
   the price at which it buys from a short trader; its ask is the price
   at which it sells to a long trader. The trader's side is not sent to
   makers before selection. An account cannot fill against its own quote.
5. The winning quote is the best eligible executable price for the encrypted
   side and size within one complete, deterministic quote snapshot. Ties use a
   published rule. The app or relayer cannot omit a cheaper eligible quote.
6. A fill requires fresh price data, proof the quote was active at order
   admission, finalization within the trader's deadline, enough
   free collateral on both sides, the market's exposure limits, and the
   trader's price and fee limits.
7. No payout or margin withdrawal is valid only because an indexer says an
   account is healthy. The accepted private state transition must prove it
   under the market's rules.
8. A callback applies only once to the exact pending operation, computation
   definition, market revision, oracle snapshot, quote snapshot, and input
   state version that created it.
9. Market pauses stop new risk. Deposits, safe reductions, quote cancellation
   after its lock period, and recovery retain their published paths. If
   confidential computation is unavailable, operations needing a private
   balance check cannot be pretended to be safe.
10. Governance cannot move user collateral out of the vault. Market or
    computation upgrades do not silently change a live position's accepted
    terms.

## Market admission

A market must publish the following before an app can offer it:

- The asset description, settlement mint, oracle provider, exact feed ID,
  accepted price update accounts, price precision, market hours, and the
  treatment of halted or unavailable prices.
- Its initial and maintenance margin formulas, per-account and per-market
  exposure caps, maker capacity rule, liquidation fee, insurance allocation,
  and loss waterfall.
- Its quote tiers, maximum active quotes in a snapshot, quote lifetime,
  minimum hold or delay rule if used, maximum queued-order duration,
  price and fee bounds, and tie rule.
- Its funding formula, interval, rate cap, and cumulative funding index.
  Funding must transfer value between long and short exposures under a
  deterministic rule. Arcium provides arithmetic, not a funding rate or an
  external perp mark. Depth must choose and publish the economic formula.
- Its trade, close, and liquidation price rules. The execution price comes
  from the selected maker quote. The oracle is the reference for risk and
  settlement. A quote must be bounded against that reference.
- Its circuit version, MXE, Arcium cluster, program addresses, emergency
  handling, and any future migration path.

A proposed synthetic asset is not listed merely because a ticker exists. Its
feed must cover the market hours and have usable freshness and confidence.
The oracle must represent the asset that the contract promises to track.
Unsupported market hours, stale updates, wide confidence, or an unavailable
backstop put the market in a published restricted state.

Pyth Core is the first market's selected oracle. Its Solana receiver lets a
program verify the update account owner, feed ID, publish time, price,
confidence, and exponent.
Depth must normalize units, reject non-positive or stale data, apply a
confidence threshold, and reject old but still technically valid updates
chosen opportunistically by a caller. Pyth's own derivative guidance calls
out delayed settlement and same-block oracle exploitation. Depth must test
its entry, close, and liquidation timing against those cases.

## App integration

An app registers its signing key and 0–2 bps fee onchain. Its public profile
may include a name, verified origin, supported environment, and callback
URL. Registration does not give custody or control over a trader. A direct
Depth interface uses a registered zero-fee app identity.

The app displays Depth's market catalog and the user's authorized account
view. It can open Depth's hosted trade interface with a market already chosen.
The hosted interface collects the direction and amount, encrypts them in the
client, and obtains the wallet signature. The app receives an operation ID and
non-sensitive outcome. It does not receive a plaintext order from that route.

A custom interface can use the headless SDK. In that route, the app's own code
receives the form inputs before passing them to Depth. Depth still protects
those inputs from public observers and losing makers. The app must not market
them as hidden from itself.

Every app reads the same Depth account and market positions. A user can open a
position through App A and view or close it through App B after connecting the
same wallet. The app cannot restrict a position to its own frontend. App fees
and referrals are fixed in the signed order and market policy. An app cannot
change a quote, recipient, or margin rule.

## Fund an account

A trader or maker connects a Solana wallet and deposits the configured
settlement token into Depth's program-controlled vault. The program checks
the mint and actual amount received, then records that amount as a pending,
unallocated deposit tied to the wallet and nonce. The tokens are already
in the vault but cannot fund a quote or position yet. A serialized ledger
computation credits the matching private free balance exactly once. Its
verified callback consumes the pending deposit record. A transaction
signature or server record alone is not a spendable balance credit.

If the credit computation fails or expires, the pending deposit is
reconciled before retry. A refund, if needed, pays only the original
wallet and consumes the same pending record. The program must prevent a
later callback from also crediting it. Pending deposits are a separate
claim in the vault conservation equation, not protocol revenue.

A deposit may be made well before a trade. This separates deposit timing from
order timing, although it does not provide anonymity. Deposits are free
balance until a quote reservation or position locks them. A maker can deposit
into the same account from which it supplies multiple apps. The maker's
capacity is shared across those apps because they use one Depth ledger.

A withdrawal requires a signed request, a fresh private available-balance
check, no conflicting pending operation, and a verified callback. The program
pays only the approved settlement amount to the recorded wallet destination.
A position's locked margin cannot be withdrawn as free balance. If a
withdrawal fails after submission, the SDK shows whether the request is still
pending, rejected, expired, or finalized; it never submits a second payout
blindly.

## Maker quote lifecycle

1. A maker selects an admitted market and size tiers. It prepares a bid and
   ask price for each tier, a maximum fill capacity, expiry, and nonce. Its
   wallet or registered quote operator signs the complete quote envelope.
2. The maker client encrypts the price curve before transmission. Public
   fields identify the maker, market, tiers, capacity bound, expiry, and quote
   version. Exact bid and ask prices remain encrypted. The ciphertext is
   submitted to Depth, not handed in plaintext to apps or invited rivals.
3. Depth queues an Arcium activation computation. The circuit checks the
   maker's free collateral, current reservations, bid and ask ordering,
   market price bounds, and tier and capacity rules. It writes an
   MXE-encrypted active quote and reserves the worst-case maker margin for its
   promised capacity. The onchain callback persists that ciphertext and the
   public quote record.
4. A quote appears as active only after that callback. The maker may replace
   or cancel it for future snapshots, subject to the quote rules. Quote
   expiry stops new order admission. A quote that was active at admission
   remains pinned and funded for that order until the order becomes
   terminal, even if the quote later expires or is cancelled. The trader's
   signed deadline is the last allowed finalization time. A bounded
   computation timeout prevents pinned maker capacity from remaining
   locked indefinitely.
5. A fill consumes quote capacity. Unused capacity returns when the quote
   expires or is cancelled after all attached orders finish. A maker may
   hedge elsewhere, but its Depth collateral stays locked.

The market registry lists every active quote eligible for a snapshot.
Snapshots have a fixed, public circuit capacity. If more quotes arrive than
that capacity, admission follows a published deterministic rule and excess
quotes wait for the next snapshot. The order submitter cannot choose a
private subset. Depth does not claim that hiding maker quotes always improves
the trader's price. The research in this folder treats that as an empirical
question. Here, encrypted two-sided quotes keep the trader's side from losing
makers and prevent a public winning-maker identifier from directly exposing
which of a maker's visible bid or ask was taken.

## Maker operating flow and hedging

The maker is a real counterparty with its own Depth position, margin, funding,
and liquidation risk. It is not an anonymous source of prices. An integrating
app does not need a private agreement with each maker. The maker joins Depth
once and can compete for trades from all apps.

### Set up and allocate capital

1. The maker registers its wallet and settlement account. It may register a
   separate bot key for quoting. That key has explicit markets, quote size,
   expiry, and replacement rights. A separate explicit scope can let the bot
   view that maker's own fills and positions for hedging. The maker can use
   different keys for quoting and viewing. Neither scope permits withdrawal,
   margin transfer, adding another operator, or changing risk policy. The maker wallet can revoke it for
   future actions; revocation cannot erase quotes already bound to pending
   orders.
2. The maker deposits the settlement token into Depth. It allocates an amount
   to each market. The SDK reports free balance, quote reservations, locked
   position margin, pending changes, and the market's published maximum
   exposure. Capital at an external hedge venue is separate. Depth does not
   count an external hedge as collateral unless a separately verified and
   enforceable integration is added.
3. The maker bot reads the current oracle, funding terms, its authorized
   private position view, external market conditions, and available hedge
   capacity. It chooses a bid and ask for each supported tier. It may skew
   prices to reduce inventory. It may shorten expiry or stop quoting when
   volatility, oracle confidence, funding, or hedge capacity crosses its
   own limits. Depth checks protocol bounds but does not invent the maker's
   commercial strategy.

A maker must reserve enough Depth collateral for the largest exposure
promised by its active quotes and existing positions. It cannot reuse the
same balance through several apps or markets. The program's account locks
and the circuit's capacity calculation enforce this. Registration alone
does not make a quote active.

### Publish, refresh, and stop quoting

The maker publishes encrypted two-sided curves through the maker SDK. The
activation callback confirms the reservation. Only then can the quote
compete. The maker tracks the active version and expiry, not merely its
submission transaction. A replacement creates a new version for future
snapshots. The previous version remains binding for orders already
admitted against it. Cancellation stops future selection after the
cancellation callback; it cannot cancel a pending accepted fill.

The bot refreshes quotes before they become stale. It suspends new quoting
when its risk or external hedge service fails. A bot crash does not remove
live quote obligations. Short expiries, quote capacity, reserved collateral,
and the maker's own alerts bound that risk. The market may reject all new
orders if every eligible quote has expired.

### Receive a fill and hedge

1. The maker waits for a finalized Depth fill. A queued order, a likely win,
   or an indexer prediction is not a fill. The maker SDK locates the
   authenticated operation and requests a maker-authorized private view.
2. The view re-seals the maker's own fill details to its fresh session key.
   It gives the maker the market, side, size, price, fees, funding
   checkpoint, position change, and remaining capacity. The public and
   losing makers do not receive those details. The extra view computation
   adds latency before the maker can hedge.
3. The maker records the Depth fill ID as an idempotency key. Its risk bot
   compares the new Depth exposure with all confirmed external hedges. It
   may hedge fully, partially, or not at all. To hedge a short Depth
   exposure, for example, it may buy matching exposure elsewhere. The
   maker chooses the hedge venue and pays that venue's margin and fees.
4. The bot submits and confirms the external hedge separately. It records
   the hedge venue's order and fill IDs, partial fills, fees, funding, and
   actual net exposure. It does not report a hedge as complete from an
   order acknowledgement. It retries safely or alerts a human if the
   venue is unavailable or the hedge exceeds its price limit.

The exact direction is hidden until the Depth fill. A maker therefore
cannot hedge that exact flow before the fill while preserving this
information policy. The maker prices the period between fill and hedge,
including volatility, latency, slippage, basis, and external funding, into
its bid and ask. This may widen quotes. It is a trade-off of side-hidden
maker competition, not a guaranteed execution improvement. SYMMIO's
published solver flow sometimes locks a known trader quote, hedges
externally, and then opens the position. Depth's precommitted two-sided
flow has a different timing and information boundary.

An external hedge is not atomic with a Depth fill. If Depth finalizes and
the hedge fails, the maker remains exposed on Depth. The maker can top up
margin, stop new quotes, seek another hedge, or place a reduce-only Depth
order. It cannot reverse the trader's finalized fill because its hedge
failed. If the Depth computation rejects, the maker must not hedge a
fill it never received. A maker that hedges speculatively before finality
owns any resulting overhedge.

### Manage and exit inventory

The maker receives the same mark, funding, and margin checks as a trader.
Its bot checks the authorized private health view, public oracle freshness,
quote reservations, and exposure caps. It tops up before maintenance
margin is breached. It can lower future quote capacity, cancel future
quotes, or submit an opposite order to reduce its Depth position. A maker
may also update an external hedge. The bot unwinds that hedge only after
the corresponding Depth reduction actually finalizes, unless it
intentionally accepts interim exposure.

A maker can withdraw only free collateral after all quote reservations,
position margin, pending fills, funding, and losses are reconciled.
A maker liquidation cancels quotes for future orders and applies the same
published loss waterfall. Orders already attached to those quotes resolve
against the maker's still-reserved capacity or reject and release their
locks if that capacity is gone. They cannot create an uncollateralized
fill. Pending quotes cannot hide a maker deficit. A large maker failure
can affect many apps, so markets need concentration caps and backstops.

Depth provides fill notices, balances, quote management, and position
operations. It does not execute trades at an external hedge venue or
verify that a maker hedged. The maker owns its external credentials and
basis risk. Its hedge PnL cannot silently subsidize a Depth loss, and an
external profit is not Depth collateral.

## Open a position

1. The app or Depth interface shows the oracle reference, market policy,
   possible fees, available balance, and an indicative price range. An
   indicative range is not a firm fill. The trader selects long or short,
   exact notional, margin, a worst acceptable execution price, maximum fee,
   and an expiry. The interface states that a fill can fail if no eligible
   maker can meet those bounds.
2. The client encrypts the sensitive fields using Arcium's TypeScript client
   flow. It uses a fresh nonce and the MXE public key. It submits ciphertext,
   market and app IDs, the public routing envelope, a unique order nonce, and
   the wallet's authorization. The routing envelope contains no plaintext
   direction, exact notional, margin, or limit. A hash alone would not let
   the MXE compare hidden orders and quotes.
3. The Depth program checks public authorization, account identity, a
   credited Depth account, the market and oracle accounts, the order
   deadline, quote snapshot, and pending locks. It locks the account and
   market versions, creates fixed-size callback accounts, records an
   operation, and queues the encrypted computation. The private circuit
   checks available balance. This is pending, not a fill.
4. The MXE compares the order with every quote in that snapshot. It rejects
   invalid prices, quotes that were not active at admission,
   unavailable maker capacity, insufficient margin, breached exposure limits, and a price outside the trader's limit.
   It selects the best valid executable quote for the full order. This design
   does not silently split one order across makers. A trader may submit a
   separate order if a full fill is unavailable.
5. For a fill, the circuit computes the entry price, fees, updated free and
   locked balances, and equal opposing trader and maker exposures. It returns
   compact MXE-encrypted state and a bounded encrypted fill record. Public
   outputs identify the accounts and operation the Solana program must
   update. Owner-specific fill details are released by a separate authorized
   view computation. A same-callback sealed result is an optional
   optimization, not an assumed Arcium capability for a dynamically chosen
   winning maker.
6. The Depth callback verifies Arcium's signed output and all pinned IDs and
   state versions. It checks the oracle and quote timing policy again. It
   updates the encrypted ledger and position accounts together. It records
   the fill once. If a validation fails, no partial ledger or token update
   survives the transaction.
7. The SDK waits for the final callback before calling the trade filled.
   The trader then requests a wallet-authorized private view and sees the
   execution price, notional, fees, margin, selected maker, and position ID.
   The winning maker requests its own view and can hedge after it arrives.

A rejected, expired, or failed computation releases the order's pending
reservation without opening a position. A queued Arcium computation can
expire or fail. The app must show the actual terminal result, not treat the
submission transaction as execution. Retries use a new operation only after
the old one is reconciled. They need a fresh nonce and current quote snapshot.

The winning maker is bound by its pre-funded quote. It cannot wait for the
trader's side and then refuse that particular fill. If its capacity is no
longer valid because of an earlier finalized action, the state version
check rejects and the order is rematched only after a fresh user-approved
limit and snapshot. The circuit cannot charge a worse price without the
trader's signed bound.

## While a position is open

Depth keeps one net position per account per market. A fill on the same side
increases it. A fill on the opposite side reduces it, closes it, or reverses
it, according to the user's signed instruction. The maker's account changes
in the opposite direction. Multiple fills can produce a weighted entry
price and a realized PnL entry, but they cannot mint settlement tokens.

The market oracle supplies the risk mark. The private circuit calculates
unrealized PnL from signed exposure and the difference between mark and
entry. It applies accrued funding, realized PnL, and fees to account equity.
The public market funding index advances under the published rule. A
position's private funding checkpoint lets the circuit calculate its own
accrual without publishing its size.

For each risk check:

- Equity is allocated margin plus realized and unrealized PnL, less owed
  funding and fees. All arithmetic uses explicit fixed-point units and
  bounded signed ranges.
- Initial margin limits new exposure. Maintenance margin determines when an
  existing position can be liquidated. The maker follows these rules too.
- Unrealized profit does not become freely withdrawable if doing so would
  leave the account below its required margin or make the vault insolvent.
- The circuit checks the account's position and the market's total exposure
  limits. The program checks the callback, versions, vault, and public market
  state before accepting the result.

A user view is a separate authorized encrypted computation or a current
sealed output. An ordinary public RPC call returns ciphertext and public
metadata, not a plaintext private position. Apps may cache a user-approved
view, but the SDK marks its state version and age. It must not present an old
health result as current.

### Add or remove margin

Adding margin moves free balance into that market's locked balance. The
wallet authorizes the amount. After the callback, the position has a larger
buffer. It does not change notional.

Removing margin requires a private health check using a fresh oracle and
current funding. The result may approve less than requested only if the
trader explicitly allowed that bound. Otherwise it rejects. A withdrawal
from the Depth vault is a separate final token payout after margin becomes
free.

### Reduce, close, or reverse

A reduce or close request is an opposite trade. Any eligible maker can fill
it; the original maker need not be the counterparty. Depth is a pooled
clearing book. The new maker takes the opposite exposure at the new
execution price; it does not simply pay the trader's historical profit.
The trader's closed portion realizes PnL, and the market-wide ledger
must account for the matching unrealized loss or gain on remaining
positions. Aggregate signed exposure stays zero. The circuit must
prevent a realized profit from becoming an unfunded withdrawal claim
when a losing account is insolvent. The fill releases eligible margin
only after risk, fees, and the market loss rules are applied. A
reverse first closes the old side and opens the residual new side
under the signed price and margin limits.

The SDK shows whether the close was filled. With no eligible quote, the
request remains unfilled and the existing exposure remains open. Depth must
admit a market only with a funded, published backstop process for periods
when ordinary makers do not quote. It must not promise an instant exit from
an empty book. Emergency settlement is a distinct path below.

## Funding and prices

The market configuration pins the funding rule. A public cumulative index
records each completed funding interval. A verified oracle update advances the
index once when the next interval is due. If two intervals elapse without an
advance, the market pauses, skips those intervals, and resumes a fresh funding
schedule from its latest verified oracle update. Missed intervals never produce
retroactive charges. The circuit applies the difference between the current
index and each account's encrypted checkpoint. Long payments equal short
receipts after any published rounding rule. A funding update cannot draw new
tokens from outside the vault or change the market's accepted formula without a
versioned transition.

The oracle marks equity and drives liquidation. It does not automatically
become the execution price. Entry and normal close prices come from maker
quotes. The program verifies the exact oracle feed ID, owning program,
publish time, exponent, positive price, and confidence threshold. It rejects
a stale or missing update. The match circuit also enforces a maximum
deviation of the chosen quote from the reference price.

Orders and liquidations are asynchronous. A price that was fresh when the
operation queued may be unsafe at its callback. The callback either uses a
market-approved delayed price rule tied to the order time or rejects and
requeues if the reference has moved outside the allowed window. The choice
is published per market. No relayer can substitute a convenient older
price. A halted or unreliable feed changes the market to reduce-only or
paused under its published policy.

## Liquidation

A keeper or scheduled worker submits a position ID and the canonical price
update. It does not submit a claimed position value or liquidation result.
The program checks the market, oracle, position version, and one-check-per-
update rule, then queues an Arcium risk computation. The position is locked
against conflicting changes while the check is pending.

The circuit applies funding and calculates equity at the approved mark. If
equity is above maintenance margin, it returns a non-liquidation result.
If it is below, it returns an authenticated liquidation plan. The exposure,
margin use, and updated position remain encrypted. Only amounts that must
move through a public token transfer, such as a keeper reward, are public.
A valid callback applies the plan once. The public learns that the
position was liquidated and may infer something about its risk from the
market price. Depth must not claim that a
liquidation event reveals nothing.

The plan marks the distressed position at the market's published
liquidation price. It debits its loss and transfers that account's exposure
to a pre-funded backstop maker. The backstop takes the same side and posts
the required margin, so aggregate long and short exposure stays balanced.
The original account's collateral pays its loss and liquidation cost.
Any residual deficit is charged to the insurance fund. The fund can accept residual exposure only within its own published
capacity and margin limits. If neither backstop nor fund can absorb the
exposure, the market follows its published auto-deleveraging and payout
haircut rule. Opposing profitable accounts can then be reduced under a
deterministic private ranking. This can close a user early. The SDK must
show that risk plainly.

The liquidation circuit must keep total long and short exposure balanced.
It must also reconcile actual vault assets with all private claims after
losses, insurance use, and fees. Neither an insolvent account nor an
unavailable maker may be treated as if it paid in full. A market without a
proved backstop, insurance limits, and final loss rule is not ready to admit
real collateral.

## Failure, pause, and recovery

Depth tracks an operation as prepared, queued, finalized, rejected, expired,
or failed. Each operation has one nonce, account and market versions,
ciphertext hash, quote snapshot, oracle rule, deadline, and Arcium
computation ID. The indexer is a convenience view. The program state is
authoritative.

If the wallet rejects signing, no operation exists. If a transaction fails
before queueing, funds remain where they were. If queueing succeeds but the
compute fails or expires, the pending lock is released through an explicit
reconciliation instruction after the network outcome is verified. The
original ciphertext is never replayed as a new order. If a callback
transaction fails, the operation stays pending until it is retried or
reconciled; a watcher must not call it filled.

If the Arcium cluster is unavailable, Depth pauses new risk and unsafe
withdrawals. Arcium documents migration of an MXE to another cluster
through Recovery Peers. Depth must rehearse this with its real encrypted
state. Migration is the first recovery path, not a guarantee that every
outage has a quick resolution.

A permanent compute failure needs an exit path that does not depend on the
unavailable key. This is harder than revealing one trader's latest
position. Depth uses a pooled book: a correct payout also depends on
other accounts' losses, the market funding history, insurance, and the
published loss waterfall. A single account's sealed witness cannot
prove that the whole vault remains solvent.

The market pins five distinct recovery signers and a recovery public key.
Each market account and clearing update stores an encrypted recovery copy
and a hash commitment; each matched trade stores a separate encrypted fee
receipt and commitment. Three committee signatures can start winddown after
pending orders and escrow have resolved, using a fresh verified oracle mark.
Anyone can then reveal the committed account and fee states. The program
checks every commitment, account count, net exposure, open interest, fee
total, and vault backing before finalizing a market-wide payout pool.

Positive equity includes funding at the fixed winddown mark. The pool uses
account collateral and market insurance, and insufficient funds produce a
pro rata haircut. Owners claim their payouts once; app and Depth fees are
paid separately before the remaining dust can be swept. Emergency reveals
the positions and fee amounts needed for settlement. Committee members can
collude to decrypt early, so key shares and signing operations require
independent custody. The local integration test exercises this path, but
key-share recovery, committee availability, cost at market scale, and an
independent security review remain launch gates. It does not promise a
unilateral withdrawal or guaranteed recovery from every failure.

A normal pause does not grant administrators custody. It stops new quotes
and exposure and preserves deposits, safe exits, recovery, and read access
where the required computation still works. Oracle failure, cluster
failure, collateral deficit, and malicious callback attempts have
separate public incident states. A keeper can report them, but only
verified program checks change custody.

## Fees and losses

The first SOL/USDC market charges 5 bps of filled notional: 3 bps to Depth,
1 bps to market insurance, and a 1 bps rebate to the maker whose quote
filled. The app can configure an additional 0–2 bps, with 1 bps as the
suggested setting. A direct route through a registered zero-fee app pays
5 bps; a 1 bps app pays 6 bps in total. The trader's encrypted maximum fee
covers the combined charge. The total charge rounds up to the smallest
USDC unit; insurance, app, and maker amounts round down, with the
remainder going to Depth.

The app rate and version are fixed when the trader signs each order.
Fees accrue only on a filled trade. The maker rebate is credited to the
maker's private market balance; insurance, Depth fees, and app fees remain
in encrypted clearing until a private claim credits the recorded recipient
balances. One claim debits clearing and credits both fee recipients
atomically, so its public record does not reveal the fee amounts.
Recipient withdrawals use their own balance accounts. Solana transaction
and Arcium computation costs are separate from the trade fee and are paid
by the transaction payer; the product must display them before submission.
Rejected orders incur no trade fee.

The loss order is: distressed account margin, then the market insurance
allocation, then its published auto-deleveraging or payout haircut rule.
A profitable position is a claim on actual vault assets, not an
unconditional promise independent of counterparty loss. Maker collateral
is subject to the same rule. Depth reports any haircut or residual loss
rather than hiding it in a balance update.

## SDK and API contract

These names and shapes are a proposed Depth interface. No package or route in
this section exists yet. The protocol's account, operation, and market states
are the source of truth. The SDK builds valid transactions and decrypts
authorized views. The server indexes public facts and helps clients find
them. An app ID only attributes a trade; it does not authorize it.

### Common client rules

The trader SDK and maker SDK load a signed, versioned deployment manifest.
It pins the Solana network, Depth program, MXE, cluster, computation
definitions, accepted settlement mints, and market configuration hashes.
A client rejects a manifest that does not match the onchain registry. It
does not let an app replace the program or vault address inside an order.
Both SDKs accept a wallet signer and an RPC connection. A server URL is
optional for faster public discovery, never a source of balance or fill
authority.

Every amount is a bigint in the market's published integer unit. A quote's
size tier and max capacity are notional units; reserved margin is computed
from the market risk rule. Prices,
rates, and timestamps have named units in generated types. The SDK does
not silently round a decimal amount or accept a JavaScript floating-point
number as collateral. Market and account reads include a state version,
as-of slot, and freshness status. A cached read can guide a form but
cannot approve an order, withdrawal, or margin change.

A request is signed by the wallet that owns the account. The trader
signs trade, margin, deposit, withdrawal, and private-view requests. The
maker wallet signs deposits, margin changes, withdrawals, and operator
grants. Its registered quote operator may sign only quote publication,
replacement, and cancellation within its market, capacity, and expiry
limits. A separate owner-granted view scope permits reading that
maker's own sealed fills and positions. The Solana program checks
both scopes. An operator cannot sign a trade or release collateral.
Revocation blocks new operator requests. A view queued before revocation may
finish, while a quote still needs an active grant before reserving maker capital.
The maker SDK never receives external hedge-venue credentials from Depth.

For an encrypted trade, the wallet authorization binds the ciphertext
hash, account, market, requested operation kind, quote snapshot, oracle
rule, app and fee attribution, nonce, expiry, program, and market
revision. The private encrypted input contains direction, exact
notional, margin, price bound, and fee bound. The circuit checks those
bounds against the fill. The SDK displays the plaintext terms it is
about to encrypt and sign. A wallet signature over ciphertext alone
cannot prove that a dishonest frontend displayed the true plaintext;
the hosted interface has to protect its own code and origin. A custom
app controls its form and is responsible for what it shows users.
Publicly hashing the small set of private order fields would allow
guessing, so a plaintext order hash is not used as a privacy shortcut.

A trader chooses a maximum execution price for a long and a minimum
execution price for a short. A reduce or close request states whether
any residual reversal is allowed and caps the new exposure. All trade
requests include a maximum total fee and a deadline. The SDK obtains
the current snapshot and policy revision before signing. If they change
before admission, the request rejects; the SDK asks for a new signature
instead of silently widening a limit.

### Trader and app SDK

~~~ts
import { create_depth } from "@depth/sdk";

const depth = await create_depth({
  app_id,
  wallet,
  connection,
  environment: "mainnet"
});

const market = await depth.catalog.market("BTC-USD");
const account = depth.account();
const balance = await account.summary(); // wallet-authorized private view

const operation = await depth.trade.submit({
  market_id: market.id,
  direction: "long",
  amount: {
    margin: 700_000_000n,
    notional: 1_050_000_000n
  },
  worst_price: 75_000_000_000n,
  max_fee: 2_000_000n,
  expires_at: expiry
});

save(operation.id);
const snapshot = await operation.wait({ timeout_ms: 30_000 });
if (snapshot.status === "queued") {
  showPending(snapshot.id);
}
~~~

The example is illustrative; BTC-USD is not an admitted Depth market.
The SDK can prepare and show a transaction before submission, but
wallet approval is still required. A failed wallet approval creates no
onchain operation. A signed submission returns an operation handle,
not an execution receipt. The client stores its ID before waiting.
After a reload or RPC change, it calls
`depth.operation(operation_id)` and reads the canonical onchain state.
A timeout returns the latest pending snapshot; it never means a fill.
If the server and chain disagree, the SDK marks the server view stale
and uses the chain.

| Trader resource | Proposed actions |
| --- | --- |
| `depth.catalog` | `markets()`, `market(id)`, `market_policy(id)` |
| `depth.account()` | `summary()`, `deposit(amount)`, `withdraw(amount, destination)`, `positions()`, `pending()` |
| `depth.trade` | `submit(order)`, `reduce(order)`, `close(order)`, `reverse(order)` |
| `depth.position(id)` | `summary()`, `add_margin(amount)`, `remove_margin(amount)` |
| `depth.operation(id)` | `status()`, `wait({ timeout_ms })`, `subscribe(listener)`, `private_result()` |

`trade.submit` increases an existing same-side net position if one
exists. `reduce` cannot open exposure on the opposite side;
`close` targets the entire current position version; `reverse`
requires an explicit new-side limit and margin. Each is a distinct
signed operation so a stale interface cannot accidentally reverse a
position. `position.summary()` and account private reads require an
owner-authorized sealed view with a fresh session key. A displayed
health value always includes its oracle update and state version.

`deposit` is a token transfer plus an accepted ledger credit.
`withdraw` pays only the wallet-authorized recorded destination after
the private free-balance check. The SDK exposes transaction fees and
Arcium computation costs before approval. It never calls a deposit
available merely because a transfer signature exists.

### Maker SDK and hedge adapter boundary

~~~ts
import { create_depth_maker } from "@depth/maker-sdk";

const maker = await create_depth_maker({
  wallet: quote_operator_wallet, // granted quote and own-fill view scopes
  connection,
  environment: "mainnet"
});

const quote = await maker.quote.publish({
  market_id: "BTC-USD",
  tiers: [
    { size: 1_000_000_000n, bid: 74_900_000_000n,
      ask: 75_100_000_000n }
  ],
  max_capacity: 3_000_000_000n,
  expires_at: expiry,
  client_nonce: nonce
});

await quote.wait({ timeout_ms: 30_000 });
const stop = maker.fills.subscribe(onFinalizedFill);
~~~

The maker wallet uses `maker.account.deposit`,
`maker.account.allocate`, `maker.account.summary`, and
`maker.account.withdraw`. It uses `maker.operator.authorize` and
`maker.operator.revoke` to manage quote-bot scopes. A quote bot uses
`maker.quote.publish`, `replace`, `cancel`, `active`, and
`capacity`. `maker.fills.list({ cursor })`,
`maker.fills.get(fill_id)`, and `maker.fills.subscribe(listener)`
return authenticated fill IDs and sealed details only to the maker
wallet or a registered, scoped view key. `maker.position` exposes the same margin, reduce, and close actions
as a trader position, but those require the maker wallet, not the
quote operator. Read methods paginate where records can grow.

Publication success means the activation callback reserved capital and
marked the quote active. A submitted or queued quote is not executable.
`replace` specifies the prior quote version; it cannot alter a quote
already pinned by an admitted order. `cancel` completes only after
its callback stops future selection. The SDK reports remaining
capacity and attached pending operations separately.

The fill stream may duplicate, reorder, or miss notifications. The
maker bot persists the last finalized fill ID, fetches missed fills
after restart, and reconciles its current Depth position before
sending hedges. It treats each fill ID as an idempotency key in its own
hedge ledger. An adapter for an external venue is maker-owned code.
Depth's SDK can export the confirmed fill and current exposure, but
has no `hedge()` call that pretends an external trade is part of a
Depth transaction. The bot must handle partial hedge fills, venue
outage, stale quotes, basis, and its own hedge collateral.

### Operation and private-result model

Each operation has a stable ID, kind, owner, market where relevant,
client nonce, onchain state version, creation and update slots,
submission signature when present, computation ID when queued, and
one canonical status. The statuses are `prepared` (local draft
only), `queued`, `finalized`, `rejected`, `expired`, and
`failed`. A finalized trade can have a `filled` outcome; a
finalized quote activation has an `active` outcome. These outcomes
are not interchangeable with submission status. A rejected or failed
operation has an error code and no fill. The onchain record, not an
HTTP response or event alone, determines the terminal state. The
public operation snapshot has this shape:

~~~ts
type OperationSnapshot = {
  id: string;
  kind: "deposit" | "withdraw" | "quote" | "trade" |
        "margin" | "view" | "risk";
  owner: string;
  market_id?: string;
  status: "prepared" | "queued" | "finalized" |
          "rejected" | "expired" | "failed";
  outcome?: "filled" | "active" | "cancelled" | "no_change";
  state_version?: bigint;
  slot?: bigint;
  tx_signature?: string;
  error?: { code: string; stage: string; retryable: boolean };
};
~~~

A receipt adds fields only after an authorized private view. The public
snapshot never includes trade direction, exact size, quote price, or
private account balance.

`wait()` watches the operation, handles RPC reconnects, and resolves
with a typed snapshot on a terminal state or caller timeout. The
snapshot always states whether execution actually happened.
`subscribe()` returns an unsubscribe function and may re-deliver a
snapshot after reconnection. Consumers deduplicate by operation ID and
state version. Cancelling the local wait or closing a tab does not
cancel a queued onchain operation. Retrying a failed order requires
reconciliation, a new nonce, and a new wallet approval.

Arcium supports sealing a result to a client's temporary X25519 key,
but its example client keeps the corresponding private key in memory.
Depth cannot rely on such a notice for recovery after a reload.
The canonical path retains the private fill record and current position
in MXE-encrypted state. An owner-signed view computation re-seals
authorized fields to a fresh session public key. Direct sealing within
the original match callback is optional and needs a separate proof
that it can select the winning maker's key and fit the callback.
A maker uses the same pattern for its fill and position views.
Public operation status remains recoverable without a view key.
Historical private receipts need a bounded MXE-encrypted receipt
record keyed by fill ID, with its account allocated before callback,
a published retention period, and rent and cleanup rules. That layout
must fit the callback size and actual onchain storage budget. Receipts
are recoverable only for the published retention period and only once
the re-seal path is implemented and tested. An app or indexer cannot
request a view for someone else's wallet.

### Hosted interface and HTTP service

An app can open the Depth-hosted interface to collect the trade inputs:

~~~ts
depth.open({ market_id: "BTC-USD" });
~~~

It runs on a Depth-controlled origin isolated from the app. The parent
may pass a market ID, public app ID, and non-sensitive display context.
The child checks the exact parent origin against its registered app
record. The parent checks the child's exact origin. Their versioned
message protocol has `ready`, `closed`, `operation_submitted`,
and `operation_status` events. Those carry an operation ID and
public status only. They do not carry direction, size, margin,
decrypted position, or wallet signing payload. If the app supplies a
prepared direction or amount, it already knows that information; the
interface labels that mode accordingly. A custom SDK interface also
knows every value collected by its own code.

The optional server has versioned public reads:

| Route | Content |
| --- | --- |
| `GET /v1/markets` and `GET /v1/markets/{id}` | Published market configuration, versions, status, and as-of slot |
| `GET /v1/quotes/{id}` | Public quote envelope, activation state, capacity bound, and expiry; never bid or ask plaintext |
| `GET /v1/operations/{id}` | Public operation status, signatures, slots, and safe error codes |
| `GET /v1/apps/{id}` | Verified public app identity and attribution terms |

The server may also provide cursor-paginated public event reads and
signed app webhooks for status changes. A webhook includes event ID,
operation ID, status, state version, and signature. An app verifies
the signature, deduplicates the event ID, and confirms the onchain
state before calling a trade filled. App registration and webhook
configuration use an owner-signed administrative route. HTTP never
accepts a plaintext trader order, maker quote price, private-view
secret, withdrawal authority, or hedge-venue credentials. Clients
submit state-changing actions as signed Solana transactions. Public
API availability is not needed to exercise the program.

SDK errors have a stable `code`, `stage`, `operation_id` if one
exists, `retryable` flag, and `next_action`. Codes distinguish a
wallet rejection, stale quote or market version, price outside limit,
insufficient collateral, oracle unavailable, market pause, queue
expiry, callback failure, private-view authorization failure, and
RPC/indexer outage. A retriable transport error does not authorize
blind resubmission. The client first resolves the original nonce and
operation ID onchain. Protocol and API versions are published in the
deployment manifest; incompatible clients reject instead of
guessing how to decode encrypted state.

The trader interface shows available balance, locked margin, current
oracle reference, funding rule, estimated liquidation level if a
fresh private view supports it, price and fee limits, and pending
operations. It labels an indicative price as indicative. The maker
interface shows quote capacity, active quote versions, finalized fills,
Depth exposure, locked margin, and risk. Both interfaces distinguish
a live onchain read from a stale indexed or cached read.

## Project organization

The current Depth folder contains this specification and early contract code.
This is the target organization for the Solana project. Each package has a clear
owner for generated bindings,
public schemas, and SDK code. `contracts/` is the Arcium and Anchor project
root; its required internal layout remains together.

~~~text
depth.supply/
  depth.md
  contracts/                Arcium and Anchor project root
    programs/depth/         Solana custody, registry, oracle, and callback code
    encrypted-ixs/          Arcis quote, match, risk, funding, and view circuits
    tests/                  Program and circuit integration tests
  packages/bindings/        generated IDL, addresses, and versioned deployments
  packages/schema/          shared public request and result shapes
  packages/trader/          trader and app-facing SDK
  packages/maker/           maker quote and risk client
  client/                   Depth-hosted trade and maker interfaces
  server/                   app registry, public indexer, operation tracking
  scripts/                  build, deployment, and verification commands
~~~

The Arcium CLI owns `Arcium.toml` and `encrypted-ixs` within
`contracts/`. The Anchor/Arcium program owns the canonical market
and ledger state. Generated bindings belong in their package. SDK packages
never depend on the server. Feature folders are added when their code
exists; server features use controller, index, model, route, schema, and
service files only where those roles actually exist. Workers and indexers
get their own feature files. The server does not become a second risk engine.

## Decisions and proofs still needed

The flow is specified from app entry through maker exit. The following
choices are deliberately open. They need numbers, code, and tests before
Depth can claim a production-ready market or freeze its SDK types:

1. **First market economics:** Calibrate the funding formula, margin levels,
   quote tiers, capacity caps, and liquidation price rule against observed
   liquidity and Arcium costs. These are versioned market data, not settings
   an app may improvise. The fee schedule is fixed in the Fees and losses
   section.
2. **Maker service quality:** Set the minimum quote hold period,
   required backstop depth, maker concentration cap, and response to
   empty or one-sided liquidity. Measure whether the side-hidden
   precommitment produces competitive prices after makers include
   fill-to-hedge risk.
3. **Loss and exit design:** Fund the insurance allocation, calibrate the
   implemented pro rata haircut, and audit and rehearse committee recovery
   with every account and fee receipt present. A normal Solana vault does
   not solve private-state recovery on its own.
4. **Arcium implementation fit:** Compile bounded quote, ledger, view,
   and liquidation circuits with one pinned toolchain. Measure
   callback bytes, account sizes, compute cost, queue delay, and
   contention under the largest allowed market state.
5. **Private receipt storage:** Choose fixed receipt size, retention,
   payer for account rent, and cleanup policy. Prove owner-only
   re-sealing after the original browser session has ended.
6. **Final wire format:** Generate the Solana IDL, Arcis input packers,
   event schema, and deployment manifest from the implementation.
   Freeze SDK request and result types only after those artifacts
   agree. The examples above are design contracts, not published APIs.

These are real feasibility and economic gates. A working interface mock
or a successful encrypted matching demo would not close them.

## What the tools support, and what Depth must prove

| Area | Verified tool capability | Depth-owned work or open gate |
| --- | --- | --- |
| Encrypted input | Arcium's TypeScript client uses X25519 and Rescue to encrypt inputs before submission. | The hosted and headless clients must avoid logging, leaking, or reusing keys and nonces. |
| Encrypted computation | Arcis supports fixed-size encrypted structs, comparisons, arithmetic, encrypted outputs, and recipient sealing. | Depth must write and test the matching, balance, funding, liquidation, and conservation circuits. |
| Persistent private state | Arcium shows MXE-encrypted state returned by a computation and stored by a Solana callback. The network does not mutate app state itself. | Depth must design bounded state layouts, version checks, and complete update coverage. |
| Solana authorization | The Depth program can custody tokens and enforce signatures, PDA ownership, callback authentication, and vault transfers. | It cannot inspect hidden numbers without trusting a valid Arcium result. A public independent proof of every private ledger update is not assumed. |
| Oracle | Pyth provides verified Solana price updates with feed, freshness, and confidence data. | Depth must admit actual feeds and implement delayed-price, stale-price, and market-hours policy. |
| Confidential transfers | Token-2022 Confidential Balances hide supported transfer amounts and balances. | It does not hide account addresses. Compatibility with Depth's custody and payout flow must be tested before use. |
| Liveness | Arcium documents queue expiry, failure reporting, and cluster migration. | Depth must reconcile locks, prove retry safety, and validate emergency exit. |

Arcis circuits have fixed shapes. Dynamic collections such as Vec and
HashMap are not supported inside them. Callback transactions share
Solana's 1,232-byte serialized size limit, and callback accounts must
exist before execution. Depth must use bounded quote snapshots and
compact state outputs. It must build and test the largest supported
snapshot and ledger update. A diagram or API mock is not evidence that
a full position lifecycle fits those limits.

Arcium's example projects currently target a different release than
its latest toolchain. The pinned Arcium, Anchor, Solana, token, and
oracle libraries must compile and pass together. The design does not
assume a specific package combination works without that test.

## Acceptance checks before any real market

1. A real wallet deposit reaches the vault and is credited exactly once.
   Its pending amount cannot be traded. Duplicate submissions, failed
   transfers, failed credits, refunds, and late callbacks cannot mint a
   private claim or both credit and refund the same deposit.
2. An activated quote reserves maker capacity. Concurrent orders,
   cancellation, expiry, maker liquidation, and maker withdrawal cannot
   reuse it. Self-matches and uncollateralized fills are rejected.
3. A match compares every eligible quote in its committed snapshot,
   picks the best valid one, respects the trader's limit, and either
   updates both sides or neither side.
4. Position accounting, funding, fees, withdrawals, and insurance
   conserve the vault's assets under integer rounding and extreme
   prices. Tests include a close by a different maker, realized profit
   against an old maker's unrealized loss, maker default, and an
   insolvent losing position.
5. Oracle tests cover stale, wrong-feed, wrong-owner, delayed, halted,
   wide-confidence, and adversarially selected valid updates.
6. A position can be increased, reduced by another maker, fully
   closed, topped up, and liquidated without exposing its protected
   fields in ordinary public account data or logs.
7. The real Arcium callback is authenticated, version-bound,
   replay-safe, and atomic with every Solana state and token update.
   Quote and position outputs fit the measured callback limit.
8. Queue expiry, failed execution, callback failure, tab closure,
   relayer outage, and cluster migration leave funds and operations
   in a recoverable, accurately reported state.
9. An emergency exit can be triggered by an eligible party from a
   verifiable latest market-wide state without administrator custody
   or access to the failed MXE. It applies funding, losses, insurance,
   and payouts once across all accounts. Its disclosure and haircut
   rules are tested. A single trader receipt is insufficient. Without
   this proof, the market must not claim independent recovery or open
   to real collateral.
10. The hosted interface's origin separation is tested. A custom
    app's access to its own plaintext inputs is disclosed. Public
    deposits, maker identity, timing, and liquidation events are
    measured for inference leakage before privacy claims are made.
11. A maker bot can activate, refresh, cancel, and recover quotes after
    restart. Operator rights are limited and revocable. A queued quote
    never appears active. Pending orders remain binding after
    replacement, cancellation, or operator revocation.
12. A confirmed fill is available through a maker-authorized private
    view, replayed safely after reconnect, and deduplicated before hedging. Tests
    cover external hedge partial fill, rejection, outage, delayed
    confirmation, and maker bot crash. None can reverse a finalized
    trader fill or count external hedge assets as Depth collateral.
13. Trader and maker SDK operations survive reload and RPC or indexer
    disagreement. Tests cover wallet rejection, timeout, duplicate
    events, stale quote versions, and nonce reconciliation before a
    retry. A fresh owner-signed re-seal recovers a private current
    view without retaining an ephemeral session secret.
14. Hosted messages enforce exact origins and send only public status.
    HTTP responses and signed webhooks are idempotent hints, while
    clients confirm finality from the program. Generated SDK types
    match the deployed IDL and encrypted instruction layouts.

## Primary sources

- Arcium: [Hello World](https://docs.arcium.com/developers/hello-world),
  [computation lifecycle](https://docs.arcium.com/developers/computation-lifecycle),
  [encrypted input and output](https://docs.arcium.com/developers/arcis/input-output),
  [recipient sealing](https://docs.arcium.com/developers/encryption/sealing),
  [Solana callbacks](https://docs.arcium.com/developers/program),
  [callback accounts](https://docs.arcium.com/developers/program/callback-accs),
  [current limitations](https://docs.arcium.com/developers/limitations),
  [queue failures](https://docs.arcium.com/computations/queue-ordering-and-fault-handling),
  [MPC trust model](https://docs.arcium.com/multi-party-execution-environments-mxes/mpc-protocols),
  [TypeScript client flow](https://ts.arcium.com/docs),
  and [cluster migration](https://docs.arcium.com/clusters/cluster-migration).
- SYMMIO: [solver hedging strategies](https://docs.symm.io/solver-documentation/core-concepts/hedging-strategies),
  [solver setup](https://docs.symm.io/liquidity-provider-documentation/solver-setup-high-level-overview),
  and [opening and closing positions](https://docs.symm.io/solver-documentation/building-a-solver-on-symmio/4.-opening-closing-a-position-on-chain).
  These describe SYMMIO's flow, not Depth's implemented behavior.
- Velocity: [market-maker integration](https://docs.velocity.exchange/developers/market-makers)
  and [JIT auctions](https://docs.velocity.exchange/developers/market-makers/jit-auctions)
  for Solana maker operating patterns.
- Solana: [financial privacy boundaries](https://solana.com/docs/finance/privacy)
  and [Confidential Balances](https://solana.com/docs/tokens/extensions/confidential-transfer).
- Circle: [native Solana USDC mint](https://help.circle.com/support/en/usdc-supported-blockchains-minting-redemption-faqs?id=kb_article_view&sysparm_article=KB0010590).
- Pyth: [SOL/USD feed ID in the receiver SDK](https://github.com/pyth-network/pyth-crosschain/blob/main/target_chains/solana/pyth_solana_receiver_sdk/src/price_update.rs),
  [Solana receiver address](https://docs.pyth.network/price-feeds/core/contract-addresses/solana),
  [Solana price integration](https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/solana),
  and [derivatives oracle guidance](https://docs.pyth.network/price-feeds/core/best-practices).
