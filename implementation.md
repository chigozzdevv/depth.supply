# Depth implementation status

Reviewed on 2026-09-30 against [depth.md](depth.md), the repository source,
and local tests; public devnet accounts were checked on 2026-09-30. The SDK examples in `depth.md`
remain the target API. A passing local suite does not establish a deployed or
economically safe market.

## Implemented

| Area | Current behavior | Source |
| --- | --- | --- |
| Custody and privacy | SPL USDC vault deposits, encrypted free and market accounts, escrowed margin transfers, withdrawals, authenticated private views, and onchain recovery commitments. Public transfers still expose amount, wallet, and timing metadata. | [Vault](contracts/programs/depth/src/instructions/vault.rs), [circuits](contracts/encrypted-ixs/src/lib.rs), [private views](packages/sdk/src/view/view.ts) |
| Trading and economics | Confidential best-price matching, USDC execution notional for entry and reversal, SOL quantity for reduction, full close, trade fees, app fees, maker rebate, insurance, funding, and liquidation. A reversal closes the old quantity and opens the requested new-side notional. | [circuits](contracts/encrypted-ixs/src/lib.rs), [order submission](packages/sdk/src/client/client.ts), [settlement](contracts/programs/depth/src/instructions/settlement.rs) |
| Quote lifecycle | Encrypted remaining capacity and reserve survive a partial fill. The public capacity envelope stays unchanged while the quote is active. A bounded FIFO queue admits waiting quotes as slots become available, and a private quote view lets an authorized maker inspect its actual remaining capacity. | [quote state](contracts/programs/depth/src/state/mod.rs), [quote instructions](contracts/programs/depth/src/instructions/reserve.rs), [quote view](contracts/programs/depth/src/instructions/quote_view.rs), [keeper](server/src/features/quote/quote.worker.ts) |
| Failure reporting | Market incident reasons are recorded onchain and included in the public market projection. Paused markets allow only the encrypted reduction and close path subject to fresh oracle and solvency checks. | [market](contracts/programs/depth/src/instructions/market.rs), [projection](server/src/features/market/market.model.ts) |
| Trader SDK | App registration, market policy reads, owner funding, token account selection, deposit and transfer confirmation, amount selectors, private account and position views, slippage/deadline bounds, margin allocation before trading, order handles, and private fill results. | [client](packages/sdk/src/client/client.ts), [funding](packages/sdk/src/account/funding.ts), [catalog](packages/sdk/src/catalog/catalog.ts), [operations](packages/sdk/src/operation/operation.ts) |
| Maker SDK | Owner account and trade delegation, grant-scoped quote operations, onchain quote discovery, private quote capacity, private fills, backstop handles, and finalized fill polling with an atomic, per-maker and per-network cursor file. | [maker client](packages/maker-sdk/src/client/client.ts), [quote](packages/maker-sdk/src/quote/quote.ts), [fill history](packages/maker-sdk/src/fill/history.ts) |
| Recovery tooling | Five encrypted committee envelopes with a three-share threshold, independent share opening, commitment-checked witness reads, and a coordinator that scans every market account and unclaimed fee record before revealing and finalizing an already authorized winddown. | [shares](packages/sdk/src/recovery/shares.ts), [witnesses](packages/sdk/src/recovery/witness.ts), [coordinator](packages/sdk/src/recovery/coordinator.ts), [winddown](packages/sdk/src/recovery/winddown.ts) |
| Server | Fastify public reads and keeper workers for funding, settlement, fees, risk, quote admission, and oracle ingestion. A separate publisher fetches Hermes proofs, submits Pyth receiver updates, checks the confirmed feed account, and exposes a freshness health endpoint. | [features](server/src/features), [publisher](server/src/features/oracle/oracle.publisher.ts), [config](server/src/shared/config/env.ts) |

## Remaining implementation

1. **Complete public SDK lifecycle.** `create_depth({ environment, wallet,
   appId? })` and `create_depth_maker` still require a caller-supplied RPC
   connection and deployment policy. The packages are Node-oriented, import
   `node:crypto`, and remain private. Browser wallet delivery, a signed
   environment registry, release packaging, common `{ prepare: true }`
   reviews, root-to-child operation recovery, typed receipts for every
   mutation, and full preparation costs are not implemented. The current
   owner transfer and trade helpers do not meet every example in `depth.md`.
2. **Trade allocation recovery.** The SDK allocates approved additional
   margin before submitting a trade and never silently deposits more. If a
   later step fails, the allocation remains legitimate collateral, but the
   high-level operation does not yet return a durable child receipt and
   explicit recovery action across browser restarts. Settled allocations
   without a matching order are now discoverable onchain, but a standalone
   allocation is indistinguishable from a trade allocation without the
   original prepared intent. Exact client nonces and canonical transfer
   receipts need one reconciled operation flow. The circuit remains the final
   authority for release safety.
