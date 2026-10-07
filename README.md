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

Install Arcium CLI 0.13.2 for builds, Anchor CLI 1.0.2, Solana CLI 3.1.10,
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

The contract tests use Docker-backed local Solana and Arcium nodes and cover
fee claims and maker default winddown in separate validator runs. Apps use
`create_depth` from `@depth/sdk`; makers use `create_depth_maker` from
`@depth/maker-sdk`. Each client accepts `environment: "devnet"` and a wallet.
The maker owner defaults to the connected wallet; a delegated bot sets
`makerOwner` to the owner's public key. A local validator uses
`environment: "localnet"`. RPC, service URL, and signed manifest overrides
remain available for custom deployments.

## Configuration and services

Copy [`.env.example`](.env.example) to a root `.env.local` if one does not
already exist. Keep `.env.local` private. The public API uses `SOLANA_RPC_URL`:

```sh
pnpm --dir server start
```

After deploying a market, the keeper uses `SOLANA_RPC_URL` and needs
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

Set the verified `DEPTH_CIRCUIT_BASE_URL` printed by the uploader in the root
`.env.local`, then run `pnpm --dir contracts build`. The build command loads
the root environment and selects the pinned Anchor version.
The devnet deployment command checks the signer, program identity, hosted
circuits, cluster, and rent before creating the program and MXE:

Use Arcium CLI 0.15.0 for the devnet deployment command because the live
cluster's key recovery instruction uses its account layout. Set
`DEPTH_ARCIUM_CLI` to the 0.15.0 executable if the default `arcium` command is
still 0.13.2. The deployed computation definitions remain pinned to circuits
compiled with 0.13.2.

```sh
pnpm --dir contracts deploy:devnet --check
pnpm --dir contracts deploy:devnet
pnpm --dir contracts init:defs
pnpm --dir contracts init:protocol
```

For an existing program, pause trading and finish pending computations before
upgrading. Rebuild with the verified circuit URL, then run:

```sh
pnpm --dir contracts deploy:devnet --check --upgrade
pnpm --dir contracts deploy:devnet --upgrade
pnpm --dir contracts init:defs
```

Changed circuits use new versioned definitions; existing definitions stay
available for historical verification. Sign a new deployment manifest after
the upgrade and definition initialization.

The protocol setup uses Circle's devnet USDC mint and verifies its vault.
The devnet market policy is in `contracts/config/devnet-market.json`. Provide
five committee signer public keys and X25519 encryption public keys in a JSON
array of `{ "signer": "...", "encryptionKey": "<base64>" }` entries. Set
`DEPTH_RECOVERY_COMMITTEE_PATH` to that file and
`DEPTH_RECOVERY_ENVELOPES_PATH` to a private output path. Relative paths start
in `contracts/`. Then run:

```sh
pnpm --dir contracts init:market
```

The command saves five encrypted recovery shares before creating the draft
market. Each committee member must receive its own envelope and retain its
private keys independently.

After initializing the market, release operators can
capture and sign the deployed configuration with:

```sh
bun packages/sdk/scripts/manifest.ts RPC_URL SIGNER_FILE VERSION EXPIRY_UNIX OUTPUT_FILE
```

The manifest signer must be the deployed program's upgrade authority. Set
`DEPTH_DEVNET_MANIFEST_PATH` or `DEPTH_MAINNET_MANIFEST_PATH` to the signed
JSON file on the public service. The service publishes it at
`/.well-known/depth/<environment>.json`; SDKs verify the signature, network,
program, MXE, and market configuration against Solana. The Node-only committee
tools are available from `@depth/sdk/operator`.

An interrupted trade can be recovered with `depth.trade.flow(clientNonce)`;
its order and margin allocation are linked by that nonce. A restarted maker
can inspect `maker.quote.list()` and recover a replacement with
`maker.quote.replacement(priorQuoteId, replacementNonce)`. The prior quote
records the successor nonce onchain before it stops. If a successor quote was
never submitted, the maker supplies fresh quote terms to resume publication.
