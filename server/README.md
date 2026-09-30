# Depth public API

The Fastify service reads confirmed public state directly from the Depth Solana program.
It never accepts orders, private keys, or plaintext quote prices.

Run `pnpm install` from the repository root, copy `.env.example` to `.env.local`
at the root, then set `SOLANA_RPC_URL` and run `pnpm --dir server start`.
The server commands load that root env file. `HOST` defaults to `127.0.0.1`
and `PORT` to `8787`.
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

Set `DEPTH_RPC_URL` to the RPC endpoint and `DEPTH_KEEPER_KEYPAIR_PATH` to a
local Solana keypair JSON file. `DEPTH_KEEPER_KEYPAIR` also accepts the keypair
JSON array directly; configure only one signer source. Set
`PYTH_ORACLE_MODE=sponsored` for the devnet demo; this is the default and does
not require `PYTH_API_KEY`. The keeper reads Pyth's sponsored SOL/USD push feed
on shard 0 and submits verified updates to the Depth market. Set
`DEPTH_PRICE_ACCOUNT` to a maintained Pyth SOL/USD price-update account when
using a different feed account, including localnet. Its owner, discriminator,
verification level, feed, freshness, and confidence are validated before the
market accepts an update. `DEPTH_ORACLE_INTERVAL_MS` defaults to `10000`. Run
`pnpm --dir server keeper`. The keeper wallet pays Solana and Arcium queue
fees and needs SOL. It has no custody permission.

Oracle refresh waits while a settlement holds the market lock, preserving its
price snapshot. Recipient free-balance accounts must exist before fee claims
can begin. SIGINT and SIGTERM stop the worker after the current iteration.

## Hermes publisher

Set `PYTH_ORACLE_MODE=hermes` and run `pnpm --dir server publisher` as a separate
supervised process with `DEPTH_RPC_URL`, a keeper signer source, and
`PYTH_API_KEY`. The publisher refuses to start in sponsored mode or without the
API key. The signer needs SOL for Pyth receiver updates. The publisher fetches a
verified SOL/USD proof from Hermes when the persistent feed account is at least
75 seconds old, submits the Pyth receiver transactions, and checks the
confirmed account's publish time.
It does not write a market price directly; the keeper's oracle worker refreshes
the Depth market from that account.

`DEPTH_PYTH_SHARD_ID` defaults to 0 and must derive the configured
`DEPTH_PRICE_ACCOUNT`. `PYTH_HERMES_URL` defaults to Pyth's HTTPS Hermes
endpoint. `DEPTH_PUBLISH_AFTER_SECONDS`, `DEPTH_PUBLISH_INTERVAL_MS`, and
`DEPTH_PUBLISH_HEALTH_PORT` default to 75, 10000, and 8788. Monitor
`http://127.0.0.1:8788/healthz`; it returns 503 when the verified feed is stale
or unavailable. Run the keeper and publisher under separate process
supervisors and alert on an unhealthy feed.
