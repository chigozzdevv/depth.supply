import {
  code,
  list,
  note,
  p,
  page,
  section,
  table,
} from "@/components/docs/model";

export const makers = [
  page(
    "makers/quotes",
    "Make markets",
    "Publish quotes",
    "Commit collateral and compete to fill encrypted orders.",
    [
      section(
        "connect",
        "Connect a maker",
        code("Terminal", "npm install @depthhq/maker-sdk", "sh"),
        code(
          "Create the maker client",
          `import { create_depth_maker } from "@depthhq/maker-sdk";

const maker = await create_depth_maker({
  environment: "devnet",
  wallet: makerWallet,
});`,
        ),
        p(
          "Fund and allocate USDC with maker.account.deposit() and maker.account.allocate(). Confirm both receipts before quoting. The owner funds collateral; delegated quote operators cannot move it.",
        ),
      ),
      section(
        "publish",
        "Publish a quote",
        p(
          "bidE8 and askE8 are prices with eight decimals. Derive both from a fresh market reference and keep them inside the verified deviation limits. maxCapacity is micro-USDC.",
        ),
        code(
          "Publish around your reference price",
          `const publication = await maker.quote.publish({
  marketId: "SOL-USD",
  bidE8: bidPriceE8,
  askE8: askPriceE8,
  maxCapacity: 100_000_000n,
  validForSeconds: 60,
});

const { quoteId } = await publication.confirm();`,
        ),
        p(
          "Publishing encrypts the quote curve. Confirmation prepares and activates the quote after its margin reservation passes. Tiered quotes can supply up to four size/price tiers within market policy.",
        ),
      ),
      section(
        "maintain",
        "Renew, replace, or cancel",
        code(
          "Renew unchanged prices",
          `const quote = maker.quote.get(quoteId);
await quote.renew({ validForSeconds: 60 });`,
        ),
        p(
          "Renewal extends unchanged terms without another pricing computation. To change prices, use maker.quote.replace(quoteId, newTerms). The successor validates before the existing reservation and book entry rotate.",
        ),
        code("Stop accepting new fills", `await quote.cancel();`),
        p(
          "Cancellation does not close existing inventory. Reclaim terminal quote rent with quote.close() after attached orders finish settling.",
        ),
      ),
      section(
        "fills",
        "Read fills",
        code(
          "Subscribe to authorized maker fills",
          `const stop = await maker.fills.subscribe({
  marketId: "SOL-USD",
  onFill: async (fill) => handleFill(fill),
  onError: (error) => showFillError(error),
});`,
        ),
        p(
          "Call stop() when the subscription ends. The SDK checkpoints receipt cursors in IndexedDB in browsers and private files in Node; it does not persist decrypted fills in those checkpoints.",
        ),
      ),
    ],
    "packages/maker-sdk/src/client/client.ts",
  ),
  page(
    "makers/automation",
    "Make markets",
    "Automate a maker",
    "Configure a quote policy, approve its operator, and control the worker.",
    [
      section(
        "configure",
        "Configure the policy",
        p(
          "Managed automation requires a running maker supervisor and a wallet with signMessage support. This example caps quote capacity at 100 USDC and inventory notional at 1,000 USDC.",
        ),
        code(
          "Set up automation",
          `const setup = await maker.automation.configure({
  quote: {
    maxCapacity: 100_000_000n,
    maxInventoryNotional: 1_000_000_000n,
    spreadBps: 20,
    repriceBps: 10,
    lifetimeSeconds: 120,
    refreshSeconds: 60,
  },
});`,
        ),
      ),
      section(
        "approve",
        "Review and approve",
        p(
          "Display the returned operator, permissions, funding budget, and optional hedge agent before approval. Approval grants private inventory access and tops up the operator’s SOL.",
        ),
        code(
          "Approve and start",
          `await maker.automation.approve(setup);
await maker.automation.start();

const status = await maker.automation.summary();`,
        ),
        p(
          "The default operator grant lasts 24 hours. Approval accepts a grant duration from one minute to seven days. The maker owner retains control of Depth collateral.",
        ),
      ),
      section(
        "control",
        "Pause and resume",
        code(
          "Control the worker",
          `await maker.automation.pause();
await maker.automation.resume();`,
        ),
        p(
          "Pause cancels available quotes and leaves positions open. Workers stop quoting on stale oracle or funding data, inadequate SOL, exposure limits, or unresolved hedge receipts.",
        ),
      ),
      section(
        "sessions",
        "Authorize after reconnecting",
        p(
          "Management sessions use wallet signatures and stay in memory. Call maker.automation.authorize() after expiry or a wallet change before requesting its summary. The worker restores desired state and quote checkpoints from durable storage.",
        ),
      ),
    ],
    "packages/maker-sdk/src/automation/automation.ts",
  ),
  page(
    "makers/hedging",
    "Make markets",
    "Hedge on Hyperliquid",
    "Optionally offset aggregate maker inventory with a dedicated external account.",
    [
      section(
        "prepare",
        "Prepare the account",
        list([
          "Use a Hyperliquid account dedicated to this strategy.",
          "Fund its USDC separately from Depth collateral.",
          "Pair Solana devnet with Hyperliquid testnet.",
          "Approve the displayed agent with the account’s Ethereum wallet.",
        ]),
      ),
      section(
        "enable",
        "Enable managed hedging",
        p(
          "Add hedge to your automation configuration. Keep the quote policy from the automation guide and choose explicit exposure, slippage, and timing limits. The following values are an example for test funds.",
        ),
        code(
          "Configure a testnet hedge",
          `const setup = await maker.automation.configure({
  quote: quotePolicy,
  hedge: {
    account: hedgeAccountAddress,
    policy: {
      ratioBps: 10_000,
      thresholdNotional: 10_000_000n,
      maxUnhedgedNotional: 100_000_000n,
      maxOrderNotional: 100_000_000n,
      batchMs: 5_000,
      maxUnhedgedMs: 90_000,
      maxSlippageBps: 10,
      maxPriceAgeMs: 5_000,
      orderTtlMs: 10_000,
      maxLeverage: 1,
    },
  },
});

await maker.automation.approve(setup, { hedgeWallet });
await maker.automation.start();`,
        ),
        p(
          "hedgeWallet is the Hyperliquid account owner’s signing wallet. The worker receives its approved agent key. If the agent is already approved externally, approval can verify it without hedgeWallet.",
        ),
      ),
      section(
        "behavior",
        "How hedges execute",
        p(
          "The engine follows finalized aggregate maker inventory, batches small changes, and reconciles actual external fills. It saves orders before submission and retains the signed nonce and expiry on retries. Reversals reduce the prior hedge before opening the opposite side.",
        ),
        table(
          ["Condition", "Worker response"],
          [
            ["Stale external prices", "Stop quoting."],
            ["Exposure outside policy", "Stop quoting and reconcile."],
            [
              "Uncertain expired order",
              "Reconcile its receipt before a replacement.",
            ],
            ["Worker paused or stopped", "Keep existing positions open."],
          ],
        ),
      ),
      section(
        "inspect",
        "Inspect hedge status",
        code(
          "Read the private maker mapping",
          `await maker.hedges.authorize();
const hedges = await maker.hedges.summary();`,
        ),
        note(
          "Public external activity",
          "Hyperliquid trades are public. Linking that account to a maker can reveal trading clues or aggregate inventory. Depth’s quote curves and trader inputs remain encrypted.",
        ),
        p(
          "Once a worker binds a hedge account, configuration cannot replace or remove it. Keep its recovery journal and durable storage with that maker.",
        ),
      ),
    ],
    "packages/maker-sdk/src/hedge/engine.ts",
  ),
];
