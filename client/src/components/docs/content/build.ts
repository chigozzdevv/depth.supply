import {
  code,
  links,
  list,
  note,
  p,
  page,
  section,
  table,
} from "@/components/docs/model";

export const build = [
  page(
    "quickstart",
    "Build an app",
    "Quickstart",
    "Register your app and connect a trader in a few steps.",
    [
      section(
        "install",
        "Install the SDK",
        code("Terminal", "npm install @depthhq/sdk", "sh"),
        p(
          "Use a Solana wallet adapter that exposes publicKey, signTransaction, and signAllTransactions. Examples use your connected wallet; the SDK does not create or hold its private key.",
        ),
      ),
      section(
        "register",
        "Register your app",
        p(
          "Register once with the app owner’s wallet. Choose an app fee from 0 to 2 basis points and save the confirmed appId.",
        ),
        code(
          "Register an app",
          `import { create_depth } from "@depthhq/sdk";

const admin = await create_depth({
  environment: "devnet",
  wallet: appOwnerWallet,
});

const registration = await admin.app.register({ feeBps: 1 });
const { appId } = await registration.confirm();`,
        ),
      ),
      section(
        "connect",
        "Connect a trader",
        code(
          "Create the trader client",
          `const depth = await create_depth({
  environment: "devnet",
  wallet: traderWallet,
  appId,
  privateViews: "device",
  viewAuthorization: "session",
});`,
        ),
        p(
          'The SDK verifies the network and signed deployment before returning a client. Read sessions require the configured API sponsor; use viewAuthorization: "wallet" for individually signed reads.',
        ),
      ),
      section(
        "next",
        "Fund and trade",
        links([
          {
            href: "/docs/trading/funding",
            title: "Fund the account",
            description: "Deposit test USDC and allocate margin.",
          },
          {
            href: "/docs/trading/orders",
            title: "Submit an order",
            description: "Set bounds and wait for a confirmed fill.",
          },
        ]),
      ),
    ],
    "packages/sdk/src/client/types.ts",
  ),
  page(
    "build/integration",
    "Build an app",
    "App integration",
    "Keep your product’s interface. Let the SDK handle confidential protocol operations.",
    [
      section(
        "ownership",
        "What your app owns",
        list([
          "Connect wallets and display amounts, fees, and order bounds before signing.",
          "Create a new SDK client when the wallet or environment changes.",
          "Track operation IDs and nonces through submission, confirmation, and recovery.",
          "Clear private views and unpublished order terms when the wallet changes.",
        ]),
      ),
      section(
        "connection",
        "Configure the connection",
        code(
          "Use your own endpoints",
          `import { create_depth } from "@depthhq/sdk";

const depth = await create_depth({
  environment: "devnet",
  wallet: traderWallet,
  appId,
  rpcUrl: rpcUrl,
  serviceUrl: serviceUrl,
  viewAuthorization: "wallet",
});`,
        ),
        p(
          "Public endpoints use HTTPS. Loopback HTTP is allowed for local development. Keep provider credentials behind your own server proxy.",
        ),
        p(
          "The signed manifest must match the selected network, deployed program, MXE, and market configuration. Its signer must be the program’s onchain upgrade authority.",
        ),
      ),
      section(
        "app-fees",
        "Manage your app",
        code(
          "Owner actions",
          `const update = await admin.app.setFee(1);
await update.confirm();

const app = await admin.app.summary();`,
        ),
        p(
          "An appId attributes a trade and its app fee. It does not grant access to the trader’s wallet or private account.",
        ),
      ),
      section(
        "loading",
        "Load only what you need",
        p(
          "Import chart data from @depthhq/sdk/data. Load the transaction SDK when a wallet connects. The included trader and maker terminals consume the public exports and serve as integration examples.",
        ),
      ),
    ],
    "packages/sdk/src/chain/environment.ts",
  ),
  page(
    "build/sdk",
    "Build an app",
    "SDK reference",
    "The public methods you need for accounts, trades, and private reads.",
    [
      section(
        "clients",
        "Clients",
        table(
          ["Export", "Purpose"],
          [
            [
              "create_depth · @depthhq/sdk",
              "App registration, trader accounts, orders, and private views.",
            ],
            [
              "create_depth_data · @depthhq/sdk/data",
              "Public markets, candles, and price updates.",
            ],
            [
              "create_depth_maker · @depthhq/maker-sdk",
              "Maker quotes, operators, fills, automation, and hedges.",
            ],
          ],
        ),
      ),
      section(
        "units",
        "Units",
        table(
          ["Value", "Representation", "Example"],
          [
            [
              "USDC and notional",
              "bigint · 6 decimals",
              "25 USDC = 25_000_000n",
            ],
            ["Price · E8", "bigint · 8 decimals", "$200 = 20_000_000_000n"],
            [
              "SOL position size",
              "bigint · 9 decimals",
              "1 SOL = 1_000_000_000n",
            ],
            ["Basis points", "integer", "1 bp = 0.01%"],
            [
              "Expiry",
              "Unix seconds",
              "Use validForSeconds for a relative duration.",
            ],
          ],
        ),
        p(
          'Amount selectors accept a bigint, "all", or a percentage such as "50%" where the method supports them. Do not pass decimal JavaScript numbers for token amounts.',
        ),
      ),
      section(
        "account-methods",
        "Account and position",
        table(
          ["Method", "Use"],
          [
            [
              "depth.account.deposit(amount)",
              "Deposit wallet USDC into the private balance.",
            ],
            [
              "depth.account.allocate({ marketId, amount })",
              "Move free balance into market collateral.",
            ],
            [
              "depth.account.release({ marketId, amount })",
              "Return releasable margin to free balance.",
            ],
            [
              "depth.account.withdraw(amount)",
              "Withdraw free balance to the wallet.",
            ],
            ["depth.account.summary()", "Read the authorized private balance."],
            [
              "depth.position.summary() / pnl()",
              "Read private market state or value the position.",
            ],
            [
              "depth.position.addMargin(amount) / removeMargin(amount)",
              "Adjust margin within market limits.",
            ],
          ],
        ),
      ),
      section(
        "trade-methods",
        "Trade and recovery",
        table(
          ["Method", "Use"],
          [
            ["depth.trade.submit(input)", "Increase long or short exposure."],
            [
              "depth.trade.reduce(input) / close(input) / reverse(input)",
              "Manage existing exposure.",
            ],
            [
              "operation.status() / confirm()",
              "Inspect the receipt or wait for a filled outcome.",
            ],
            [
              "operation.privateResult() / transaction()",
              "Read the authorized fill or settlement transaction.",
            ],
            [
              "depth.trade.operation(nonce) / flow(nonce)",
              "Restore an order or its allocation/submission flow.",
            ],
            [
              "depth.account.pending() / history()",
              "Discover canonical funding receipts.",
            ],
          ],
        ),
      ),
      section(
        "views",
        "Read sessions",
        code(
          "Authorize and revoke",
          `await depth.views.authorize();
const balance = await depth.account.summary();
const permission = await depth.views.status();

await depth.views.revoke();`,
        ),
        note(
          "Read access",
          "Read authorization does not sign trades or transfers. Those operations still require wallet approval.",
        ),
      ),
    ],
    "packages/sdk/src/client/client.ts",
  ),
  page(
    "build/market-data",
    "Build an app",
    "Market data",
    "Add market discovery and reference charts without connecting a wallet.",
    [
      section(
        "read",
        "Read a market",
        code(
          "Public data client",
          `import { create_depth_data } from "@depthhq/sdk/data";

const data = create_depth_data({ environment: "devnet" });
const market = await data.market("SOL-USD");
const candles = await data.candles("SOL-USD", {
  interval: "15m",
  limit: 200,
});`,
        ),
      ),
      section(
        "subscribe",
        "Subscribe to updates",
        code(
          "Reference price stream",
          `const stop = data.subscribe({
  marketId: "SOL-USD",
  interval: "15m",
  onUpdate: (page) => updateChart(page.items),
  onError: (error) => showDataError(error),
});

// Call when the chart unmounts.
stop();`,
        ),
      ),
      section(
        "price-sources",
        "Understand the price sources",
        p(
          "Candles are SOL reference prices from Hyperliquid. They do not represent Depth executions, trading volume, or open interest. The market’s pinned Pyth oracle supplies protocol marks.",
        ),
        p(
          "Candle pages include stale and nextCursor. Show stale data explicitly; use nextCursor as the before value when loading older candles.",
        ),
      ),
      section(
        "http",
        "HTTP endpoints",
        table(
          ["GET", "Returns"],
          [
            ["/v1/markets", "Public market catalog."],
            ["/v1/markets/SOL-USD", "Market policy and public status."],
            [
              "/v1/markets/SOL-USD/candles?interval=15m&limit=200",
              "Reference candle page.",
            ],
            [
              "/v1/markets/SOL-USD/stream?interval=15m",
              "Server-sent reference price updates.",
            ],
          ],
        ),
      ),
    ],
    "packages/sdk/src/catalog/data.ts",
  ),
];
