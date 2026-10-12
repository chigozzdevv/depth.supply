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

| Term           | Meaning                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Trader         | Opens, manages, and closes a market position.                                                                                             |
| Maker          | Posts collateral and publishes firm prices on both sides of a market. A maker can serve every integrating app.                            |
| App            | Presents Depth markets to users. It may use the hosted Depth trade interface or build its own interface with the SDK.                     |
| Depth account  | One wallet's free balance, locked margin, positions, and pending operations inside Depth.                                                 |
| Market         | A cash-settled perpetual contract with one settlement mint, oracle feed, and risk policy.                                                 |
| Quote          | A maker's signed, time-limited bid and ask for stated size tiers and capacity.                                                            |
| Position       | The account's net long or short exposure in one market. A maker has positions under the same rules as a trader.                           |
| Clearing vault | A Solana token account controlled by the Depth program. It holds deposited settlement tokens.                                             |
| Private ledger | Encrypted balances, positions, quote prices, and risk data that Depth updates through Arcium computations.                                |
| Operation      | One requested action with durable progress and canonical receipts for its submitted steps; preparation alone is not an onchain operation. |
| Keeper         | Anyone who pays to submit an eligible oracle, funding, or liquidation operation. A keeper cannot choose its own risk result.              |
| Insurance fund | Separately accounted collateral that absorbs losses after the distressed account's margin.                                                |

All token amounts are integer base units. Price precision, rounding, time units,
quote tiers, and risk parameters belong to a versioned market configuration.
The first market is a SOL perpetual margined and settled in native Solana
USDC. Its position tracks SOL/USD; no SOL is delivered. Example amounts
elsewhere in this document are illustrative.

### First market identity

| Field                     | Value                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Underlying and quote      | SOL/USD perpetual                                                                                  |
| Collateral and settlement | Native USDC on Solana mainnet, mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`                 |
| Risk oracle               | Pyth Core stable SOL/USD feed `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| Pyth receiver             | `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` on Solana mainnet                                    |
| Market hours              | Continuous while the oracle and clearing system are available                                      |

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

| Data                                                                                                     | Where it lives during normal operation                        | Who can read it                                                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Exact maker bid and ask on submission                                                                    | Client-encrypted input; then MXE-encrypted active quote state | Maker and MXE computation                                               |
| Trader direction, size, margin, and bounds on submission                                                 | Client-encrypted input                                        | Trader and MXE computation; also a custom app that collected the inputs |
| Open balances, positions, and health                                                                     | MXE-encrypted Solana state                                    | MXE computation; owner through an authorized re-sealed view             |
| Market, account addresses, quote tiers, capacity envelope, expiry, operation status, and token transfers | Public Solana accounts and transactions                       | Anyone                                                                  |
| Final fill terms                                                                                         | MXE-encrypted receipt and owner-authorized views              | Trader and winning maker for their own fill                             |

The cryptographic types behind this boundary are Arcium's
client-and-MXE encrypted input (Enc<Shared>) and MXE-only encrypted
state (Enc<Mxe>). Depth must implement the conversion, account
authorization, storage, and re-sealing rules. Arcium supplies the
primitives, not this trading lifecycle.

## Privacy promise and its limits

Depth's intended protection is about trading data, not wallet anonymity.

| Information                                                               | Public observer                                                       | Losing maker                       | Winning maker                                                  | Trader                               |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- | ------------------------------------ |
| Market, transaction timing, account addresses, and a pending operation    | Visible or inferable                                                  | Visible or inferable               | Visible or inferable                                           | Visible                              |
| Trader direction, exact notional, limit, and entry price before selection | Encrypted                                                             | Encrypted                          | Encrypted until its fill                                       | Known                                |
| Maker bid and ask prices                                                  | Encrypted                                                             | Own quote only                     | Own quote and its fill                                         | Only the executed price after a fill |
| Open position direction, size, entry, margin, funding, and health         | Stored encrypted; metadata may leak clues                             | No direct view of another position | Knows its own exposure and the paired fill needed to manage it | Authorized view                      |
| Deposits, withdrawals, program accounts, and token mint                   | Generally visible with normal token transfers                         | Visible                            | Visible                                                        | Visible                              |
| Margin-transfer amounts and direction between free and market balances    | Public in transfer receipts; the resulting position remains encrypted | Visible                            | Visible                                                        | Visible                              |
| A public emergency exit                                                   | Reveals the fields needed for onchain settlement                      | Revealed fields become public      | Revealed fields become public                                  | Revealed fields become public        |

A winning maker must learn its own fill. It can hedge, share, or act on that
information. Depth cannot promise to stop this. A custom app that collects the
trade details in its own page already knows them. The hosted Depth interface
can keep the raw input away from the integrating app if it uses an isolated
Depth-controlled origin and sends the app only non-sensitive status.

External hedge venues may publish an account's orders, fills, positions, sizes,
prices, and timing. Observers who link that account to a Depth maker can infer
individual trades from closely timed hedges, especially with sparse flow.
Netting reduces direct matching; a known account following a full hedge policy
can still reveal aggregate maker inventory. The bot uses opaque random external
order IDs and keeps their journal private. It never copies a Depth receipt ID,
trader address, private quote price, or trader limit into an external order.
Quote encryption does not hide prices that an observer can independently
calculate from a known oracle-and-spread policy. Inventory and execution-aware
pricing improves the maker's strategy without promising resistance to inference.

Normal Solana token transfers expose addresses and amounts. Margin-transfer
receipts also expose the amount moved into or out of a market. A movement
close to an order can reveal clues about its size even though the position
record is encrypted. A visible maker account selected for
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
The first deployment reads Pyth's sponsored SOL/USD push feed on shard 0 at
`7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE`. The keeper verifies
the receiver account and advances the market only on a newer update. A
deployment using another account must supply it explicitly and maintain that
account's updates; stale or unavailable prices block risk actions.
The devnet demo uses `PYTH_ORACLE_MODE=sponsored` and does not call Hermes.
Its oracle age limit is 600 seconds to tolerate sponsored devnet update delays;
new submissions leave time for their computations before that cutoff. Prices
older than the configured limit still block trading and risk actions. The
`devnet` program feature permits this demo limit; standard builds cap it at
300 seconds. The protocol authority can change only the age limit while the
market is paused with no pending order, advancing the revision and invalidating
old quote snapshots. A longer age limit accepts older marks and increases
pricing and liquidation delay risk; it does not improve source freshness.
`PYTH_ORACLE_MODE=hermes` adds Depth's price publisher to the service supervisor
and requires `PYTH_API_KEY`; the keeper still reads the verified onchain account in both modes.
The publisher maintains the approved feed without changing the oracle account.
The keeper retries after snapshot computations finish; traders and makers leave
freshness time for admission and computation rather than submitting near expiry.
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
the trader's price. Price improvement needs empirical validation. Here,
encrypted two-sided quotes keep the trader's side from losing
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

