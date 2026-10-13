# Depth

Shared confidential perpetuals infrastructure on Solana, powered by Arcium.
Apps bring traders; collateralized makers compete to fill encrypted orders in
one clearing venue. The first market is SOL perpetuals, collateralized and
settled in USDC.

[Trade](https://trydepth.xyz/demo/trade) ·
[Make markets](https://trydepth.xyz/demo/maker) ·
[Documentation](https://trydepth.xyz/docs) ·
[Protocol design](depth.md)

## How it works

1. Apps register an app ID and choose their app fee.
2. Traders deposit USDC and submit encrypted orders with margin and price limits.
3. Makers commit collateral and publish encrypted quotes, manually or through automation.
4. Arcium selects eligible liquidity and computes private account updates; Solana settles the result.

Maker automation maintains bid and ask prices, renews quotes, tracks fills,
and reclaims terminal quote rent. Optional Hyperliquid hedging offsets aggregate
maker inventory using a separately funded account and approved agent.

| Private                                                | Public                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Order terms, quote prices, positions, account balances | Wallet addresses, markets, transaction activity, token and margin transfers |

The public demo runs on Solana devnet and Hyperliquid testnet. Its emergency
recovery committee is controlled by Depth; independent recovery custody is
required before claiming privacy from Depth itself. External hedges are public
and can reveal clues about maker inventory.

## Integrate

```sh
npm install @depthhq/sdk
```

Use a connected Solana wallet adapter with `publicKey`, `signTransaction`, and
`signAllTransactions`. Register once with the app owner's wallet, then save the
confirmed `appId` for your integration.

```ts
import { create_depth } from "@depthhq/sdk";

const admin = await create_depth({
  environment: "devnet",
  wallet: appOwnerWallet,
});

const registration = await admin.app.register({ feeBps: 1 });
const { appId } = await registration.confirm();

const depth = await create_depth({
  environment: "devnet",
  wallet: traderWallet,
  appId,
});

const deposit = await depth.account.deposit(25_000_000n);
await deposit.confirm();

const trade = await depth.trade.submit({
  marketId: "SOL-USD",
  direction: "long",
  notional: 20_000_000n,
  margin: 5_000_000n,
  slippageBps: 50,
  maxFee: 20_000n,
  validForSeconds: 60,
});

await trade.confirm();
const fill = await trade.privateResult();
```

USDC amounts use six decimals: `1_000_000n` is 1 USDC. SOL pays network and
computation costs. Confirmation waits for settlement; submitting an order does
not guarantee a fill. See [order recovery](https://trydepth.xyz/docs/trading/recovery)
for interrupted operations and [funding](https://trydepth.xyz/docs/trading/funding)
for allocation and withdrawals.

### Makers

```sh
npm install @depthhq/maker-sdk
```

```ts
import { create_depth_maker } from "@depthhq/maker-sdk";

const maker = await create_depth_maker({
  environment: "devnet",
  wallet: makerWallet,
});

const deposit = await maker.account.deposit(50_000_000n);
await deposit.confirm();

const allocation = await maker.account.allocate({
  marketId: "SOL-USD",
  amount: 50_000_000n,
});
await allocation.confirm();

const setup = await maker.automation.configure({
  quote: {
    maxCapacity: 100_000_000n,
    maxInventoryNotional: 500_000_000n,
    spreadBps: 20,
    repriceBps: 10,
    lifetimeSeconds: 120,
    refreshSeconds: 60,
  },
});

await maker.automation.approve(setup);
await maker.automation.start();
```

Managed automation also needs `signMessage`. Review its operator, private-view
grant, and SOL funding before approval; the operator cannot withdraw collateral.
The default grant lasts 24 hours. See
[automation](https://trydepth.xyz/docs/makers/automation) for permissions and
hedging, or [quotes](https://trydepth.xyz/docs/makers/quotes) to run your own maker.

## Repository

| Directory    | Contents                                                   |
| ------------ | ---------------------------------------------------------- |
| `client/`    | Next.js landing, documentation, trader and maker terminals |
| `contracts/` | Solana program, Arcium computations and integration tests  |
| `packages/`  | Trader SDK, maker SDK, bindings and schemas                |
| `server/`    | Fastify API, keeper and maker supervisor                   |
| `scripts/`   | Build, release and verification tools                      |
| `deploy/`    | Container build and service configuration                  |

## Development

Install Node.js, pnpm 10.18.0 and Bun. Use the existing devnet deployment to run
the client locally:

```sh
pnpm install --frozen-lockfile
node scripts/build-package.mjs bindings schema sdk maker-sdk
DEPTH_SERVICE_URL=https://api.trydepth.xyz pnpm dev
```

For your own services, copy `.env.example` to the root `.env.local`, configure
your RPC, deployment manifest, funded keeper signer and automation secret, then
run `pnpm services:start`. Use `pnpm services:status` and `pnpm services:stop` to
inspect and stop them. Keys, environment files and durable worker state are
excluded from Git.

```sh
pnpm typecheck
pnpm test
pnpm build
```

Contract development additionally requires Docker, Rust, Solana CLI, Anchor,
and the pinned Arcium tools:

```sh
pnpm --dir contracts install --frozen-lockfile
pnpm tools:setup
pnpm --dir contracts build
pnpm sync:bindings
pnpm --dir contracts test
```
