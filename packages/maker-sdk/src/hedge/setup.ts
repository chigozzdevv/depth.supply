import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import {
  getWalletAddress,
  type AbstractWallet,
} from "@nktkas/hyperliquid/signing";
import { privateKeyToAccount } from "viem/accounts";
import { units } from "@/hedge/amount";

export async function verify_hyperliquid(options: {
  account: `0x${string}`;
  agent: `0x${string}`;
  network: "testnet" | "mainnet";
  maxLeverage: number;
}) {
  const info = new InfoClient({
    transport: new HttpTransport({ isTestnet: options.network === "testnet" }),
  });
  const [state, agents] = await Promise.all([
    info.clearinghouseState({ user: options.account }),
    info.extraAgents({ user: options.account }),
  ]);
  if (units(state.withdrawable, 6, false) < 10_000_000n)
    throw new Error(
      `Fund Hyperliquid ${options.network} account ${options.account} with at least 10 available USDC`,
    );
  if (
    !agents.some(
      (entry) =>
        entry.address.toLowerCase() === options.agent.toLowerCase() &&
        (entry.validUntil === null || entry.validUntil > Date.now()),
    )
  )
    throw new Error(
      "Approve the displayed agent in Hyperliquid API wallets, or connect its account wallet",
    );
  const position = state.assetPositions.find(
    (entry) => entry.position.coin === "SOL",
  )?.position;
  if (position && position.leverage.value > options.maxLeverage)
    throw new Error("SOL leverage exceeds the configured hedge limit");
}

export async function setup_hyperliquid(options: {
  wallet?: AbstractWallet;
  accountKey?: `0x${string}`;
  account?: `0x${string}`;
  agent?: `0x${string}`;
  agentKey?: `0x${string}`;
  network?: "testnet" | "mainnet";
  leverage: number;
  agentName?: string;
  configureLeverage?: boolean;
}) {
  if (Boolean(options.wallet) === Boolean(options.accountKey))
    throw new Error("Provide one Hyperliquid account signer source");
  if (
    !Number.isInteger(options.leverage) ||
    options.leverage < 1 ||
    options.leverage > 10
  )
    throw new Error("Setup leverage must be 1 to 10");
  if (Boolean(options.agent) === Boolean(options.agentKey))
    throw new Error("Provide one Hyperliquid agent identity source");
  const agent = options.agent ?? privateKeyToAccount(options.agentKey!).address;
  if (!/^0x[0-9a-fA-F]{40}$/.test(agent))
    throw new Error("Hyperliquid agent address is invalid");
  const wallet = options.wallet ?? privateKeyToAccount(options.accountKey!);
  const account = await getWalletAddress(wallet);
  if (
    options.account &&
    account.toLowerCase() !== options.account.toLowerCase()
  )
    throw new Error(
      "The setup signer does not own the configured Hyperliquid account",
    );
  if (account.toLowerCase() === agent.toLowerCase())
    throw new Error("The account and agent must be separate wallets");
  const transport = new HttpTransport({
    isTestnet: (options.network ?? "testnet") === "testnet",
  });
  const info = new InfoClient({ transport });
  const state = await info.clearinghouseState({ user: account });
  if (units(state.marginSummary.accountValue, 6, false) < 10_000_000n)
    throw new Error(
      `Fund Hyperliquid ${options.network ?? "testnet"} account ${account} with at least 10 USDC before setup`,
    );
  const client = new ExchangeClient({ wallet, transport });
  const agents = await info.extraAgents({ user: account });
  if (
    !agents.some(
      (entry) =>
        entry.address.toLowerCase() === agent.toLowerCase() &&
        (entry.validUntil === null || entry.validUntil > Date.now()),
    )
  )
    await client.approveAgent({
      agentAddress: agent,
      agentName: options.agentName ?? "Depth maker",
    });
  const meta = await info.meta();
  const asset = meta.universe.findIndex(
    (entry) => entry.name === "SOL" && !entry.isDelisted,
  );
  if (asset < 0) throw new Error("Hyperliquid SOL perpetual is unavailable");
  if (options.configureLeverage !== false)
    await client.updateLeverage({
      asset,
      isCross: true,
      leverage: options.leverage,
    });
  return {
    account,
    agent,
    network: options.network ?? "testnet",
    leverage: options.leverage,
  };
}
