# Depth implementation status

Reviewed on 2026-09-27 against source revision `7007512`, the current working
tree, the local tests, and the updated [product specification](depth.md).

The program and encrypted circuits contain substantial working protocol logic.
The complete integration flow in the SDK specification is not implemented yet,
and several contract behaviors still differ from that specification. Remaining
work includes implementation and verification, not only deployment.

This report distinguishes existing code, missing behavior, and proof that still
needs to be produced. Source inspection and passing TypeScript tests do not
establish production readiness.

## Existing implementation

| Area | What exists | Source |
| --- | --- | --- |
| Custody | Token deposits, pending private credit, refund paths, private balance checks, persistent withdrawal receipts, and keeper continuation of authorized deposit and margin receipts. | [Vault](contracts/programs/depth/src/instructions/vault.rs), [credit](contracts/programs/depth/src/instructions/credit.rs), [margin continuation](contracts/programs/depth/src/instructions/margin_in.rs), [funding worker](server/src/features/funding/funding.service.ts). |
| Private accounting | Encrypted free and market balances, margin transfers, positions, clearing state, and authorized balance and position views. | [Arcis circuits](contracts/encrypted-ixs/src/lib.rs), [margin instructions](contracts/programs/depth/src/instructions/margin.rs), [SDK views](packages/sdk/src/view/view.ts). |
| Trading | Encrypted quote validation, capacity reservation, complete bounded quote snapshots, best-price selection, intent checks, settlement, PnL, and funding accounting. | [Orders](contracts/programs/depth/src/instructions/order.rs), [reservations](contracts/programs/depth/src/instructions/reserve.rs), [settlement](contracts/programs/depth/src/instructions/settlement.rs), [commit](contracts/programs/depth/src/instructions/commit.rs). |
| Economics | The locked 5 bps base schedule, configurable 0–2 bps app fee, maker rebate, private fee claims, and recipient balance credit. | [App configuration](contracts/programs/depth/src/instructions/app.rs), [fee instructions](contracts/programs/depth/src/instructions/fees.rs), [circuits](contracts/encrypted-ixs/src/lib.rs), [fee worker](server/src/features/fee/fee.service.ts). |
| Risk | Pyth update validation, margin checks, funding advancement, pause after missed funding intervals, backstop offers, liquidation, insurance accounting, and emergency payout calculation. | [Oracle validation](contracts/programs/depth/src/oracle.rs), [market](contracts/programs/depth/src/instructions/market.rs), [backstop](contracts/programs/depth/src/instructions/backstop.rs), [liquidation](contracts/programs/depth/src/instructions/liquidation.rs). |
| Recovery | Recovery ciphertexts and commitments, committee signature checks, market-wide reveal and reconciliation, pro rata payouts, separate fee claims, and one-time payout records. | [Recovery](contracts/programs/depth/src/instructions/recovery.rs), [winddown](contracts/programs/depth/src/instructions/winddown.rs), [SDK recovery](packages/sdk/src/recovery/recovery.ts), [operator tooling](packages/sdk/src/recovery/winddown.ts). |
| Maker operations | Owner funding, independent view-only grants, grant listing, flat or tiered quote publication, activation, replacement, cancellation, private fill retrieval, and finalized fill pagination. | [Operator rules](contracts/programs/depth/src/instructions/operator.rs), [maker client](packages/maker-sdk/src/client/client.ts), [quote handle](packages/maker-sdk/src/quote/quote.ts), [fill history](packages/maker-sdk/src/fill/history.ts). |
| SDK foundations | Generated bindings, encrypted input packing, signed manifest verification, onchain owner discovery of pending receipts, private view decryption, app registration and fee administration, order polling, and retryable read errors. | [Bindings](packages/bindings), [discovery](packages/sdk/src/account/discovery.ts), [app SDK](packages/sdk/src/app/app.ts), [SDK](packages/sdk/src), [schema](packages/schema). |
| Server | Fastify public market, app, quote, operation, and recovery reads, including complete onchain market policy; settlement, funding, risk, fee, and oracle workers. Features live under `src/features` and infrastructure under `src/shared`. | [Server composition](server/src/app.ts), [features](server/src/features), [shared services](server/src/shared). |

