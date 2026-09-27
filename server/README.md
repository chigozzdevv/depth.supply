# Depth public API

The Fastify service reads confirmed public state directly from the Depth Solana program.
It never accepts orders, private keys, or plaintext quote prices.

Run `pnpm install` from the repository root, then set `SOLANA_RPC_URL` and run
`pnpm --dir server start`. `HOST` defaults to `127.0.0.1` and `PORT` to `8787`.
The server uses Bun to run TypeScript with the repository's `@/` imports.
`src/features/` holds the app, market, quote, operation, recovery, settlement, oracle, risk, and fee
features. HTTP routes, controllers, schemas, services, and decoded account models
stay in their feature. `src/shared/` holds configuration, the Solana account
reader, and HTTP helpers used across features. The shared chain client verifies
the Depth program owner and account discriminator.

The read routes are `GET /v1/markets`, `/v1/markets/SOL-USD`,
`/v1/markets/SOL-USD/recovery`, `/v1/markets/SOL-USD/winddown`,
`/v1/quotes/{address}`, `/v1/operations/{address}`, and `/v1/apps/{address}`.
Responses contain a confirmed Solana slot and only public account fields.
The recovery route publishes the market's five committee signers, three-signature
threshold, recovery public key, and registered account count. The winddown
route reports the fixed settlement price, reveal progress, and remaining payout
pool once an emergency settlement begins.

## Market workers

The keeper is a separate process that reads the market's pending order address
and submits the next permissionless settlement instruction. It advances matched
trades through risk approval, account sealing, and final clearing. It also
reconciles expired orders and advances a prepared fee claim. The same process
refreshes verified Pyth prices, scans ready accounts for private liquidation
checks, and initiates unclaimed trade-fee distributions. Account scans cache
addresses and fetch bounded batches; risk and fee tasks alternate to avoid starvation. Every step uses the
confirmed onchain status, so restarting the process resumes the same workflow.

Set `DEPTH_RPC_URL` and `DEPTH_KEEPER_KEYPAIR` to the RPC endpoint and a
JSON array containing the keeper wallet's secret-key bytes. Set
`DEPTH_PRICE_ACCOUNT` to a maintained Pyth SOL/USD price-update account. Its
owner, discriminator, verification level, feed, freshness, and confidence are
validated before the market accepts an update. The price publisher must update
that account independently. `DEPTH_ORACLE_INTERVAL_MS` defaults to `10000`. Run
`pnpm --dir server keeper`. The keeper wallet pays Solana and Arcium queue
fees and needs SOL. It has no custody permission.

Oracle refresh waits while a settlement holds the market lock, preserving its
price snapshot. Recipient free-balance accounts must exist before fee claims
can begin. SIGINT and SIGTERM stop the worker after the current iteration.
