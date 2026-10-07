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
| `scripts/` | Build automation and devnet verification commands |
| `keys/` | Local signer keys and recovery custody data, ignored by Git |
| `deployments/` | Generated signed manifests and committee configuration, ignored by Git |
| `artifacts/` | Generated devnet verification records, ignored by Git |
| `.tools/` | Verified local Arcium binaries, ignored by Git |

## Development

Install Anchor CLI 1.0.2, Solana CLI 3.1.10,
Rust 1.89.0, Docker, Bun, and pnpm. The contracts need
[Arcium's development dependencies](https://docs.arcium.com/developers/installation).

```sh
pnpm install --frozen-lockfile
pnpm --dir contracts install --frozen-lockfile
pnpm tools:setup
```

Contract integration tests create their own signer at `keys/localnet/wallet.json`.
Devnet uses a separate deployer at `keys/devnet/deployer.json` and retains the
program identity at `keys/devnet/program.json`. These private files must be
provisioned independently of the Git checkout and kept outside generated build
directories. The build command verifies and links the configured program
identity into Anchor's build directory when it is present; an explicitly
configured missing key or a different identity is rejected. Deployment always
requires the durable program and deployer keys.

`toolchain.json` pins the Arcium compiler/test and deployment binaries with
SHA-256 checksums for Apple Silicon and x86 Linux. `pnpm tools:setup` downloads
them from Arcium's official host into the ignored `.tools/` directory without
changing the global CLI. `pnpm tools:setup --check` verifies the installation.
Optional `DEPTH_ARCIUM_BUILD_CLI` and `DEPTH_ARCIUM_DEPLOY_CLI` overrides accept
an executable path or command name and must match the pinned hash and version.

Build the program and encrypted instructions from `contracts/`, then refresh
the generated TypeScript binding and run the workspace checks:

```sh
pnpm --dir contracts build
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

All configured file paths resolve from the repository root, including commands
run from a package directory; absolute paths support mounted signer secrets.
Deployment scripts and services share one signer loader, which validates
key material and required public identities. Set `DEPTH_DEVNET_MANIFEST_PATH` to
`deployments/devnet/manifest.json` to serve the signed devnet deployment.

After deploying a market, the keeper uses `SOLANA_RPC_URL` and needs
`DEPTH_KEEPER_KEYPAIR_PATH` pointing to its Solana signer. The default
`PYTH_ORACLE_MODE=sponsored` reads the configured Pyth SOL/USD feed without a
Hermes API key:

```sh
pnpm --dir server keeper
```

The devnet example uses `keys/devnet/deployer.json` for the keeper. A production
keeper should use its own funded signer.

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
cluster's key recovery instruction uses its account layout. The toolchain
resolver selects this version for deployment; compilation and local tests
remain pinned to 0.13.2 alongside the Rust and TypeScript Arcium dependencies.

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
`DEPTH_RECOVERY_ENVELOPES_PATH` to a private output path. The example paths are
`deployments/devnet/committee.json` and `keys/devnet/recovery/envelopes.json`.
Then run:

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

Use the root environment without putting the RPC URL in command arguments:

```sh
pnpm devnet:manifest VERSION EXPIRY_UNIX deployments/devnet/manifest.json
```

The manifest signer must be the deployed program's upgrade authority. Set
`DEPTH_DEVNET_MANIFEST_PATH` or `DEPTH_MAINNET_MANIFEST_PATH` to the signed
JSON file on the public service. The service publishes it at
`/.well-known/depth/<environment>.json`; SDKs verify the signature, network,
program, MXE, and market configuration against Solana. The Node-only committee
tools are available from `@depth/sdk/operator`.

## Devnet verification

After deploying and signing a manifest, initialize the demo app and accounts:

```sh
pnpm keys:setup devnet
pnpm devnet:setup
pnpm devnet:audit
```

The key setup command explicitly creates missing demo identities, preserves
existing identities, and rejects invalid keys. Deployers and program keys are
provisioned independently.
The setup command loads the configured app and trader signers and
funds their Solana transaction costs from the deployer when needed. Fund the
trader with devnet USDC before running the live quote and trading proof:

```sh
pnpm devnet:quote
pnpm devnet:callbacks
```

The quote command submits real devnet transactions, validates quote tiers,
checks oracle reservation protection, and runs deposit, allocation, open,
close, release, withdrawal, and fee claims through the SDK and settlement
services. It saves operation IDs and nonces to `artifacts/devnet/quote-proof.json`
and refuses to start another proof over an interrupted mutation. The callback
command verifies finalized Arcium callbacks and circuit hashes without
submitting transactions. `pnpm devnet:audit` reads the current deployment.

An interrupted trade can be recovered with `depth.trade.flow(clientNonce)`;
its order and margin allocation are linked by that nonce. A restarted maker
can inspect `maker.quote.list()` and recover a replacement with
`maker.quote.replacement(priorQuoteId, replacementNonce)`. The prior quote
records the successor nonce onchain before it stops. If a successor quote was
never submitted, the maker supplies fresh quote terms to resume publication.