“Exists” describes source functionality and associated test code. It does not
mean every economic scenario or deployment has been validated.

## Contract and circuit gaps

### 1. Safe reductions and closes during a pause

The specification preserves safe exits while stopping new risk. In
`submit_order_handler`, every trade requires `trading_enabled` and an
`Active` market. `match_order_callback_handler` and the commit checks also gate
trades on active state. There is no separate reduce-only market mode.

Required work: implement the published pause policy through admission, private
intent verification, and every settlement stage. A public intent flag alone
must not substitute for the circuit checking that exposure actually decreases.
Oracle or compute unavailability must still reject an exit that cannot be
proved safe.

Evidence: [order handlers](contracts/programs/depth/src/instructions/order.rs),
[commit checks](contracts/programs/depth/src/instructions/commit.rs),
[MarketStatus](contracts/programs/depth/src/state/mod.rs).

### 2. Execution notional and reversal semantics differ

The current `TradeInput.size` and encrypted `OrderInput.size` are SOL base
quantity. Matching multiplies this quantity by the selected price to obtain
notional. A reverse input is the entire opposite-side quantity and must exceed
the existing absolute position.

The target accepts USDC notional; a reverse specifies the final new-side
exposure. This requires confidential conversion, rounding, limit checks, and
consistent packing and receipts. Estimating base quantity from an oracle in
the SDK would not implement execution-price notional.

Evidence: [TradeInput](packages/sdk/src/client/types.ts),
[match_order circuit](contracts/encrypted-ixs/src/lib.rs).

### 3. Additional-margin orchestration is absent

Current `margin` is a checked collateral budget: matching compares required
margin plus fees to it, and settlement checks it against trader collateral.
Submitting a trade does not allocate that amount from free balance.

The target `margin` means additional collateral for this action. The SDK
needs real allocation-to-trade orchestration, correct internal budgeting,
recovery when allocation succeeds but the trade fails, and derived close and
reduction budgets. Passing the new margin field straight into the old circuit
would be incorrect.

Evidence: [trade submission](packages/sdk/src/client/client.ts),
[match and settlement circuits](contracts/encrypted-ixs/src/lib.rs).

### 4. A quote is retired after its first fill

Final trade commit removes the selected quote from active quotes, subtracts
its entire public capacity envelope, sets `remaining_capacity = 0`, and marks
it `Filled`. It does not keep unused capacity active until cancellation or
expiry as the documented lifecycle implies.

Required work: resolve the specified residual-capacity behavior in the private
reservation and settlement logic, including attached orders, maker margin,
expiry, and cancellation. Publicly decrementing capacity by exact fill size
would undermine the privacy requirement; it is not an acceptable shortcut.

Evidence: trade branch of
[seal_clearing_callback_handler](contracts/programs/depth/src/instructions/commit.rs)
and [settle_trade](contracts/encrypted-ixs/src/lib.rs).

### 5. Quote overflow does not have the documented waiting queue

The active snapshot is bounded to four quotes. Reservation rejects
`QuoteSnapshotFull` when it is full. Active quotes are deterministically
sorted, but there is no implemented waiting/admission queue that automatically
offers excess quotes a later snapshot as the specification describes.

Required work: define and implement that queue's admission, expiry, capacity,
and retry behavior, or explicitly revise the product requirement before
claiming it is implemented.

Evidence: [reserve_quote_handler and callback](contracts/programs/depth/src/instructions/reserve.rs).

### 6. Incident states are less specific than the specification

`MarketStatus` is `Draft`, `Active`, `Paused`, or `Settling`. It does not
persist the distinct public oracle, cluster, collateral-deficit, and callback
incident states described in the failure policy.