The maker worker renews an active quote without another Arcium computation when
its encrypted terms are unchanged and its original oracle reference still fits
admission bounds. Renewal extends expiry within the market lifetime and operator
grant; it never replenishes consumed capacity or changes prices.

Repricing privately validates a successor while retaining the prior quote. An
Arcium rotation then credits the prior quote's actual remaining private margin
and reserves the successor margin in one account update. Its callback swaps the
same book slot atomically, so full books and tight collateral do not require a
release-before-reserve gap. A rejected rotation retains the prior quote and
reservation. Only a cancelled or rejected successor can have its replacement
link reset for another attempt. Checkpoints retain both quotes and their terms
until the handover completes. A shutdown or unresolved hedge stops both quotes.

Pricing tiers extend through the first tier covering the capacity envelope;
capacity between tier boundaries remains usable, while the encrypted remaining
capacity still limits actual fills. Hedged quotes fit the remaining aggregate
unhedged budget, with ten percent headroom and the market price-deviation buffer.
The worker compares rounded execution costs when repricing, so changes too small
to change its prices do not trigger a new computation. Public readiness and trade
admission read market and quote accounts from a consistent bank snapshot.
An existing bounded quote can remain during inventory finality or confirmed hedge
reconciliation for at most the configured exposure time limit. New hedge orders
still require finalized private inventory. A full-hedge worker can restore a view
while continuing an unchanged, previously balanced ledger and external inventory;
unobserved changes must be identified as its own fill or quoting stops.
Unresolved external receipts, stale
external prices, or an exhausted risk budget stop quoting. Inventory reads poll
without blocking the quote loop, reuse pending requests, and follow the canonical
account version; reservation-only changes do not force another inventory read.
Quote durations use the confirmed Solana Clock sysvar. Restart recovery checks
the predecessor's replacement nonce, the successor's operator and capacity,
and the account version before adopting an already completed handover.
The devnet demo allows 90 seconds for inventory finality and hedge reconciliation
within a 100 USDC aggregate unhedged limit. Hedge submissions still begin after
the five-second batching window once finalized inventory is available. Exchange
fill timestamps, rather than local HTTP completion times, determine whether an
external account snapshot includes a confirmed hedge. RPC scheduling prioritizes
submissions and confirmations over scans, bounds concurrency, and drops requests
when their last waiting client disconnects.

Preparation validates prices inside a narrower oracle band, reserving up to
25 bps for price movement before admission. Admission rejects larger movement
or a changed market policy, while reservation callbacks retain their exact
snapshot checks. The published execution deviation limit remains unchanged.

Trade encryption uses the final consistent quote-and-oracle snapshot. A verified
oracle update may advance while the trader approves the wallet transaction,
provided the original reference is still within the market's age limit and the
policy revision is unchanged. The encrypted execution-price limit, fee cap,
position version, quote accounts, and absolute expiry remain binding. Admission
records the current verified oracle snapshot, and oracle refreshes are blocked
until the admitted order clears; callbacks retain exact snapshot checks.

Terminal quotes with no attached orders can be closed by their maker owner or
original quote payer. The original payer receives rent through the operator close
instruction, including after grant revocation; this grants no collateral or view
authority. Workers batch eligible closures and preserve unfinished replacement
links. Arcium computation charges and transaction fees are spent costs and are
not refunded by rent recycling.

The owner can renew an active, unexpired backstop for at most 24 hours from the
current time without changing capacity or reserving collateral again. Renewal
requires an idle market and the canonical active offer; an expired offer must
complete the normal release and reservation flow.

### Managed maker automation

An application integrates managed workers through `maker.automation.configure`,
`approve`, `start`, `pause`, `resume`, and `summary`. Configuration returns a
wallet-bound setup for review. The owner approves a dedicated Solana operator,
a bounded grant duration and capacity, explicit private inventory access, and
an operator SOL funding budget. Collateral funding and withdrawals continue
through owner-signed account operations; the automation session grants no
onchain authority on its own.
Operator funding saves the owner's signed SOL transfer before broadcast and
reconciles its signature until finalized or expired. Retries reuse the saved
transaction; an uncertain receipt blocks new funding and configuration changes.

Each maker has separate credentials, configuration, desired state, quote nonces,
fill cursors, and hedge history. The supervisor encrypts its credential registry
with a deployment secret and synchronizes checkpoints before submission. A
single supervisor lease protects the registry; maker and external account leases
prevent duplicate workers. Owner signatures authorize short-lived wallet-bound
sessions, and a history-reading session cannot change automation. Public market
routes expose no private inventory or hedge-account mapping.

Optional Hyperliquid setup requires a separately funded account and owner-approved
agent. Its network follows the Solana deployment. A draft cannot reserve an
external account; the supervisor binds it only after checking the agent and
starting its worker. Confirmed bindings persist across restarts and cannot be
reassigned through a configuration update. Limits cover hedge ratio, order size,
residual exposure, slippage, leverage, freshness, and exposure time.

Pause cancels available quotes and reconciles already submitted hedge receipts.
It does not resubmit unknown hedges, flatten either venue, or erase positions.
An unresolved receipt keeps the worker in a visible pausing state. Resume
restores the existing checkpoint and checks operator grants and external account
readiness again. Hosted automation can read a maker's own inventory only because
that maker explicitly grants private-view access to its operator; this does not
grant access to other makers or traders.

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
Maker and client readiness use the same two-interval deadline; the first
interval becoming due does not by itself cancel liquidity while the next
verified oracle update advances funding.

The oracle marks equity and drives liquidation. It does not automatically
become the execution price. Entry and normal close prices come from maker
quotes. The market records its approved Pyth price-update account onchain.
Oracle refreshes must use that account and verify the exact feed ID, owning
program, publish time, exponent, positive price, and confidence threshold.
The protocol authority may change the account only while the market is draft
or paused, with no pending order and a newer verified update from the replacement.
The program rejects a stale or missing update. The match circuit also enforces
a maximum deviation of the chosen quote from the reference price.

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
haircut rule. The implemented fallback pauses trading and uses committee-authorized
market-wide winddown with a pro rata payout haircut; private ranked
auto-deleveraging is not implemented. The SDK must show emergency settlement
and haircut risk plainly.

