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

export const trading = [
  page(
    "trading/funding",
    "Trading",
    "Fund an account",
    "Deposit USDC, allocate margin, and withdraw free balance.",
    [
      section(
        "deposit",
        "Deposit USDC",
        p(
          "Connect a wallet with devnet USDC and SOL for transaction costs. The high-level deposit method prepares the private balance when needed. Wait for its credit receipt before using the funds.",
        ),
        code(
          "Deposit 25 USDC",
          `const deposit = await depth.account.deposit(25_000_000n);
await deposit.confirm();

const balance = await depth.account.summary();`,
        ),
      ),
      section(
        "allocate",
        "Allocate margin",
        code(
          "Allocate 10 USDC",
          `const allocation = await depth.account.allocate({
  marketId: "SOL-USD",
  amount: 10_000_000n,
});
await allocation.confirm();`,
        ),
        p(
          "Free balance and market collateral are separate. An order’s margin field allocates additional collateral before submission; set it to 0n when the market already has enough margin.",
        ),
      ),
      section(
        "withdraw",
        "Release and withdraw",
        code(
          "Return available collateral",
          `const release = await depth.account.release({
  marketId: "SOL-USD",
  amount: "all",
});
await release.confirm();

const withdrawal = await depth.account.withdraw("all");
await withdrawal.confirm();`,
        ),
        p(
          "Close exposure and finish pending operations first. Only releasable margin can leave the market, and only free balance can be withdrawn.",
        ),
        note(
          "Public transfers",
          "Deposit and withdrawal amounts are visible on Solana. Account balances and market collateral are encrypted.",
        ),
      ),
    ],
    "packages/sdk/src/account/funding.ts",
  ),
  page(
    "trading/orders",
    "Trading",
    "Place and manage orders",
    "Set your bounds, submit an encrypted order, and confirm the result.",
    [
      section(
        "submit",
        "Open a position",
        p(
          "This example requests 20 USDC of long exposure and allocates 5 USDC of additional margin. The wallet must already have a funded Depth balance. Save a unique client nonce before signing so you can resume an interrupted request.",
        ),
        code(
          "Submit a long",
          `const operation = await depth.trade.submit({
  clientNonce: savedNonce,
  marketId: "SOL-USD",
  direction: "long",
  notional: 20_000_000n,
  margin: 5_000_000n,
  slippageBps: 50,
  maxFee: 20_000n,
  validForSeconds: 60,
});

const { orderId } = await operation.confirm();
const fill = await operation.privateResult();`,
        ),
        p(
          "Slippage is bounded against the oracle reference. maxFee is a USDC amount cap, not a fee rate. Use exactly one of slippageBps or worstPriceE8, and one of validForSeconds or expiresAt.",
        ),
      ),
      section(
        "matching",
        "Match and settle",
        p(
          "Arcium compares eligible encrypted quotes and selects the best price within the order’s limits. Maker capacity, margin, oracle bounds, fees, and expiry must all pass. The keeper advances matching and settlement callbacks.",
        ),
        p(
          "A submitted transaction is not a fill. confirm() succeeds only for a finalized filled order; privateResult() returns the authorized execution details.",
        ),
      ),
      section(
        "manage",
        "Manage exposure",
        code(
          "Reduce a position",
          `const reduction = await depth.trade.reduce({
  marketId: "SOL-USD",
  amount: "50%",
  slippageBps: 50,
  maxFee: 20_000n,
  validForSeconds: 60,
});
await reduction.confirm();`,
        ),
        code(
          "Close the remaining position",
          `const closing = await depth.trade.close({
  marketId: "SOL-USD",
  slippageBps: 50,
  maxFee: 20_000n,
  validForSeconds: 60,
});
await closing.confirm();`,
        ),
        p(
          "Use reverse() with a new direction and notional to close the old exposure and open the requested opposite exposure. Reductions and closures still need eligible maker liquidity.",
        ),
      ),
      section(
        "next",
        "After settlement",
        links([
          {
            href: "/docs/trading/funding#withdraw",
            title: "Withdraw collateral",
            description: "Release available margin after closing.",
          },
          {
            href: "/docs/trading/recovery",
            title: "Resume a pending operation",
            description: "Recover with the saved nonce and receipts.",
          },
        ]),
      ),
    ],
    "packages/sdk/src/client/client.ts",
  ),
  page(
    "trading/fees-risk",
    "Trading",
    "Fees and risk",
    "Understand execution costs and the limits enforced by the market.",
    [
      section(
        "fees",
        "Trading fees",
        table(
          ["Fee", "Rate"],
          [
            ["Core trader fee", "5 bps of executed notional."],
            [
              "Depth share",
              "3 bps, plus the deterministic rounding remainder.",
            ],
            ["Insurance", "1 bp."],
            ["Maker rebate", "1 bp."],
            ["App fee", "0–2 bps, added by the integrating app."],
          ],
        ),
        p(
          "The total execution fee rounds up to micro-USDC; insurance, app fees, and the maker rebate round down. Orders bind the app fee and reject execution above maxFee. A 20 USDC execution at 6 bps costs 0.012 USDC before any funding.",
        ),
      ),
      section(
        "margin",
        "Margin and liquidation",
        p(
          "The devnet configuration requires 10% initial margin and 5% maintenance margin. It sets a 0.5% liquidation fee. These are market settings; read the verified market policy when building your order form.",
        ),
        p(
          "Unrealized PnL and accrued funding affect equity. Removing margin must preserve the required health. A position below maintenance can be liquidated through the encrypted risk computation.",
        ),
      ),
      section(
        "prices",
        "Prices and funding",
        p(
          "The market pins a Pyth SOL/USD account and checks price age and confidence. Funding updates follow the market’s configured interval and rate cap. Stale prices or overdue funding stop new trading until the market is ready.",
        ),
      ),
      section(
        "limits",
        "Check before signing",
        list([
          "Read the market’s active status and current policy.",
          "Show the app fee, maximum execution fee, and price bound.",
          "Keep SOL available for wallet transactions.",
          "Confirm the order outcome before updating the displayed position.",
        ]),
      ),
    ],
    "contracts/config/devnet-market.json",
  ),
  page(
    "trading/recovery",
    "Trading",
    "Resume an operation",
    "Use canonical receipts to recover after a timeout, reload, or interrupted submission.",
    [
      section(
        "nonce",
        "Keep the same nonce",
        p(
          "Assign a unique clientNonce to each intended trade and retain it before signing. After uncertain submission, inspect that flow before creating another order.",
        ),
        code(
          "Restore a trade",
          `const flow = depth.trade.flow(savedNonce);
const progress = await flow.status();

const operation = depth.trade.operation(savedNonce);
const status = await operation.status();`,
        ),
        p(
          "flow.status() distinguishes an allocation from an order. If allocation completed but the order was never submitted, resuming requires the original private order terms. Do not store decrypted terms or wallet keys in public logs.",
        ),
      ),
      section(
        "discover",
        "Discover pending receipts",
        code(
          "Read canonical history",
          `const pending = await depth.account.pending();
const history = await depth.account.history();
const allocations = await depth.trade.unpairedAllocations();`,
        ),
        p(
          "An unpaired allocation remains market collateral. Inspect it and release available funds through the normal account flow.",
        ),
      ),
      section(
        "errors",
        "Handle errors",
        table(
          ["Field on DepthError", "Meaning"],
          [
            ["stage", "validation, submission, or confirmation."],
            [
              "retryable",
              "Whether reconciliation or a later retry may succeed.",
            ],
            ["operationId", "The saved operation to inspect, when available."],
            ["nextAction", "The specific recovery action."],
          ],
        ),
        note(
          "Timeouts",
          "A confirmation timeout does not cancel an order. Read its current receipt and reconcile with the same nonce.",
        ),
      ),
      section(
        "pnl",
        "Recover execution PnL",
        code(
          "Read a closed execution",
          `const execution = await depth.history.execution(savedNonce);`,
        ),
        p(
          "The SDK reconstructs the prior position, margin, and funding from authorized fills in settlement order. Missing archival transactions are reported explicitly.",
        ),
      ),
    ],
    "packages/sdk/src/trade/flow.ts",
  ),
];
