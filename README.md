# Depth

Depth is a shared confidential perpetual trading protocol for Solana. Trading
apps connect to a common clearing venue where collateralized makers compete to
fill orders. The first market is a SOL perpetual with USDC collateral and
settlement.

The [protocol specification](depth.md) describes the market model, privacy
boundary, architecture, and requirements for trading.

## Repository

| Directory | Purpose |
| --- | --- |
| `contracts/` | Solana program, Arcium computations, and integration tests |
| `packages/` | Bindings, shared schemas, and trader and maker SDKs |
| `client/` | Hosted trading interface workspace |
| `server/` | Public state API and settlement, oracle, risk, and fee workers |
| `scripts/` | Repository automation |

For contract development, see [contracts/README.md](contracts/README.md).
After rebuilding the contracts, run `pnpm sync:bindings` at the repository
root to refresh the generated IDL and TypeScript binding. The public API's
run instructions are in [server/README.md](server/README.md).