The liquidation circuit must keep total long and short exposure balanced.
It must also reconcile actual vault assets with all private claims after
losses, insurance use, and fees. Neither an insolvent account nor an
unavailable maker may be treated as if it paid in full. A market without a
proved backstop, insurance limits, and final loss rule is not ready to admit
real collateral.

## Failure, pause, and recovery

Preparation is local review state. Submitted operations report canonical
queued, finalized, rejected, expired, or failed outcomes only when supported
by the recorded state. Each submitted trade step binds its nonce, account
and market versions, ciphertext, quote snapshot, oracle rule, deadline, and
Arcium computation. An action with several steps retains their separate
receipts and progress. The indexer is a convenience view; the program state
is authoritative.

If the wallet rejects the first signature, no onchain operation exists. If a
transaction fails before queueing, that transaction does not change funds;
earlier finalized steps of the action remain effective. If queueing succeeds
but the compute fails or expires, the pending lock is released through an explicit
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
Each signer and encrypted key share must be controlled by a different
organization. Depth may control one seat; at least four seats must be held
outside Depth, and no custody vendor or shared administrator may control more
than one seat. Each operator publishes its signer and X25519 public keys,
attests receipt of one envelope, and keeps the decryption key separate from
its Solana signing key. Backups remain under that operator's control.
Each market account and clearing update stores an encrypted recovery copy
and a hash commitment; each matched trade stores a separate encrypted fee
receipt and commitment. The committee declares the emergency; the contract does not independently
prove permanent MXE failure. Three committee signatures can start winddown
from an active or paused market after
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

An order matched before a pause may be cancelled immediately so its account
can submit a new reduce or close request. A request submitted during a pause
passes an encrypted reduction check; an increase or reversal is rejected.
Settlement still requires a fresh oracle, an active quote, and sufficient
collateral.

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

This section defines the target public API and its required behavior. Examples
are implementation requirements, not a claim that every method is available in
the current packages. The account, market, and operation records on Solana remain
authoritative. An app ID attributes a trade; it does not authorize it.

### Register an app

App registration comes first. The owner connects a wallet, registers its fee,
and receives the app ID from the confirmed registration. Registration also
prepares the account needed to receive and withdraw app revenue.

```ts
import { create_depth } from "@depthhq/sdk";

const admin = await create_depth({
  environment: "devnet",
  wallet: appOwnerWallet,
});

const registration = await admin.app.register({
  feeBps: 1,
});

const { appId } = await registration.confirm();
```

An existing app owner can retrieve its registration through
`admin.app.summary()`. App IDs are public configuration, not secrets. A client
without an app ID supports app administration and account operations; attributing
a trade requires a valid app ID. An invalid or inactive app never silently falls
back to another app.

### Common client rules

Both SDKs resolve the RPC endpoint, public service URL, and signed deployment
manifest from `environment`. The manifest pins the network, Depth program, MXE,
cluster, computation definitions, settlement mint, and market configuration.
The SDK verifies the manifest signer against the deployed upgrade authority,
then checks its signature, genesis, executable, MXE, computation definitions,
settlement mint, and market configuration. An unavailable or mismatched
deployment produces a typed error.

An RPC connection, service URL, deployment manifest, and persistence adapter are
advanced overrides. The normal integration does not construct a Solana
connection or pass program addresses. Overrides undergo the same validation.
A public service accelerates discovery; it cannot authorize a balance or fill.

The hosted trader and maker interfaces live at `/demo/trade` and `/demo/maker`.
They call the public SDK exports, use Wallet Standard signing, and share the
same account, order, quote, and callback lifecycle as external integrations.
The Next.js server proxies the configured RPC and public Depth API so provider
credentials remain on the server. `rpcUrl` and `serviceUrl` are explicit
deployment overrides; loopback HTTP supports local development while devnet
still requires a verified signed manifest and matching chain genesis.

Public data is available without a wallet through
`create_depth_data({ environment, serviceUrl? })`. It provides `markets()`,
`market(marketId)`, `app(appId)`, paginated `candles(marketId, query)`, and
`subscribe({ marketId, interval, onUpdate, onError })`. Candle intervals are
`1m`, `5m`, `15m`, `1h`, `4h`, and `1d`. Responses identify their source,
fetch time, stale status, and historical cursor. The current reference source
is Hyperliquid SOL/USD; it is labeled separately from the pinned Pyth
settlement price and never represents Depth's confidential executions,
volume, or open interest. The shared market service validates, caches, and
deduplicates provider requests and marks delayed live prices explicitly.

Canonical `account().pending()` and `account().history()` scans are tied to
the wallet and work across browser changes. Unpublished order terms remain in
memory and clear when the wallet changes. Balance and position views can use
the encrypted device cache described below. A submitted
order can be resumed from its canonical nonce. If no order was submitted,
`trade.unpairedAllocations()` locates settled allocations; the collateral
remains in the market and unpublished trade terms must be supplied again.
Maker fill checkpoints contain only receipt cursors, using IndexedDB in
browsers and private atomic files in Node.

`history.execution(nonce)` restores a filled trade's private execution and
closing PnL through fresh wallet-authorized views. It replays prior fills and
margin transfers in canonical transaction order, including older deployed
margin callbacks. Fees and funding use the execution's actual receipt. Private
fills and view secrets stay in memory. Reloading requires fresh authorization;
it does not require a saved browser key. If a preceding liquidation prevents
the exact collateral basis from being recovered, return on collateral is
unavailable rather than estimated.

Open positions show PnL from the authorized position and a fresh oracle mark.
The share action opens the PnL card. Activity shows block times, actual
transaction signatures, public transfer amounts, and authorized execution
details; resuming a pending receipt retains its canonical nonce.

The Node maker SDK exposes `create_maker_bot({ maker, policy, stateDirectory, hedge })`.
Its policy limits capacity, inventory notional, spread, price movement, expiry,
and refresh time. The worker quotes around the pinned oracle, derives capacity
from authorized equity and current exposure, stops on stale prices, missed
funding, or a market incident, and links a successor before retiring its prior
quote. A private atomic checkpoint stores prepared quote terms, their nonce,
replacement links, and finalized fill cursors. It contains no signer key or
decrypted fills. A local process lease prevents simultaneous writers; hosted
deployments use one replica per operator and durable storage. Inventory skew
uses the maker's authorized net exposure. With the optional Hyperliquid adapter,
quote tiers also account for executable order-book depth, the account's actual
taker fee, adverse funding over the configured holding horizon, and a maker
execution-risk buffer. Quotes outside the market's oracle band stop publication
instead of being clamped to an unprofitable price. External hedges never reduce
Depth's collateral or reservation requirements.