3. **Quote and fill restart behavior.** The onchain waiting queue and private
   residual balance are implemented, and a maker can rediscover its submitted
   quote records from chain. Quote publication/replacement still has no
   single prepared root operation that records the child quote and release
   steps. Managed maker fill polling persists its cursor after the handler
   succeeds; browser persistence, orphaned temporary-view cleanup, and a
   real external hedge crash/partial-fill rehearsal remain.
4. **Oracle liveness.** The devnet demo uses the sponsored SOL/USD feed without
   a Hermes key or Depth publisher. The configured feed existed on devnet and
   was 32 seconds old at the 2026-09-29 21:43 UTC check; that one observation
   is not sustained feed liveness. Depth's Hermes/Pyth receiver publisher is
   implemented and tested locally but has not been run against a public
   cluster. The Hermes mode requires an API key, a funded publisher signer,
   a process supervisor, and external alerting before production use. The
   market now pins its approved price-update account onchain; a replacement
   requires the protocol authority, a draft or paused market, no pending order, and
   a newer verified SOL/USD update. The keeper rejects a configured account
   that differs from the market's approved account.
5. **Independent committee operation.** Code creates envelopes for five
   distinct recipient keys and reconstructs only from three shares. Real
   committee identities, separate key custody, distribution attestations,
   signer collection, incident authorization, a full no-MXE rehearsal, and
   secure destruction are operational work. The local test's three member
   keys still run within one fixture process, so it does not prove independent
   custody.
6. **Economic and privacy proofs.** The live fixture exercises one trader and
   two maker wallets competing across four active quotes, and its emergency
   winddown recovers all three market accounts. Fee conservation, a four-quote
   match callback, a four-quote order's serialized size, and pro rata payout
   arithmetic including an insolvent maker have tests. A close by a different
   maker, live maker-default combinations, measured callback cost and sustained
   throughput, protocol revenue against Arcium fees, and measured
   wallet/amount/timing inference remain acceptance gates in `depth.md`.
7. **Deployment.** The signed manifest capture and verifier exist, but the
   Depth program was not found on public devnet in the 2026-09-30 check.
   Arcium's cluster listing showed no open node membership slots on devnet or
   mainnet; that does not establish whether either network can admit another
   MXE. The local signer at `contracts/target/test-wallet.json` held 10 devnet
   SOL at the latest check. The offchain-source build was 3,674,576 bytes,
   implying about 18.67 SOL of ProgramData rent and a similar temporary
   buffer allocation, before transaction fees and MXE
   setup. The 26 compiled circuits total 83,328,718 bytes, implying about
   423.33 SOL of onchain raw-account rent at the observed devnet rent rate.
   The contract supports hash-verified offchain sources. Pinata folder CID
   `QmQHjVHJUhr69P3s15fjcdKhc49GwENbXBjLjo46qbiSQT` was pinned on
   2026-09-30, and all 26 circuits were fetched and SHA-256 verified through
   the dedicated HTTPS gateway. An offchain-source `arcium build` completed
   with that URL embedded. The 10-SOL wallet remains below the estimated
   program upload and rent requirement before MXE setup. Additional funding,
   confirmed Arcium MXE admission, program deployment, and live market
   initialization remain. The SBF build emitted stack-frame diagnostics in
   fee account validation despite exiting successfully; those paths need
   targeted runtime verification before launch. There is no verified deployed
   MXE, live market, published SDK, keeper fleet, funded insurance, or external
   security review to cite. The deferred hosted client is outside this
   implementation pass.

## Verification

- `pnpm build`, `pnpm typecheck`, and `pnpm test` pass locally: 28 trader SDK,
  11 maker SDK, and 19 server tests at this revision.
- `cargo test --manifest-path contracts/Cargo.toml -p depth --lib --offline`
  passed 16 Rust unit tests. `pnpm --dir contracts typecheck` passed. Live
  Arcium runs compile the contract and encrypted circuits.
- Docker-backed Solana and Arcium base tests passed all four cases on
  2026-09-29. The separate confidential trade case passed end to end with four
  active quotes from two makers on 2026-09-29 in 13 minutes, including
  settlement, margin operations, risk checks, and three-account committee
  winddown. Oracle fixture timing and a malformed recovery RPC filter found in
  earlier runs were corrected before this pass.

The source and local tests support further integration work. They do not yet
support the complete SDK flow or a real-collateral launch claim.
