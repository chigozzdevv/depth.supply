import { setup_hyperliquid } from "@depthhq/maker-sdk/node";
import { hedgeConfig } from "@/server/shared/config/env";
import { safeError } from "@/devnet/context";

try {
  const config = hedgeConfig({
    ...process.env,
    DEPTH_MAKER_HEDGE: "hyperliquid",
  })!;
  if (config.network !== "testnet")
    throw new Error("This setup command supports testnet only");
  const key = process.env.HYPERLIQUID_ACCOUNT_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new Error(
      "HYPERLIQUID_ACCOUNT_PRIVATE_KEY is required for agent setup",
    );
  console.info(
    JSON.stringify(
      await setup_hyperliquid({
        accountKey: key as `0x${string}`,
        account: config.account,
        agentKey: config.agentKey,
        network: "testnet",
        leverage: 1,
      }),
    ),
  );
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
}