The hedge engine batches one maker's aggregate finalized SOL exposure across
apps, targets its configured hedge percentage, and sizes only the difference
from confirmed external inventory. Its policy bounds order notional, remaining
exposure, batching time, slippage, book age, and leverage. Expired batching or
excessive exposure triggers an order; insufficient margin, stale data, or an
unresolved submission stops new quotes. Small amounts below venue precision or
minimum order size remain residual exposure and stop quoting after the waiting
limit. Targets round toward zero to the venue's quantity step; this unavoidable
rounding remainder still counts toward the hard exposure limit. A reversal first
reduces the existing hedge before opening the opposite side. Quote cancellation
cannot undo admitted trades, and network or finality delays can exceed the
configured response window.

Hyperliquid orders use IOC, exact decimal quantities, venue-valid prices, opaque
client IDs, persisted nonces, and signed expiry. The account must be dedicated
to this SOL strategy and use an approved agent signer. The engine reconciles
partial fills and order status before sizing another order. An uncertain retry
uses the same order, nonce, and expiry; an expired unknown order remains blocked
until reconciliation finds a definitive outcome. Account snapshots older than
the last confirmed hedge do not authorize another order.

The bot and hedge-account checkpoints are private files with atomic replacement
and filesystem synchronization. A separate account lease and shared journal
preserve outstanding orders across operator changes. They contain quote and
external order terms, nonces, and public receipt cursors; they contain no signer
or decryption key. All workers using an account must share this durable directory
and run on one host. Multiple hosts require a distributed lease before sharing
an account. Shutdown retires quotes and retains the journal; it does not flatten
either venue's positions.

The maker worker exposes hedge status only after its owner signs a single-use,
expiring Solana access challenge. The SDK exposes `maker.hedges.authorize()` and
`maker.hedges.summary()`. Sessions and browser hedge views remain in memory and
are cleared when the wallet changes. The public API proxies authenticated
requests to the loopback worker without indexing private exposure. Deployment
operators running an authorized maker worker can read that maker's private
views; the integration does not grant access to other makers or traders.

The bot also stops before its operator SOL balance falls below the configured
gas reserve, retaining funds for quote cancellation and computation fees.
Its default reserve is 0.05 SOL, with a minimum policy reserve of 0.01 SOL.
An operator must replenish its own fee balance; the worker cannot draw from
the maker's collateral or treasury.

The browser and Node builds accept the wallet capabilities they actually need.
Client construction does not submit transactions or request signatures.
Mutations and authorized private reads request approval when needed. A private
view can involve an Arcium computation, network fees, and a wallet signature;
a method named `summary()` does not make that work free.

The SDK handles account derivation, required initialization, token accounts,
integer conversions, nonces, policy reads, encryption, quote snapshots, and
continuation steps. It displays the terms and costs before signing. It never
automatically deposits from a wallet, raises a fee cap, widens a price limit,
or increases an operator's authority to make a request succeed.

A wallet authorization binds the encrypted input, owner, market, operation,
quote snapshot, app attribution, fee limits, expiry, program, and policy version.
The circuit verifies the private terms. A custom app can see the plaintext its
own form collects; a signature over ciphertext cannot prove that a dishonest
frontend displayed the right terms.

### Amounts, prices, and durations

Exact amounts are `bigint` values in the published unit. SOL/USDC uses six
decimals for USDC, nine for SOL quantity, and eight for prices. Trade
`notional`, `margin`, `maxFee`, and quote capacity are USDC base units.

Account transfers and position reductions also accept explicit amount selectors:

```ts
type Amount = bigint | "all" | `${number}%`;
```

Percentage strings such as `"10%"` and `"25%"` must be positive and at most
100, with at most four decimal places. Parsing and multiplication use integer
arithmetic, rounding down to the smallest unit. Unsupported precision, zero
results, and invalid amounts fail before signing.

| Operation                                    | Basis for `"all"` and percentage selectors                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `account.withdraw`                           | The current free balance available for withdrawal.                                           |
| `account.allocate` or `position.addMargin`   | The current free balance available for allocation.                                           |
| `account.release` or `position.removeMargin` | The amount removable from that market after current obligations and risk checks.             |
| `trade.reduce`                               | The current absolute SOL position quantity, never the free balance or original entry amount. |

An exact `bigint` passed to `trade.reduce` is SOL base quantity; the other
transfer methods use USDC base units. `trade.close` means the entire current
position. `"all"` never consumes locked or reserved collateral. A prepared
operation records the source version, selector basis, rounding, and exact
resolved amount. Submission revalidates it and requires a new review if the
terms must change. It does not silently recalculate an approved percentage.

Trade inputs choose either `slippageBps` or `worstPriceE8`, never both. Slippage
is converted into a directional execution limit using a disclosed, fresh
reference. The review identifies that reference, its age, and the resulting
limit. An oracle price is not presented as an executable maker quote. Matching
still checks the limit, maximum fee, policy, and deadline.

Ordinary calls use `validForSeconds`. An explicit `expiresAt` is an advanced,
mutually exclusive alternative. Preparation fixes the expiry and submission
rejects an expired preparation. A retry never extends the signed deadline.

### One preparation and operation lifecycle

Every mutation supports the same optional final argument, `{ prepare: true }`.
Preparation returns a reviewable draft without submitting that mutation.
If preparation needs a fresh authorized private view, that read and its costs
are disclosed before requesting its signature.

```ts
const prepared = await admin.account().withdraw("25%", {
  prepare: true,
});

const review = prepared.review;
const withdrawal = await prepared.submit();
await withdrawal.confirm();
```

The review includes resolved amounts and units, account and market versions,
price and fee limits, recipient, expiry, required approvals, and the ordered
steps. Costs distinguish Depth fees, maker rebates, app fees, Arcium charges,
Solana fees, and account rent, including their currencies and whether each is
an estimate or a signed cap. Missing estimates are explicit; they are not zero.

Calling the same method without `prepare: true` prepares and submits with the
same checks. It does not bypass wallet approval. `prepared.submit()` revalidates
the draft before signing and never changes its economic terms silently.