Required work: canonical reason and recovery eligibility reporting, including
clear authority for recording and clearing each condition. UI guesses from
an RPC error cannot establish why a market is paused.

Evidence: [MarketStatus](contracts/programs/depth/src/state/mod.rs),
[pause and resume](contracts/programs/depth/src/instructions/market.rs).

## SDK gaps

| Required public flow | Current implementation | Remaining work |
| --- | --- | --- |
| `create_depth({ environment, wallet, appId? })` | The `create_depth` alias and optional app ID work for low-level options. RPC connection and deployment policy remain explicit; wallet type is Anchor's wallet. | Trusted environment resolution, supported browser wallet capabilities, advanced overrides, and environment errors. |
| `create_depth_maker` | The agreed alias is exported; maker owner, RPC, and deployment remain explicit. | Environment-based owner/operator construction and browser-compatible signing where applicable. |
| App registration and administration | `app.register/summary/setFee/setActive` are implemented. Registration confirmation initializes and waits for a private fee balance and can resume with the owner wallet. | Common operation status and preparation, richer earned/pending/withdrawable revenue summaries, and integration proof for fee-account onboarding. |
| `account()` and `position(id)` | They are fixed objects; funding methods take token-account addresses, amounts, and nonces. | Resource handles, token/account initialization, nonce generation and reconciliation, and complete actor-consistent workflows. |
| `"all"` and percentage amounts | Only explicit bigint funding amounts exist. | Fresh private available amounts, basis-specific integer parsing and rounding, reservation checks, and stale-review handling. |
| `prepare: true` and cost review | No common preparation interface exists. | Side-effect boundaries, resolved terms, policy and account versions, approval steps, cost estimates, signed limits, and revalidation. |
| Slippage, durations, position-derived exits | Callers provide direction, size, total margin budget, price bound, expiry, nonce, and position version. | Slippage conversion, `validForSeconds`, private current-position reads, exact close/reduce/reverse semantics, and circuit work above. |
| Common operations and default confirmation | `DepthOperation` reads order records and exposes status/subscribe/wait/confirm with a default timeout and typed terminal errors. Funding and quote handles have separate lifecycles. | All operation kinds, `privateResult/resume/cancel/refund` capability checks, child receipt relationships, and consistent errors. |
| Cross-browser discovery | `account.pending({cursor,limit})` scans confirmed owner deposit, transfer, withdrawal, and order accounts, checks their canonical addresses, and pages pending IDs and nonces; fresh private views can recover current balances and positions. | Unified operation restoration for every receipt kind, historical discovery, a durable event index, and complete authorized position discovery. |
| Account and position summaries | Trader summary methods request private views and return their decoded lifecycle snapshots. | Derived available amounts, pending funds and revenue, quote reservations, fee claims, current health, freshness, and unified maker summaries. |
| Trader private fill result | Contract fill views exist; maker SDK can request them. The trader operation has no `privateResult()` facade. | Authorized trader result retrieval, re-sealing, decoding, and cleanup. |
| Complete maker fill context | `FillSnapshot` contains side, size, margin, execution price, fees, and rebate. It does not include the documented funding checkpoint, resulting position change, or remaining capacity. | Supply the promised context bound to that fill's versions; a later current-position read cannot stand in for historical fill state. |
| Flat maker quotes | Publication derives eligible policy tiers from a flat bid and ask, accepts a duration, generates a nonce, and returns a handle without waiting for validation. Explicit tier publication remains available. Quote handles expose `confirm()` and capacity. | Uniform preparation, durable pending-quote discovery, and a recoverable replacement operation with no hidden inactive interval. |
| Maker owner trading and backstop | Owner funding, grant/revoke/list, quote handles, and private views exist; backstop contract exists. | Owner trade facade, simple grant renewal, backstop offer/status/release, and shared account/position summaries. |
| Managed fill consumption | Finalized pagination and replay exist; the caller supplies cursor persistence and performs separate private fill reads. | Default durable storage, per-owner/environment cursor isolation, private `onFill` delivery, and restart/error handling. External hedge idempotency remains the maker's responsibility. |
| Browser and package delivery | Build script targets Node; runtime imports `node:crypto`; SDK packages are marked private. | Browser-compatible runtime and exports, package build/install tests, release configuration, and published distribution. |
| View retention and cleanup | Views can be closed through lower-level handles; summary methods create fresh views. | Managed lifecycle and explicit authorized cleanup, rent reporting, and recovery guarantees without retaining view secrets. |

