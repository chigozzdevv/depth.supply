# Depth public API

The service reads confirmed public state directly from the Depth Solana program.
It never accepts orders, private keys, or plaintext quote prices.

Run `pnpm install` from the repository root, then set `SOLANA_RPC_URL` and run
`pnpm --dir server start`. `HOST` defaults to `127.0.0.1` and `PORT` to `8787`.
The server uses Bun to run TypeScript with the repository's `@/` imports.

The read routes are `GET /v1/markets`, `/v1/markets/SOL-USD`,
`/v1/quotes/{address}`, `/v1/operations/{address}`, and `/v1/apps/{address}`.
Responses contain a confirmed Solana slot and only public account fields.