Every submitted mutation returns an operation handle:

| Method               | Required behavior                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `status()`           | Return the latest verified public progress and canonical receipt references.                                                                 |
| `subscribe(handler)` | Deliver deduplicated progress, expose reconnect errors, and return an unsubscribe function.                                                  |
| `wait(options?)`     | Wait for progress or a terminal outcome; on timeout return the latest verified pending snapshot, or a typed read error if none was obtained. |
| `confirm(options?)`  | Resolve only with a successful typed receipt; throw a typed failure or pending-timeout error otherwise.                                      |
| `privateResult()`    | Obtain an authorized private result when the operation has one, using a fresh view when needed.                                              |
| `resume()`           | Reconcile canonical progress and continue eligible unfinished steps without repeating a completed effect.                                    |
| `cancel()`           | Request cancellation only when the current operation permits it.                                                                             |
| `refund()`           | Request the canonical refund only when the recorded operation is refundable.                                                                 |

Timeout overrides are optional. Defaults account for the operation kind and
Arcium execution. A timeout is not a rejection or proof that funds can be
refunded. Unsupported cancellation, refund, or private-result requests return
typed errors.

Successful receipts carry the identifiers needed next, such as `appId`,
`quoteId`, and `offerId`. Success refers to the whole requested action: a
deposit is credited, a quote is active, and a withdrawal is paid. A queued
transaction or successful intermediate callback is not final success.

A high-level action may contain several transactions. Its operation records
the child receipts and progress so it can be recovered after a restart.
Already finalized transfers are not rolled back if a later step fails. For
example, a failed trade after successful margin allocation leaves that margin
accounted for and exposes the permitted release path.

### Maker onboarding and quote publication

The maker owner funds the account, allocates collateral, and grants a bot
limited authority. The bot receives its own signer, not the owner's wallet.

```ts
import { create_depth_maker } from "@depthhq/maker-sdk";

const maker = await create_depth_maker({
  environment: "devnet",
  wallet: makerOwnerWallet,
  appId,
});

const deposit = await maker.account().deposit(10_000_000_000n);
await deposit.confirm();

const allocation = await maker.account().allocate({
  marketId: "SOL-USD",
  amount: "50%",
});
await allocation.confirm();

const authorization = await maker.operator.authorize({
  operator: botWallet.publicKey,
  marketId: "SOL-USD",
  maxCapacity: 5_000_000_000n,
  validForSeconds: 86_400,
  canView: true,
});
await authorization.confirm();

const bot = await create_depth_maker({
  environment: "devnet",
  wallet: botWallet,
  makerOwner: makerOwnerWallet.publicKey,
});

const publication = await bot.quote.publish({
  marketId: "SOL-USD",
  bidE8: 19_900_000_000n,
  askE8: 20_100_000_000n,
  maxCapacity: 5_000_000_000n,
  validForSeconds: 30,
});

const { quoteId } = await publication.confirm();
```

The flat quote applies the same bid and ask to supported tiers within its
capacity. The SDK loads the market policy, derives the eligible tier envelope,
and validates prices, expiry, collateral, and operator limits. A maker does not
need a separate `marketPolicy()` call to publish safely.

Advanced makers may provide explicit tier prices instead of a flat bid and
ask. The two input forms are mutually exclusive and enforce the same rules.
Neither form pretends to guarantee a hedge or change the market's risk policy.

Quote and view authority remain separate capabilities. Quote-only,
view-only, and combined grants must be representable and revocable. A bot
cannot deposit from the owner wallet, allocate or release collateral, withdraw,
or initiate the owner's trades. Renewal requires a new owner authorization;
the SDK does not silently extend a grant.

### Trader entry and funding

After the app has obtained its app ID, it connects each trader's wallet.

```ts
import { create_depth } from "@depthhq/sdk";

const depth = await create_depth({
  environment: "devnet",
  appId,
  wallet: traderWallet,
});

const markets = await depth.catalog.markets();
const market = await depth.catalog.market("SOL-USD");
const account = await depth.account().summary();
const positions = await depth.positions.list();
const pending = await depth.account().pending();

const deposit = await depth.account().deposit(500_000_000n);
await deposit.confirm();
```

The SDK resolves the settlement token account, prepares the private account if
needed, submits the deposit, and follows it through private credit. An app
should display account state from `summary()` rather than manually combining
raw encrypted records or receipt statuses.

Market discovery, positions, pending operations, and other lists use
`{ items, nextCursor }` with an optional `cursor` and `limit`. The SDK handles
internal RPC and service pagination. Incomplete history or an unavailable
discovery source is an explicit condition, not an empty account.

### Open and manage a position

```ts
const prepared = await depth.trade.submit(
  {
    marketId: "SOL-USD",
    direction: "long",
    notional: 1_000_000_000n,
    margin: 200_000_000n,
    slippageBps: 50,
    maxFee: 1_000_000n,
    validForSeconds: 30,
  },
  { prepare: true },
);

const review = prepared.review;
const opening = await prepared.submit();
await opening.confirm();

const fill = await opening.privateResult();
const position = depth.position(fill.positionId);
const summary = await position.summary();
```

`notional` is the requested USDC execution notional. The encrypted computation
derives a representable SOL quantity at the selected price, rounding down to
the smallest SOL unit so execution does not exceed the requested notional.
The private result reports the actual quantity and notional. Renaming a
base-quantity field in the SDK does not implement this behavior.

`margin` is additional collateral to allocate for this action, not a request
to replace the position's existing margin or the circuit's total collateral
budget. The SDK orchestrates the allocation and supplies the correct encrypted
budget. A zero addition is allowed only when existing eligible collateral
satisfies the action. It never deposits or tops up beyond the approved amount.

An increase uses `trade.submit` again with the same direction and the
additional notional. An opposite-direction request must use an explicit
reduction, close, or reversal; it cannot accidentally reverse the position.

