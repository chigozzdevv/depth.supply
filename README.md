# Depth

Depth is a shared confidential perpetual trading protocol on Solana. Trading
apps connect to one clearing venue where collateralized makers compete to fill
orders. The first market is a SOL perpetual with USDC collateral and settlement.

[depth.md](depth.md) defines the market, privacy model, economics, and protocol
requirements.

## Repository

| Directory | Purpose |
| --- | --- |
| `contracts/` | Solana program, Arcium computations, and integration tests |
| `packages/` | Bindings, schemas, and trader and maker SDKs |
| `server/` | Public API and market workers |
| `scripts/` | Build and binding automation |

## Development

Install the pinned Arcium CLI 0.13.2, Anchor CLI 1.0.2, Solana CLI 3.1.10,
Rust 1.89.0, Docker, Bun, and pnpm. The contracts need
[Arcium's development dependencies](https://docs.arcium.com/developers/installation).

```sh
pnpm install --frozen-lockfile
pnpm --dir contracts install --frozen-lockfile
```

For a fresh checkout, create a local test signer at
`contracts/target/test-wallet.json` before running the integration tests:

```sh
mkdir -p contracts/target
solana-keygen new --no-bip39-passphrase --silent --outfile contracts/target/test-wallet.json
```

Build the program and encrypted instructions from `contracts/`, then refresh
the generated TypeScript binding and run the workspace checks:

```sh
cd contracts
avm use 1.0.2
arcium build
cd ..
pnpm sync:bindings
pnpm build
pnpm typecheck
pnpm test
pnpm --dir contracts test
```

The contract tests use Docker-backed local Solana and Arcium nodes. The trader
and maker SDKs are private workspace packages; their entry points are
`create_depth` from `@depth/sdk` and `create_depth_maker` from
`@depth/maker-sdk`. Both require a wallet, RPC connection, and deployment
policy. Public deployments use a signed manifest; local validators use
`deployment: { localnet: true }`.

## Configuration and services

Copy [`.env.example`](.env.example) to a root `.env.local` if one does not
already exist. Keep `.env.local` private. The public API uses `SOLANA_RPC_URL`:

```sh
pnpm --dir server start
```

After deploying a market, the keeper needs `DEPTH_RPC_URL` and
`DEPTH_KEEPER_KEYPAIR_PATH` pointing to its Solana signer. The default
`PYTH_ORACLE_MODE=sponsored` reads the configured Pyth SOL/USD feed without a
Hermes API key:

```sh
pnpm --dir server keeper
```

The optional Hermes publisher runs separately with `PYTH_ORACLE_MODE=hermes`
and `PYTH_API_KEY`:

```sh
pnpm --dir server publisher
```

## Public circuit hosting

Compiled circuits are stored in `contracts/build/`. Verify their local hashes
before upload. The Pinata uploader uses `PINATA_JWT` and
`PINATA_GATEWAY_HOST` from the root `.env.local`, pins the files, and verifies
each file through the public HTTPS gateway:

```sh
pnpm --dir contracts verify:circuits --local
pnpm --dir contracts upload:circuits
```

Use the verified `DEPTH_CIRCUIT_BASE_URL` printed by the uploader when running
`arcium build` for a public deployment. After deployment, release operators can
capture and sign the deployed configuration with:

```sh
bun packages/sdk/scripts/manifest.ts RPC_URL SIGNER_FILE VERSION EXPIRY_UNIX OUTPUT_FILE
```
