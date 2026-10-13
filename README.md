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

## Proof of execution

We have executed the complete trading flow on Solana devnet, with encrypted
matching and settlement through Arcium and maker hedging on Hyperliquid testnet.
The trade used **30 USDC exposure**, **10 USDC collateral**, and **0.5% slippage**.

### Trader execution

| Operation         | Result                                    | Transaction hash                                                                                                                                   |
| ----------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deposit USDC      | 5.366540 USDC deposited                   | [TNwduhuS…1tVZMWMF](https://solscan.io/tx/TNwduhuS9pAQZPwfdFe7xmKADriXTQzzCYxdayQcbshZtYfGnWMM2jmKyKnJWLHNjhKjmboRyDG1VQb1tVZMWMF?cluster=devnet)  |
| Credit deposit    | Arcium credited the private balance       | [22Y1SMbF…4dZyWGwj](https://solscan.io/tx/22Y1SMbFU3cnvFQcyAF4865VMbDXYuqEU2GztrggaZarcXDnjCH3pRrG9EYcM9FV847JyizbfgUx5h344dZyWGwj?cluster=devnet) |
| Allocate margin   | 5.366540 USDC allocated to the SOL market | [84j9gZYu…UKKMMF7S](https://solscan.io/tx/84j9gZYuJWBb5Z7twGmu9zymCVLiHGWPjQKJFjvVuNHJrR8JGd1onWAVAuHQkkpffKzxmAuK3wjaAEpUKKMMF7S?cluster=devnet)  |
| Settle allocation | Market collateral reached 10 USDC         | [27toAfBm…Anh6Fh62](https://solscan.io/tx/27toAfBm3aP97TJfk7v84o6Ph9mbFpz6H62S7KSQSih1Qcp7xBZQV5gCJoy7RgYJtCAyicrHDCXV3icUAnh6Fh62?cluster=devnet) |
| Submit long       | 30 USDC long order submitted              | [3k7W6s9A…cpnaMPLG](https://solscan.io/tx/3k7W6s9AZoGahm6ETyYuH7JXfYdHStjnkpjzpJTpchJ6euEBpZj1rBKsuCgxpbhmwu4D4bJ5TXZzHWnGcpnaMPLG?cluster=devnet) |
| Match long        | Arcium selected the primary maker         | [4rLpgnwr…pg37nNUH](https://solscan.io/tx/4rLpgnwrR9iCuuRNYqtQbXxjDGYV71AF4g9rAU8o1drEw9msFo6einQcTzuWqLSaB4AtXnUt2Fa5xL6Xpg37nNUH?cluster=devnet) |
| Settle long       | 0.281602201 SOL exposure opened           | [4KZkvDts…CAb2imLB](https://solscan.io/tx/4KZkvDtsp9bMv79KhJp5DgC2Ky3iR1W1BJ6Mv8g4buUeAiUCinhNdHYBdbFEJR2cgDy7ukVk7YkVWgZaCAb2imLB?cluster=devnet) |
| Submit close      | Full position close submitted             | [3J6t6Qcf…Q8SBTTu3](https://solscan.io/tx/3J6t6QcfAUNpV5g4wDYdxzahD7xnJ7RHukiEjQJEi6bjLKNJiKQs4ddg2RNfsgMX7tALSMREy5jgTHomQ8SBTTu3?cluster=devnet) |
| Match close       | Arcium selected the fallback maker        | [5S3z9Pdp…P5qCeozi](https://solscan.io/tx/5S3z9PdpbKtAuM5SaPvAt9dCJx7cQ7Xg4jbspAKTRGtQhqLHiUCVQMqQ8g1rEBUkPYy6KDQNrSbxYoX4P5qCeozi?cluster=devnet) |
| Settle close      | Trader returned to zero exposure          | [3ssT3KV6…ZKJ8be9j](https://solscan.io/tx/3ssT3KV6gqwUcFHP8aUHTsNZP8WQhnANjYqvZyAZ7WAJydU7Mi8dTky2szswr2pR5q1vRUwjLbboqSJvZKJ8be9j?cluster=devnet) |

### Market maker execution

[Primary maker](https://solscan.io/account/63uNgNxzJA94CDUNuF8MYn32JgUcuSSGo8WYZKK34ZZY?cluster=devnet) ·
[Fallback maker](https://solscan.io/account/AHWQq8nob1fEbKKyh1yCaRpp3rvVM6WnVjrpQx91ztgn?cluster=devnet)

| Operation        | Result                                                       | Transaction hash                                                                                                                                   |
| ---------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submit quote     | Primary maker submitted an encrypted quote                   | [48mgQgGN…q1FoiWXb](https://solscan.io/tx/48mgQgGNWn7euPCgAPgzCEY6mTmitsgGWDEFxJy5jNSmK1pMBmHGuQgfqZQqDjje8rgrpDtiNscjdEukq1FoiWXb?cluster=devnet) |
| Prepare quote    | Arcium validated the quote                                   | [2v9Rivry…9VxWh8MM](https://solscan.io/tx/2v9Rivryw1aiBZ73stHLNMtNmqowBP7npfC3WeQRyQXGG5N525y9sno833f1UtNTXZRf3sNyx5p89h1H9VxWh8MM?cluster=devnet) |
| Activate quote   | Quote activated through replacement                          | [3iy8sAnJ…SMMyepEs](https://solscan.io/tx/3iy8sAnJS797v2fzZ25iimyuiWnstknadVqnfwsM4mVQ3b9Knaxz8Saoe3pPjADLP76yHJtcGa3cYDqESMMyepEs?cluster=devnet) |
| Fill long        | Primary maker sold 0.281602201 SOL exposure                  | [4KZkvDts…CAb2imLB](https://solscan.io/tx/4KZkvDtsp9bMv79KhJp5DgC2Ky3iR1W1BJ6Mv8g4buUeAiUCinhNdHYBdbFEJR2cgDy7ukVk7YkVWgZaCAb2imLB?cluster=devnet) |
| Hedge inventory  | Bought 0.28 SOL on Hyperliquid; total hedge reached 1.54 SOL | [0x4566ff…8fd803c0](https://app.hyperliquid-testnet.xyz/explorer/tx/0x4566ff58d0d429d646e0042b9a667c010100173e6bd748a8e92faaab8fd803c0)            |
| Fill close       | Fallback maker bought 0.281602201 SOL exposure               | [3ssT3KV6…ZKJ8be9j](https://solscan.io/tx/3ssT3KV6gqwUcFHP8aUHTsNZP8WQhnANjYqvZyAZ7WAJydU7Mi8dTky2szswr2pR5q1vRUwjLbboqSJvZKJ8be9j?cluster=devnet) |
| Claim open fees  | Open trade fees and maker rebate distributed                 | [5kXLBkGC…ZCfgJFoD](https://solscan.io/tx/5kXLBkGCmpQirwq1JMNdff59kzfJCj7i4Rf4kxrWiDcY4Gzz2txpFUD9mXjU851tDZ3UZTCD5HqWfnSgZCfgJFoD?cluster=devnet) |
| Claim close fees | Close trade fees and maker rebate distributed                | [5x45mb3K…vfrAX76g](https://solscan.io/tx/5x45mb3KJtZvWfcDyXckK84tgLL9vjRTvBTXVsFwkuveQwdziQnCTCY6vbLQD2Xr2QzLHnSzGtUCVXFvfrAX76g?cluster=devnet)  |
| Release quote    | Primary quote's unused margin released                       | [2fha5LrZ…FGzWHCHh](https://solscan.io/tx/2fha5LrZaVyW7UNsZXjgV2KBR3UzUu2yS4KCCCyCeaZXSToiUQioNCMKqFqvJc3u77VvBXnpEnck8PUuFGzWHCHh?cluster=devnet) |
| Reclaim rent     | Terminal quote account closed and rent reclaimed             | [4PwimcGe…wktoCShw](https://solscan.io/tx/4PwimcGevSyvgixTWv4u21iYdTU3FLS87UrNg4raYGhQXebrwcbj8de7s9YgAEjaUbzhXuXZAB6sQ8KPwktoCShw?cluster=devnet) |

The fallback filled the close, so the primary maker retained its inventory and
corresponding hedge. Trade amounts are disclosed from the demo's private results;
explorers show transactions and callbacks, not decrypted Depth orders.

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