Evidence:
[SDK options](packages/sdk/src/client/types.ts),
[SDK client](packages/sdk/src/client/client.ts),
[operation handle](packages/sdk/src/operation/operation.ts),
[funding handles](packages/sdk/src/account/funding.ts),
[pending discovery](packages/sdk/src/account/discovery.ts),
[view handles](packages/sdk/src/view/view.ts),
[maker options](packages/maker-sdk/src/client/types.ts),
[maker client](packages/maker-sdk/src/client/client.ts),
[fill history](packages/maker-sdk/src/fill/history.ts),
[build script](scripts/build-package.mjs),
[SDK package](packages/sdk/package.json),
[maker package](packages/maker-sdk/package.json).

## Server and operational gaps

- **Owner discovery and public history:** The SDK scans owner pending receipts
  directly from confirmed onchain accounts. Public routes still read specific
  accounts; a durable historical index and complete owner position discovery
  are absent. Public event subscriptions and signed webhooks are optional
  extensions, also absent.
- **Market policy access:** The market response projects onchain quote tiers,
  limits, oracle rules, fees, and funding schedule. The target SDK catalog
  facade still needs to consume and verify this response.
- **Pyth update publishing:** `OracleService` validates and consumes a
  configured Pyth update account. It does not fetch and publish fresh Pyth
  updates. Provision and verify an external publisher or implement this
  service; the existing worker alone does not maintain the upstream feed.
- **Continuation coverage:** Settlement, fee, risk, oracle, and funding workers
  exist. Deposit credit and escrowed margin transfers can now be advanced by
  the keeper without the owner signer. Complete quote/workflow recovery and
  root-to-child SDK progress remain to implement and prove.
- **App profiles and hosted integration:** Optional name/origin/callback
  profiles and their verification are absent. The hosted UI and its exact
  origin message protocol remain deferred under the instruction to leave
  the client alone.

Evidence: [registered routes and services](server/src/app.ts),
[market model](server/src/features/market/market.model.ts),
[market service](server/src/features/market/market.service.ts),
[oracle worker](server/src/features/oracle/oracle.service.ts),
[funding worker](server/src/features/funding/funding.service.ts),
[settlement worker](server/src/features/settlement/settlement.worker.ts),
[app model](server/src/features/app/app.model.ts).

## Recovery, privacy, and launch proofs

1. **Independent recovery custody:** The program checks three of five
   committee signatures and committed recovery states. Tests decrypt recovery
   witnesses using one complete recovery private key from
   [keys.ts](contracts/tests/keys.ts), with transaction signers tested
   separately in [trade.ts](contracts/tests/trade.ts). No independent share
   creation, custody, reconstruction or threshold-decryption workflow was
   found. The [winddown SDK](packages/sdk/src/recovery/winddown.ts) consumes
   already decrypted witnesses. Real committee recovery and MXE migration
   need operational tooling and rehearsal.
2. **Privacy measurement:** Public margin-transfer records contain amount and
   transfer direction in [MarginTransfer](contracts/programs/depth/src/state/mod.rs).
   The specification now explicitly acknowledges this. Positions remain
   encrypted, but correlations between these amounts, wallet activity,
   maker identity, timing, and liquidation events have not been measured in
   this audit. No complete measured privacy claim follows from ciphertext
   storage alone.