```ts
const increase = await depth.trade.submit({
  marketId: "SOL-USD",
  direction: "long",
  notional: 250_000_000n,
  margin: 50_000_000n,
  slippageBps: 50,
  maxFee: 250_000n,
  validForSeconds: 30,
});
await increase.confirm();

const topup = await position.addMargin("25%");
await topup.confirm();

const release = await position.removeMargin("10%");
await release.confirm();

const reduction = await depth.trade.reduce({
  positionId: position.id,
  amount: "25%",
  slippageBps: 50,
  maxFee: 250_000n,
  validForSeconds: 30,
});
await reduction.confirm();

const reversal = await depth.trade.reverse({
  positionId: position.id,
  direction: "short",
  notional: 500_000_000n,
  margin: 100_000_000n,
  slippageBps: 50,
  maxFee: 1_000_000n,
  validForSeconds: 30,
});
await reversal.confirm();

const closing = await depth.trade.close({
  positionId: position.id,
  slippageBps: 50,
  maxFee: 500_000n,
  validForSeconds: 30,
});
await closing.confirm();

const released = await position.removeMargin("all");
await released.confirm();

const withdrawal = await depth.account().withdraw("all");
await withdrawal.confirm();
```

The reversal's `notional` is the final exposure on the new side. The SDK and
circuit account for closing the old exposure as well; they do not interpret it
as the total opposite-side fill amount. Review and fee limits cover the entire
execution.

Reduction and close derive the closing direction and current position version
internally. They require no manual size calculation for a full close or manual
total-margin budget. They still check execution liquidity, fees, funding,
oracle validity, and collateral. A close does not automatically withdraw funds;
remaining collateral is released and withdrawn explicitly.

### Maker maintenance, fills, and exit

```ts
const quote = bot.quote(quoteId);
const status = await quote.status();
const capacity = await quote.capacity();
const active = await bot.quote.active({ marketId: "SOL-USD" });

const replacement = await bot.quote.replace({
  quoteId,
  bidE8: 19_950_000_000n,
  askE8: 20_050_000_000n,
  maxCapacity: 5_000_000_000n,
  validForSeconds: 30,
});

const { quoteId: nextQuoteId } = await replacement.confirm();
```

Replacement resolves the previous quote's market and preserves commitments
already accepted against it. Any interval with no active replacement is
reported. Publication, replacement, cancellation, and capacity release remain
recoverable operations rather than a sequence the bot must reconstruct.

```ts
const page = await bot.fills.list({ marketId: "SOL-USD" });
const fill = await bot.fills.get(fillId);

const unsubscribe = await bot.fills.subscribe({
  marketId: "SOL-USD",
  onFill: onMakerFill,
  onError: onMakerError,
});
```

`fillId` comes from a listed fill or event. `onMakerFill` and `onMakerError`
are the integrating maker's handlers. With view authority, the fill handler
receives the maker-authorized private execution details needed for hedging.
The SDK manages pagination, durable cursors, replay, and deduplication, and
checkpoints only after the handler succeeds. Persistent storage failures and
history gaps must be surfaced. A storage adapter is an optional deployment
choice, not a required `saveCursor` callback in every bot.

External hedging is the maker's responsibility. A maker must persist its hedge
intent and use an idempotent venue order key before acknowledging a fill.
An SDK cursor cannot make a crash between an external hedge and local
acknowledgment exactly once. A failed hedge never reverses a finalized Depth
trade or becomes Depth collateral.

The owner has the same `account()`, `positions.list()`, `position(id)`, and
`trade.submit/reduce/close/reverse` interfaces as a trader. Its app ID applies
when it takes liquidity. Owner private summaries include collateral, exposure,
reserved quote capacity, funding, fees, and current risk.

```ts
const cancellation = await bot.quote(nextQuoteId).cancel();
await cancellation.confirm();

const revocation = await maker.operator.revoke({
  operator: botWallet.publicKey,
  marketId: "SOL-USD",
});
await revocation.confirm();

const release = await maker.account().release({
  marketId: "SOL-USD",
  amount: "all",
});
await release.confirm();

const withdrawal = await maker.account().withdraw("all");
await withdrawal.confirm();
```

The owner can list grants through `operator.list()` and renew through
`operator.authorize()`. Revocation blocks new operator requests; it does not
cancel an accepted fill. The owner can cancel its quotes after revocation.
Before releasing all capital, it closes any remaining position and releases
quotes and backstop reservations. `"all"` only releases the currently safe
amount and does not imply that every obligation has ended.

### Optional backstop participation

```ts
const offering = await maker.backstop.offer({
  marketId: "SOL-USD",
  maxCapacity: 1_000_000_000n,
  validForSeconds: 3_600,
});

const { offerId } = await offering.confirm();
const offer = maker.backstop(offerId);
const status = await offer.status();

const release = await offer.release();
await release.confirm();
```

Backstop participation is explicit owner authorization. Capacity remains
reserved while the offer or a committed liquidation requires it. The SDK
cannot bypass the market's liquidation, expiry, or release rules.

### App administration and revenue

```ts
const app = await admin.app.summary();
const revenue = await admin.account().summary();

const feeChange = await admin.app.setFee(2);
await feeChange.confirm();

const withdrawal = await admin.account().withdraw("25%");
await withdrawal.confirm();

const deactivation = await admin.app.setActive(false);
await deactivation.confirm();

const activation = await admin.app.setActive(true);
await activation.confirm();
```

The summary distinguishes earned, pending, and credited withdrawable revenue.
Withdrawal uses the common amount selectors and reports a typed unavailable
amount if there is nothing to withdraw. Apps need not manually reproduce
balance arithmetic. Updating the app fee stays within protocol limits and
does not rewrite accepted trades. Deactivation blocks new attributed trades;
it does not block the owner's administration or eligible withdrawals.

### Discovery, private reads, and recovery

Apps can call `prepare_depth({ environment })` on page load to verify a signed
deployment without a wallet, then pass its connection options to `create_depth`
after connection. Identical verification requests on the same connection share
at most 30 seconds of cached verification, bounded by manifest expiry. Manifest
authentication and environment authority checks still run when connecting.

`account().state()` discovers account existence, lifecycle status, version,
and slot without signing or decrypting. A missing account is `uninitialized`;
its summary reports zero without creating an account. RPC failures, invalid
owners, and malformed accounts remain errors. Initialized balances require
an owner-authorized Arcium view. The demo begins account
loading after connection, then refreshes after account operations. It decrypts
approved responses locally. The Margin field includes unallocated Depth USDC
and unreserved market collateral when the account is flat. Wallet tokens are
excluded. Review and submission reject allocations above the fresh free balance.

