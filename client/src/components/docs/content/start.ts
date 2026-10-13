import {
  links,
  list,
  note,
  p,
  page,
  section,
  table,
} from "@/components/docs/model";

export const start = [
  page(
    "",
    "Start here",
    "Build with Depth",
    "Private perpetuals on Solana. One venue for trading apps and competing makers.",
    [
      section(
        "the-venue",
        "One shared venue",
        p(
          "Depth matches encrypted trader orders against collateralized maker quotes. Apps share the same clearing venue while keeping their own interface and app fee. The first market is a SOL/USD perpetual with USDC collateral and settlement.",
        ),
        table(
          ["You want to", "Start with"],
          [
            [
              "Add trading to an app",
              "Register an app, connect the trader’s wallet, and use the App SDK.",
            ],
            [
              "Supply liquidity",
              "Fund a maker account and publish quotes with the Maker SDK.",
            ],
            [
              "Show a price chart",
              "Use the public data client. No wallet required.",
            ],
          ],
        ),
      ),
      section(
        "a-trade",
        "From collateral to exit",
        list(
          [
            "Deposit USDC into Depth.",
            "Submit an encrypted order with a price bound, fee cap, and expiry.",
            "Arcium selects an eligible maker; Solana records settlement.",
            "Manage the position, close it, release margin, and withdraw.",
          ],
          true,
        ),
      ),
      section(
        "choose-a-path",
        "Choose a path",
        links([
          {
            href: "/docs/quickstart",
            title: "Connect your app",
            description: "Install the SDK and register your app.",
          },
          {
            href: "/docs/trading/orders",
            title: "Place a trade",
            description: "Open, reduce, close, or reverse a position.",
          },
          {
            href: "/docs/makers/quotes",
            title: "Make markets",
            description: "Publish and maintain encrypted quotes.",
          },
          {
            href: "/docs/operations/services",
            title: "Run the services",
            description: "Start the API, keeper, and maker supervisor.",
          },
        ]),
        note(
          "Start on devnet",
          "The guides use Solana devnet and test USDC. The trader and maker demos use these same SDKs.",
        ),
      ),
    ],
    "packages/sdk/src/client/client.ts",
  ),
  page(
    "privacy",
    "Start here",
    "Privacy",
    "Know what is encrypted, what is public, and who can read a private view.",
    [
      section(
        "encrypted-state",
        "Encrypted state",
        p(
          "Trader order terms, maker bid/ask curves, balances, positions, margin, and account health are encrypted. Arcium computes matching and account updates; the Solana program checks and applies the callbacks.",
        ),
      ),
      section(
        "public-metadata",
        "Public metadata",
        table(
          ["Visible on Solana", "What it reveals"],
          [
            [
              "Wallets and accounts",
              "Ownership and links between protocol accounts.",
            ],
            ["Deposits and withdrawals", "Token transfer amounts and timing."],
            ["Quote records", "Maker, capacity, expiry, and lifecycle status."],
            [
              "Operation receipts",
              "Transaction signatures, timing, and outcome.",
            ],
          ],
        ),
        p(
          "Encryption does not hide wallet activity or prevent inference from predictable quote policies. External Hyperliquid hedges can reveal aggregate maker exposure.",
        ),
      ),
      section(
        "private-views",
        "Read permissions",
        p(
          "Owners authorize private views. A maker can explicitly grant an operator access to its inventory. Automatic read sessions encrypt results to a device key; the API sponsors the read transaction without receiving that key.",
        ),
        p(
          "Device storage protects saved snapshots with encryption. An unlocked device and code running on the same origin remain part of that trust boundary.",
        ),
      ),
      section(
        "recovery",
        "Recovery trust",
        p(
          "Emergency winddown requires three of five configured committee signers. Recovery shares give the committee a path to recover encrypted state if normal computation is unavailable. Privacy therefore depends on committee custody as well as Arcium.",
        ),
      ),
    ],
    "contracts/programs/depth/src/state/mod.rs",
  ),
];
