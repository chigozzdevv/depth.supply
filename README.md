# Depth

Depth is a shared confidential perpetual trading protocol on Solana. Trading
apps connect to one clearing venue where collateralized makers compete to fill
orders. The first market is a SOL perpetual with USDC collateral and settlement.

[depth.md](depth.md) defines the market, privacy model, economics, and protocol
requirements.

## Repository

| Directory      | Purpose                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `client/`      | Next.js landing page, trader terminal, and maker terminal              |
| `contracts/`   | Solana program, Arcium computations, and integration tests             |
| `packages/`    | Bindings, schemas, and trader and maker SDKs                           |
| `server/`      | Public API and market workers                                          |
| `scripts/`     | Build automation and devnet verification commands                      |
| `keys/`        | Local signer keys and recovery custody data, ignored by Git            |
| `deployments/` | Generated signed manifests and committee configuration, ignored by Git |
| `dist/`        | Generated SDK release files, ignored by Git                            |
| `data/`        | Durable worker and devnet workflow checkpoints, ignored by Git         |
| `.tools/`      | Verified local Arcium binaries, ignored by Git                         |

## Development

Install Anchor CLI 1.0.2, Solana CLI 3.1.10,
Rust 1.89.0, Docker, Bun, and pnpm. The contracts need
[Arcium's development dependencies](https://docs.arcium.com/developers/installation).

```sh
pnpm install --frozen-lockfile
pnpm --dir contracts install --frozen-lockfile
pnpm tools:setup
```

Build the SDKs and run the API and client in separate terminals:

```sh
node scripts/build-package.mjs bindings schema sdk maker-sdk
pnpm --dir server start
pnpm dev
```

The client uses Next.js, Tailwind CSS, Lucide icons, Solana Wallet Standard,
and Lightweight Charts. `/demo/trade` supports funding, encrypted trades,
position management, and canonical operation receipts. `/demo/maker` supports
collateral, encrypted quotes, replacements, fills, and delegated quote operators.
Both interfaces call the public SDK exports and use the same contract flow
as an integrating app. Build with `pnpm build`, then run
`pnpm --dir client start`. Client checks are
`pnpm --dir client lint`, `pnpm --dir client typecheck`, and
`pnpm --dir client format:check`.

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
`create_depth` from `@depthhq/sdk`; makers use `create_depth_maker` from
`@depthhq/maker-sdk`. Each client accepts `environment: "devnet"` and a wallet.
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

The maker worker uses a dedicated operator signer with an owner-approved quote
and private-view grant. Set `DEPTH_MAKER_OWNER` to the maker's public key and
`DEPTH_MAKER_KEYPAIR_PATH` to the operator signer, then configure capacity,
inventory, spread, and refresh limits in the root environment:

```sh
pnpm maker
```

It quotes around the pinned oracle, stops when prices or funding are stale,
and caps capacity by available equity and inventory. It records quote nonces
before submission and restores quote replacements and finalized fill cursors
from `data/maker/`. One process may hold a wallet's checkpoint lease. Mount
that directory on durable storage when hosting the worker; `/healthz` on port
8789 reports progress. Optional Hyperliquid hedging follows the configured
maker risk policy. The maker owner can reclaim terminal quote rent with
`maker.quote.get(quoteId).close()` after replacement publication and attached
orders have settled.

The operator needs SOL for rent and Arcium computation fees. New quotes stop
below `DEPTH_MAKER_GAS_RESERVE_LAMPORTS`, which defaults to 50000000 lamports
(0.05 SOL), preserving a cancellation budget. Replenish the operator's fee
balance to resume; the worker does not transfer funds from the owner.

The optional Hermes publisher runs separately with `PYTH_ORACLE_MODE=hermes`
and `PYTH_API_KEY`:

```sh
pnpm --dir server publisher
```

## App integration and market data

Register an app with `create_depth({ environment, wallet: appOwnerWallet })`,
call `admin.app.register({ feeBps })`, then obtain `appId` from the confirmed
registration. Trader clients pass that public ID to `create_depth`; maker
owners use `create_depth_maker`. `DEPTH_APP_ID` overrides the hosted demo's
registered devnet app. Localnet requires an explicit registered app ID.
`DEPTH_ENVIRONMENT` selects devnet or localnet. `DEPTH_SERVICE_URL` selects the
API used by the Next.js server. The client proxies that service and the
configured RPC through its own origin, keeping provider credentials on the
server. External apps can use their own RPC and service URLs as SDK overrides.

Public market data does not require a wallet:

```ts
import { create_depth_data } from "@depthhq/sdk";

const data = create_depth_data({ environment: "devnet" });
const market = await data.market("SOL-USD");
const history = await data.candles("SOL-USD", { interval: "15m", limit: 200 });
const stop = data.subscribe({
  marketId: "SOL-USD",
  interval: "15m",
  onUpdate: (page) => updateChart(page.items),
  onError: (error) => showDataError(error),
});
```

Chart-only integrations can import the same data client from `@depthhq/sdk/data`
to keep confidential transaction code out of their initial bundle. The hosted
interfaces load transaction SDKs when a wallet connects.

Candles are SOL reference prices from Hyperliquid. They do not disclose Depth
executions, volume, or open interest. The contract's pinned Pyth account
determines settlement prices. The API validates OHLC values, caches and
deduplicates upstream requests, supports older-page cursors, and streams updates.
Cached live prices are explicitly marked stale and expire after five minutes;
unavailable prices are never replaced with generated candles.

Private account views require explicit wallet approval. The UI holds decrypted
results and unpublished private trade terms in memory and clears them when the
wallet changes. `account().pending()` and `account().history()` discover
canonical receipts from Solana after reconnecting or changing browsers.
If a trade stops after allocating margin and before submitting its order,
`trade.unpairedAllocations()` identifies that allocation. Its collateral remains
in the market and can be inspected and released through the ordinary account
flow; unpublished private order terms must be supplied again.

Maker fill subscriptions use IndexedDB checkpoints in browsers and atomic
private files in Node. Checkpoints contain receipt cursors, not decrypted fills.

Activity reads transaction signatures, public transfer amounts, and block times
from canonical receipts. `depth.history.execution(nonce)` requests authorized
private fills and reconstructs the prior entry basis, margin, and funding in
settlement order. Closed execution PnL remains recoverable after a reload
without persisting private fills or decryption keys in the browser.
`depth.trade.operation(nonce).pnl()` uses that recovery path for a rediscovered
trade. A missing archival transaction is reported explicitly.

`pnpm sdk:pack` builds all four SDK packages and writes publishable tarballs
and their SHA-256 hashes to `dist/sdk/`. Packed dependencies use release
versions rather than workspace aliases. `pnpm sdk:publish --check` verifies
the release and npm account; `pnpm sdk:publish` publishes dependencies first
and verifies registry integrity. It accepts `NPM_TOKEN` from the root `.env.local`
or the existing npm login. A publishing token needs read and write access to
the `@depthhq` scope and npm's Bypass 2FA permission. The token is never bundled
into SDK or client code.

Accepted uploads are recorded in `dist/sdk/publishing.json` while npm
processes them. Rerun `pnpm sdk:publish` to resume verification without uploading
the same version twice.

## Hyperliquid maker hedging

The Node maker SDK supports optional SOL inventory hedging on Hyperliquid.
The maker supplies collateral separately on each venue and approves a dedicated
Hyperliquid agent wallet. The account must be dedicated to this strategy.

```ts
import { create_maker_bot, create_hyperliquid, HedgeEngine } from "@depthhq/maker-sdk/node";

const adapter = await create_hyperliquid({
  network: "testnet",
  account: hedgeAccountAddress,
  wallet: approvedAgentWallet,
});
const bot = await create_maker_bot({
  maker,
  policy: quotePolicy,
  stateDirectory,
  hedge: new HedgeEngine(adapter, hedgePolicy),
});

try {
  await bot.tick();
} finally {
  await bot.close();
}
```

`hedgePolicy` defines `ratioBps`, `thresholdNotional`, `maxUnhedgedNotional`,
`maxOrderNotional`, `batchMs`, `maxUnhedgedMs`, `maxSlippageBps`,
`maxPriceAgeMs`, `orderTtlMs`, and `maxLeverage`. Notional amounts use micro-USDC.
The reference policy in `.env.example` is for a small devnet demo and requires
capital and risk calibration before use with real funds.

Set `HYPERLIQUID_ACCOUNT_ADDRESS`, `HYPERLIQUID_AGENT_PRIVATE_KEY`, and
`HYPERLIQUID_NETWORK=testnet` in the root `.env.local`. The setup command uses
`HYPERLIQUID_ACCOUNT_PRIVATE_KEY` to approve the agent and select 1x cross
leverage after checking funding:

```sh
pnpm devnet:hedge
```

The testnet account needs HyperCore USDC. Solana devnet USDC is separate.
Hyperliquid's [faucet](https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/testnet-faucet)
requires a prior mainnet deposit from the same address. An existing funded
Hyperliquid testnet account can also transfer testnet USDC to it.

Set `DEPTH_MAKER_HEDGE=hyperliquid` and run `pnpm maker`. The worker uses only
the agent key; production workers should receive only their scoped credentials.
Solana devnet pairs with Hyperliquid testnet, and Solana mainnet pairs with
Hyperliquid mainnet. The SDK setup helper also accepts an owner wallet instead
of a private key. External funding and setup are explicit operations.

Hedges follow finalized aggregate maker inventory. The engine reconciles actual
fills, batches small changes, uses independent external prices, and persists
orders before submission. It stops quoting on stale data, excessive exposure,
or uncertain expired orders. Retries retain the signed nonce and expiry;
unresolved outcomes require reconciliation. A reversal reduces the prior hedge
before opening the opposite side. Stopping the worker does not close positions.

One host and one worker per hedge account must share durable `data/maker`
storage. The account journal survives operator changes and contains no keys.
Private file permissions protect the saved quote and hedge order terms;
filesystem synchronization precedes network submission. Multiple hosts need a
distributed lease before using the same account.

The maker demo's Hedges tab uses `maker.hedges.authorize()` followed by
`maker.hedges.summary()`. Owner wallet signatures create short-lived sessions.
Views and session tokens stay in memory and are cleared on wallet changes.
The public market endpoints do not return maker inventory or hedge mappings.

Hyperliquid hedge activity is public. Linking its account to a maker can reveal
individual trading clues, and full hedging can reveal aggregate maker inventory.
Depth's quotes and trader inputs remain encrypted. The authorized maker worker
can read its maker's views; this is part of the maker's existing access scope.
Predictable pricing policies can reveal bid/ask prices through inference.

With a funded and approved account, run the combined live proof:

```sh
pnpm devnet:quote --hedge
```

The proof checks external margin before Depth writes, opens a 20 USDC Depth
trade, confirms the aggregate hedge, closes the Depth position, and confirms the
external unwind while the ordinary settlement keeper processes callbacks.

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
tools are available from `@depthhq/sdk/operator`.

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
pnpm devnet:bot
pnpm devnet:history
```

The quote command submits real devnet transactions, validates quote tiers,
checks oracle reservation protection, and runs deposit, allocation, open,
close, release, withdrawal, and fee claims through the SDK and settlement
services. It saves operation IDs and nonces to `data/devnet/quote.json`
and refuses to start another proof over an interrupted mutation. The callback
command verifies finalized Arcium callbacks and circuit hashes without
submitting transactions. Verification results are printed to the terminal.
`pnpm devnet:audit` reads the current deployment.

An interrupted trade can be recovered with `depth.trade.flow(clientNonce)`;
its order and margin allocation are linked by that nonce. A restarted maker
can inspect `maker.quote.list()` and recover a replacement with
`maker.quote.replacement(priorQuoteId, replacementNonce)`. The prior quote
records the successor nonce onchain before it stops. If a successor quote was
never submitted, the maker supplies fresh quote terms to resume publication.