Private snapshots default to memory storage. The demo selects
`privateViews: "device"`: balance and position results are encrypted with
AES-GCM in IndexedDB using a non-extractable device key. Associated data binds
the network genesis, program, wallet, account, and view kind. A confirmed
canonical account must still belong to the wallet, be ready, and have the
snapshot's version before reuse. Concurrent reads share one authorization.
Changed versions require a fresh view. The demo uses `viewAuthorization: "session"`: one owner-signed, revocable permission lasts at most seven days and pins the device X25519 recipient key, market, and read scopes onchain. The service pays for reads after verifying a separate device-signed request; it cannot change the recipient or authorize trades, quotes, or transfers. Request signing and decryption secrets are independently generated and encrypted under the same non-extractable device key. Interrupted reads retain their nonce and reuse the durable sponsored transaction. Corrupted authorization storage fails closed; no plaintext result or decryption secret is sent to the service.
Snapshots retain their original slot and read time. Device caching does not
protect against malicious same-origin code or an attacker controlling the
unlocked device, both of which could use the stored key. Another browser
creates its own read permission without needing the original device key.

Sponsored receipts are closed by their service payer after consumption, with a ten-minute cleanup sweep for abandoned terminal receipts. The service retains signed submission bytes before broadcast, reconciles unknown outcomes before retrying, limits each owner to thirty new reads and the sponsor to sixty new reads per hour, and keeps a 0.25 SOL gas reserve. Revocation stops new reads and disables automatic renewal on that device; already queued computations may finish encrypted to the fixed recipient. `depth.views.status()`, `authorize()`, and `revoke()` expose the lifecycle, and the demo wallet dialog exposes Enable and Revoke controls. `viewAuthorization: "wallet"` keeps individually owner-signed reads available.

For individually signed views, receipt cleanup is deferred to a later owner-signed transaction that fits the
Solana packet limit. Closed receipts are skipped and failed submissions retain
cleanup work. Explicit low-level view closure remains available. Clients for
public environments use keeper-paid margin settlement by default; explicit
`settlement: "wallet"` requests caller-paid progression. A transient empty quote
set or another pending order is polled for at most 60 seconds before returning a
specific liquidity or busy error. Relative order lifetimes begin after account
and margin preparation; explicit expiry times remain fixed. Settled allocations
are reusable by their canonical nonce and do not represent executed trades.
Flat accounts show collateral and release controls rather than close-position
controls. The trade form uses idle unreserved collateral before allocating
additional margin. Loading or outdated private values cannot authorize a trade.

`catalog.marketPolicy(marketId)` remains available for advanced risk and
quoting decisions. Routine trade and quote methods already read and enforce
the applicable policy. Summaries include units, canonical identifiers,
versions, as-of slots, and freshness; stale risk data cannot authorize an action.

A wallet reconnects on a different browser by discovering its canonical
accounts and receipts, then requesting new authorized private views. An
operation ID stored in a browser is a convenience, not a decryption key or
the sole recovery path. The SDK must not require the original browser's
ephemeral encryption secret to recover current balances, positions, or
retained fills. Stored discovery metadata must not contain private results.

```ts
const pending = await depth.account().pending();

for (const item of pending.items) {
  const operation = depth.operation(item.id);
  const state = await operation.status();
}
```

A pending item can be resumed, cancelled, or refunded only as its canonical
state permits. The SDK uses a durable root-to-child operation relationship
and reconciles signatures and nonces before any retry. It reports when a
signature or funding is needed rather than claiming background completion.
Trade margin allocations and orders share a client nonce, so
`depth.trade.flow(nonce)` can recover either child from the chain. A quote
replacement records its successor nonce on the prior quote before stopping it;
`maker.quote.list()` exposes that link, and
`maker.quote.replacement(priorId, nonce)` resumes it after a restart. If a
replacement was never published, its private prices are not recoverable from
public chain state, so the maker provides new terms before continuing.

Eligible continuation work should be executable by a keeper after the original
authorization. That authorization must bind the owner, amount, market,
destination, expiry, and any execution-cost budget. A keeper cannot change
those terms or obtain general wallet authority. Steps that require a new
decision or signature remain owner actions.

```ts
const recovery = await depth.recovery.status({
  marketId: "SOL-USD",
});

if (recovery.claimable) {
  const claim = await depth.recovery.claim({
    marketId: "SOL-USD",
  });
  await claim.confirm();
}
```

Recovery distinguishes normal pending-operation recovery from permanent MXE
failure. Emergency recovery follows the published committee, disclosure, and
market-wide settlement process. It must not silently expose positions because
an ordinary request timed out. Account and fee claims reconcile canonical
receipts and cannot be paid twice.

### Public operations, errors, and retention

SDK fields use camelCase. HTTP and generated chain types may use their own
versioned wire naming, with lossless adapters. A public operation snapshot
identifies its kind, owner, market where applicable, state version, observed
slot and commitment, relevant signatures, child receipts, and any public error.
App, account, trade, quote, operator, backstop, and recovery mutations use the
same lifecycle while preserving their specific canonical states.

A prepared draft is local review state, not an onchain queued operation.
Intermediate states are not reported as finalized. Failure reasons must not
disclose a hidden position, balance, price, or comparison result. Existing
public token and margin-transfer amounts remain public metadata as described
in the privacy section.

Typed errors distinguish invalid input, unsupported environment or wallet,
wallet rejection, insufficient funds, stale state, price or fee limits,
expired requests, revoked authority, unavailable private views, RPC or service
failure, pending timeout, and terminal rejection. Errors include a retry or
recovery action where one is safe; they never imply that a retry is free of
duplicate-execution risk without reconciliation.

Persistent order, fee, withdrawal, and payout receipts are not pruned in the
initial design. Their transaction payer funds rent. Any future pruning policy
must preserve replay protection, auditability, and the promised recovery window
and be published before activation. Temporary private-view accounts can be
closed after consumption with the required authorization. The SDK exposes
cleanup and its costs without silently discarding the only recoverable record.

### Hosted interface and HTTP service

The headless SDK works independently of the hosted interface. The separately
scoped hosted interface may be opened with:

```ts
await depth.open({ marketId: "SOL-USD" });
```

An embedded interface uses an isolated Depth-controlled origin, exact origin
checks, and a versioned message protocol. It shares public progress with the
integrating app and never sends private inputs or view keys through public
messages. Hosting this interface is separate from shipping the SDK.

The public HTTP service exposes market, app, quote, operation, and recovery
reads. Owner discovery and paginated public history support wallet recovery
without making the service a source of ledger authority. Public events and
signed webhooks, if enabled, are idempotent progress hints. Clients verify
canonical state and finality independently. No unauthenticated endpoint returns
private fills, balances, or positions.

### Depth-owned execution