3. **Multi-maker economic scenarios:** The integration trade fixture exercises
   a trader and a maker. It does not demonstrate the specified close through
   a different maker with the old maker's unrealized loss, or broad maker
   default and insolvency combinations. These need dedicated conservation
   assertions covering clearing, insurance, and every fee recipient.
4. **Maximum-state execution and economics:** The SDK wire test checks an
   order with four quote addresses against transaction size limits. That is
   not proof of a real four-maker competition, maximum callback/state sizes,
   sustained throughput, Arcium queue latency, or total cost per completed
   lifecycle. Fee profitability and market risk calibration still require
   measured costs, liquidity, insurance funding, and stress results.
5. **Failure and restart exercises:** Real browser wallet rejection,
   rediscovery on another device, the complete prepared-operation lifecycle,
   keeper completion after disconnect, and maker crash around a private fill
   and external hedge need end-to-end coverage. Existing replay unit tests
   do not cover an external venue's partial fills or outages.
6. **Deployment and release verification:** This review did not verify a live
   devnet/mainnet deployment, signed public environment manifest, working
   publisher/keeper fleet, independent security review, or published SDK.
   Existing deployment and manifest primitives are not evidence that these
   launch gates are complete.

## Deliberate scope boundaries

These are not unexpected missing first-release features:

- Additional markets beyond the approved SOL perpetual settled in USDC.
- A hosted trading or maker UI while client work is deferred.
- Token-2022 confidential transfer support for another custody integration.
- A maker's proprietary pricing, external venue credentials, or hedge strategy.
- Private ranked auto-deleveraging: the specification explicitly selects
  committee-authorized winddown and pro rata haircut as the current fallback.
- Optional signed webhooks and direct fill sealing in the settlement callback.

## Verification during this review

- `pnpm test` passed: **33 TypeScript tests**, comprising 14 trader SDK,
  5 maker SDK, and 14 server tests.
- `pnpm typecheck` passed across bindings, schema, both SDKs, and server.
- `cargo test --manifest-path contracts/Cargo.toml -p depth --lib --offline`
  passed all **13 contract unit tests**, including view-only grants.
- All 15 TypeScript documentation examples passed syntax checks; they were
  not type-checked against the incomplete target API. Markdown fences and
  local source links were checked, and `git diff --check` passed.
- TypeScript tests cover selected codecs, mocked RPC transitions, views,
  manifest checks, quote and fill handling, and server behavior. They do not
  execute the complete protocol on a live deployment.
- The full `arcium test` run rebuilt the program and encrypted circuits but
  stopped before executing integration tests. A later run with Surfpool 1.6.0
  from the official release archive also timed out before RPC became ready.
  Direct pinned Anchor 1.0.2 localnet started Surfpool, then panicked in its
  localnet command. Contract integration results remain unverified on this host.
- The current working tree implements the keeper continuation, view-only
  grant, app administration, pending discovery, full market projection, and
  flat maker quote changes described above.
  The rest of the target API remains pending.

## Implementation order

1. Fix the remaining contract and circuit semantics: pause-safe exits,
   notional/reversal accounting, quote capacity and overflow, and incident
   reporting. Prove keeper continuation and view scopes in integration tests.
2. Build the SDK foundation: browser and Node wallets, trusted environment
   resolution, common prepared operations, durable recovery, and amount rules.
3. Complete app, trader, and maker flows using those primitives, including
   summaries, backstop, fee receipt onboarding, and managed fills.
4. Add discovery and continuation services, provision price publishing, and
   implement independent committee recovery operations.
5. Prove the complete flows on real local Arcium/Solana execution, then verify
   a deployed environment, costs, privacy limits, and release artifacts.

The first implementation milestone should pair each changed contract rule with
its meaningful tests and the SDK adapter that consumes it. Cosmetic wrappers
over the current semantics would leave the documented behavior incorrect.
