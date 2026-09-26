# Depth public API

The service reads confirmed public state directly from the Depth Solana program.
It never accepts orders, private keys, or plaintext quote prices.

Run `pnpm install` from the repository root, then set `SOLANA_RPC_URL` and run
`pnpm --dir server start`. `HOST` defaults to `127.0.0.1` and `PORT` to `8787`.
The server uses Bun to run TypeScript with the repository's `@/` imports.

The read routes are `GET /v1/markets`, `/v1/markets/SOL-USD`,
`/v1/quotes/{address}`, `/v1/operations/{address}`, and `/v1/apps/{address}`.
Responses contain a confirmed Solana slot and only public account fields.

## Settlement keeper

The keeper is a separate process that reads the market's pending order address
and submits the next permissionless settlement instruction. It advances matched
trades through risk approval, account sealing, and final clearing. It also
reconciles expired orders and advances a prepared fee claim. Every step uses the
confirmed onchain status, so restarting the process resumes the same workflow.

Set `DEPTH_RPC_URL` and `DEPTH_KEEPER_KEYPAIR` to the RPC endpoint and a
JSON array containing the keeper wallet's secret-key bytes, then run
`pnpm --dir server keeper`. The keeper wallet pays Solana and Arcium queue
fees and needs SOL. It has no custody permission.