Keepers maintain oracle and funding state and progress eligible settlement,
fee claims, liquidations, and authorized continuations. These are protocol
services, not code every integrating app must reproduce. Configuration and
emergency authority stay separate from app registration. Neither a service
operator nor an app can choose payouts, bypass risk checks, or decrypt arbitrary
accounts through the ordinary SDK.

## Project organization

This repository contains the specification, Solana program, SDK packages, and
public read server. Each package owns its bindings, public schemas, or SDK code.
`contracts/` is the Arcium and Anchor project root; its required internal layout
remains together.

```text
depth.supply/
  depth.md
  contracts/                Arcium and Anchor project root
    programs/depth/         Solana custody, registry, oracle, and callback code
    encrypted-ixs/          Arcis quote, match, risk, funding, and view circuits
    tests/                  Program and circuit integration tests
  packages/bindings/        generated IDL, addresses, and versioned deployments
  packages/schema/          shared public request and result shapes
  packages/sdk/             trader and app-facing SDK
  packages/maker-sdk/       maker quote and risk client
  client/                   Depth-hosted trade and maker interfaces
  server/                   public reads and permissionless settlement keeper
    src/features/           app, market, quote, operation, recovery, settlement, oracle, risk, fee
    src/shared/             chain access, configuration, and HTTP helpers
  scripts/                  build, deployment, and verification commands
```

The Arcium CLI owns `Arcium.toml` and `encrypted-ixs` within
`contracts/`. The Anchor/Arcium program owns the canonical market
and ledger state. Generated bindings belong in their package. SDK packages
never depend on the server. Feature folders are added when their code
exists; server features use controller, index, model, route, schema, and
service files only where those roles actually exist. Workers and indexers
get their own feature files. The server does not become a second risk engine.

Public deployments store compiled Arcis circuits in a public Pinata IPFS
folder. The folder CID fixes the URLs, and each computation definition embeds
the SHA-256 hash generated by `arcium build`. Arcium nodes verify that hash
when loading a circuit. The deployment build sets `DEPTH_CIRCUIT_BASE_URL` to
the verified HTTPS gateway path ending at the circuit folder; local tests
continue to use onchain circuit accounts. The circuit folder must remain
pinned and readable for as long as its computation definitions are active.

## Decisions and proofs still needed

The contracts, SDKs, and demo implement the flow from app entry through maker
exit. The following calibration and verification gates remain before Depth
can claim a production-ready market or freeze its compatibility policy:

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
4. **Arcium implementation fit:** Benchmark the compiled bounded quote,
   ledger, view, and liquidation circuits with the pinned toolchain. Measure
   callback bytes, account sizes, compute cost, queue delay, and
   contention under the largest allowed market state.
5. **Private receipt storage:** Order, fee-recovery, withdrawal, and payout receipts have fixed layouts
   and remain onchain without pruning; their creating transaction payer funds
   rent. Temporary view accounts can be closed by their authorized owner.
   Rehearse owner-only re-sealing after the original browser session has ended.
6. **Final wire format:** Keep the generated Solana IDL, Arcis input packers,
   event schema, and signed deployment manifest aligned with the implementation.
   The trader and maker SDKs are published as `@depthhq/sdk` and
   `@depthhq/maker-sdk`. Freeze their compatibility policy only after the
   generated artifacts and documented public API agree.

These are real feasibility and economic gates. A working interface mock
or a successful encrypted matching demo would not close them.

## What the tools support, and what Depth must prove

| Area                     | Verified tool capability                                                                                                                  | Depth-owned work or open gate                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encrypted input          | Arcium's TypeScript client uses X25519 and Rescue to encrypt inputs before submission.                                                    | The hosted and headless clients must avoid logging, leaking, or reusing keys and nonces.                                                           |
| Encrypted computation    | Arcis supports fixed-size encrypted structs, comparisons, arithmetic, encrypted outputs, and recipient sealing.                           | Depth must write and test the matching, balance, funding, liquidation, and conservation circuits.                                                  |
| Persistent private state | Arcium shows MXE-encrypted state returned by a computation and stored by a Solana callback. The network does not mutate app state itself. | Depth must design bounded state layouts, version checks, and complete update coverage.                                                             |
| Solana authorization     | The Depth program can custody tokens and enforce signatures, PDA ownership, callback authentication, and vault transfers.                 | It cannot inspect hidden numbers without trusting a valid Arcium result. A public independent proof of every private ledger update is not assumed. |
| Oracle                   | Pyth provides verified Solana price updates with feed, freshness, and confidence data.                                                    | Depth must admit actual feeds and implement delayed-price, stale-price, and market-hours policy.                                                   |
| Confidential transfers   | Token-2022 Confidential Balances hide supported transfer amounts and balances.                                                            | It does not hide account addresses. Compatibility with Depth's custody and payout flow must be tested before use.                                  |
| Liveness                 | Arcium documents queue expiry, failure reporting, and cluster migration.                                                                  | Depth must reconcile locks, prove retry safety, and validate emergency exit.                                                                       |

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
15. App registration returns its canonical app ID and prepares fee receipt
    accounts. Environment-based construction, browser wallets, Node maker
    signers, fee changes, deactivation, and revenue withdrawals work through
    the documented public API without caller-supplied program addresses.
16. All mutation kinds support the same preparation and confirmation model.
    Reviews disclose resolved amounts, approval steps, fees, computation
    costs, and rent. Percentage rounding, stale preparations, slippage,
    expiry, and confirmation timeouts cannot silently change signed terms.
17. Notional-based entry, additional margin, partial reduction, full close,
    and reversal to a stated final exposure agree between SDK, encrypted
    inputs, circuits, and receipts. Tests cover rounding and a changing
    execution price; a field rename is insufficient.
18. A keeper can complete authorized continuation steps after the owner
    disconnects, with no power to change destinations, amounts, markets,
    expiry, or approved costs. Duplicate and late callbacks remain safe.
    A new browser can rediscover pending work without a saved operation ID.
19. The documented pause policy permits safe reductions and closes when
    their oracle, liquidity, and solvency prerequisites remain valid, while
    rejecting increases and unsafe exits. Every admission and callback stage
    enforces the same policy without revealing the hidden trade intent.
20. Quote capacity follows the documented lifecycle after a smaller fill;
    public capacity changes do not reveal the exact hidden fill amount.
    Quote-only, view-only, combined, expired, and revoked grants are tested.
21. Recovery rehearsal uses independently held threshold key material and
    the published committee process. Possessing one complete recovery key
    plus several transaction signers is not proof of independent custody.

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
