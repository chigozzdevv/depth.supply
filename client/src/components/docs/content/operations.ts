import { code, list, p, page, section, table } from "@/components/docs/model";

export const operations = [
  page(
    "operations/services",
    "Run Depth",
    "Run the services",
    "Start the API, settlement keeper, and managed maker workers.",
    [
      section(
        "install",
        "Prepare the workspace",
        p(
          "Use pnpm, Bun, and Node with support for --env-file-if-exists. Contract builds additionally require the pinned Solana, Anchor, Rust, and Arcium toolchains.",
        ),
        code(
          "Install and build packages",
          `pnpm install --frozen-lockfile
node scripts/build-package.mjs bindings schema sdk maker-sdk`,
          "sh",
        ),
        p(
          "Create a root .env.local from .env.example if you do not already have one. All configured file paths resolve from the repository root.",
        ),
      ),
      section(
        "configure",
        "Configure the services",
        table(
          ["Setting", "Purpose"],
          [
            ["SOLANA_RPC_URL", "Server and worker RPC endpoint."],
            [
              "DEPTH_ENVIRONMENT",
              "Selected environment; devnet for these guides.",
            ],
            [
              "DEPTH_DEVNET_MANIFEST_PATH",
              "Signed deployment JSON served by the API.",
            ],
            [
              "DEPTH_KEEPER_KEYPAIR_PATH",
              "Funded signer for settlement transactions.",
            ],
            [
              "DEPTH_AUTOMATION_SECRET",
              "32 random bytes encoded as hex for the maker registry.",
            ],
            [
              "DEPTH_VIEW_RELAY_ENABLED",
              "Set true to sponsor authorized private reads.",
            ],
            [
              "PYTH_ORACLE_MODE",
              "sponsored reads the feed; hermes enables the publisher.",
            ],
          ],
        ),
        p(
          "Hermes publishing also needs PYTH_API_KEY. Sponsored mode requires no Hermes key; stale source data still stops trading. Keep signer files and environment secrets private.",
        ),
      ),
      section(
        "start",
        "Start and stop",
        code(
          "Managed services",
          `pnpm services:start
pnpm services:status
pnpm services:stop`,
          "sh",
        ),
        p(
          "The supervisor manages the API, keeper, maker workers, and client. To run individual processes, use separate terminals:",
        ),
        code(
          "Individual processes",
          `pnpm --dir server start
pnpm --dir server keeper
pnpm maker
pnpm dev`,
          "sh",
        ),
      ),
      section(
        "health",
        "Monitor readiness",
        table(
          ["Endpoint", "Checks"],
          [
            ["GET /health", "API liveness."],
            [
              "GET /ready",
              "Workers, oracle freshness, funding, market status, and quotes.",
            ],
            ["Keeper /healthz · default port 8786", "Keeper process health."],
            ["Maker /healthz · default port 8789", "Maker supervisor health."],
          ],
        ),
      ),
      section(
        "storage",
        "Keep durable state",
        list([
          "Back up data/maker and the automation secret together.",
          "Mount durable worker storage when hosting.",
          "Use one supervisor per registry and one worker per maker/hedge account.",
          "Set SOLANA_RPC_RPS within the provider’s request allowance.",
        ]),
        p(
          "Runtime logs and process state live in data/runtime. Local managed services need the host to remain awake; public hosting is configured separately.",
        ),
      ),
    ],
    "scripts/services.mjs",
  ),
  page(
    "operations/deployment",
    "Run Depth",
    "Deployment and verification",
    "Publish verified circuits, initialize the market, and serve a signed manifest.",
    [
      section(
        "toolchain",
        "Set up the toolchain",
        code(
          "Resolve pinned tools",
          `pnpm --dir contracts install --frozen-lockfile
pnpm tools:setup`,
          "sh",
        ),
        p(
          "The workspace selects its pinned Arcium toolchain. Build and deployment versions are resolved separately; use the repository commands rather than an unverified global binary.",
        ),
      ),
      section(
        "circuits",
        "Publish circuits",
        code(
          "Verify and upload",
          `pnpm --dir contracts verify:circuits --local
pnpm --dir contracts upload:circuits`,
          "sh",
        ),
        p(
          "The uploader uses the configured Pinata credentials and verifies the files through the public gateway. Save the verified DEPTH_CIRCUIT_BASE_URL in the root environment before building.",
        ),
      ),
      section(
        "deploy",
        "Deploy to devnet",
        code(
          "Deploy and initialize",
          `pnpm --dir contracts build:devnet
pnpm --dir contracts deploy:devnet --check
pnpm --dir contracts deploy:devnet
pnpm --dir contracts init:defs
pnpm --dir contracts init:protocol
pnpm --dir contracts init:market`,
          "sh",
        ),
        p(
          "Provision the deployment signers first. Market initialization requires five recovery committee signer/encryption key pairs and a private envelope output path. Distribute each encrypted recovery share to its committee member.",
        ),
        p(
          "For upgrades, pause the market and finish pending computations first. Changed circuits use new versioned computation definitions.",
        ),
      ),
      section(
        "manifest",
        "Sign the deployment",
        code(
          "Sign a manifest",
          "pnpm devnet:manifest VERSION EXPIRY_UNIX deployments/devnet/manifest.json",
          "sh",
        ),
        p(
          "Replace VERSION and EXPIRY_UNIX with your release version and Unix expiry in seconds. The signer must be the deployed program’s upgrade authority. Configure DEPTH_DEVNET_MANIFEST_PATH to serve the JSON at /.well-known/depth/devnet.json.",
        ),
        p(
          "SDKs verify its signature and network, then compare the program, MXE, and market configuration with Solana. Publish a fresh manifest after an upgrade or policy revision.",
        ),
      ),
      section(
        "verify",
        "Verify the lifecycle",
        code(
          "Read deployment and callback evidence",
          `pnpm devnet:audit
pnpm devnet:callbacks`,
          "sh",
        ),
        p(
          "The audit reads the deployment. Callback verification checks finalized Arcium callbacks and circuit hashes.",
        ),
        code("Run a funded test trade", "pnpm devnet:quote", "sh"),
        p(
          "The quote proof submits real devnet transactions through deposit, allocation, open, close, release, withdrawal, and fee claims. It retains operation IDs in data/devnet/quote.json and refuses to overwrite an interrupted workflow.",
        ),
      ),
    ],
    "contracts/package.json",
  ),
];
