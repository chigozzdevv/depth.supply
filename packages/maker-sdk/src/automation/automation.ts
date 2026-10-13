import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import type { MakerClient } from "@/client/client";
import { WalletSession } from "@/hedge/access";
import { setup_hyperliquid, verify_hyperliquid } from "@/hedge/setup";
import {
  automationConfig,
  automationView,
  automationWire,
  type AutomationConfig,
  type AutomationView,
} from "@/automation/types";

export class MakerAutomation extends WalletSession {
  constructor(private readonly maker: MakerClient) {
    super(maker.options, "Manage maker automation", "automation/");
  }
  private view(value: unknown) {
    return automationView(
      value,
      this.maker.options.wallet.publicKey.toBase58(),
      this.maker.options.environment ?? "",
    );
  }
  async summary(): Promise<AutomationView | null> {
    if (!this.token || this.token.expiresAt <= Date.now())
      throw new Error("Authorize automation with your maker wallet");
    return this.view(await this.authorizedRequest(""));
  }
  async configure(
    config: AutomationConfig,
    revision?: number,
  ): Promise<AutomationView> {
    const wire = automationWire(config);
    automationConfig(wire);
    if (revision === undefined) {
      if (!this.token || this.token.expiresAt <= Date.now())
        await this.authorize();
      revision = (await this.summary())?.revision ?? 0;
    }
    if (!Number.isSafeInteger(revision) || revision < 0)
      throw new Error("Automation revision is invalid");
    return this.view(
      await this.authorizedRequest("configure", { revision, config: wire }),
    )!;
  }
  async approve(
    profile: AutomationView,
    options: {
      grantSeconds?: number;
      operatorFundingLamports?: bigint;
      hedgeWallet?: AbstractWallet;
    } = {},
  ) {
    this.view(profile);
    const current = await this.summary();
    if (
      !current ||
      current.revision !== profile.revision ||
      current.operator !== profile.operator ||
      current.agent !== profile.agent
    )
      throw new Error("Automation configuration changed; review it again");
    if (!this.maker.options.maker.equals(this.maker.options.wallet.publicKey))
      throw new Error("The maker owner must approve automation");
    if (
      current.desired !== "paused" ||
      !["configured", "paused"].includes(current.phase)
    )
      throw new Error("Pause automation before approving its operator");
    const config = automationConfig(current.config);
    const grantSeconds = options.grantSeconds ?? 86400;
    if (
      !Number.isSafeInteger(grantSeconds) ||
      grantSeconds < 60 ||
      grantSeconds > 604800
    )
      throw new Error("Operator approval must last 1 minute to 7 days");
    const target =
      options.operatorFundingLamports ??
      config.quote.gasReserveLamports! + 200_000_000n;
    if (target < config.quote.gasReserveLamports! || target > 10_000_000_000n)
      throw new Error(
        "Operator funding must cover the reserve and stay within 10 SOL",
      );
    if (config.hedge) {
      const network = profile.environment === "devnet" ? "testnet" : "mainnet";
      const verification = {
        account: config.hedge.account,
        agent: profile.agent,
        network,
        maxLeverage: config.hedge.policy.maxLeverage,
      } as const;
      try {
        await verify_hyperliquid(verification);
      } catch (cause) {
        if (!options.hedgeWallet) throw cause;
        await setup_hyperliquid({
          wallet: options.hedgeWallet,
          account: config.hedge.account,
          agent: profile.agent,
          network,
          leverage: config.hedge.policy.maxLeverage,
          agentName: `Depth ${profile.agent.slice(2, 10)}`,
          configureLeverage: false,
        });
        await verify_hyperliquid(verification);
      }
    }
    const operator = new PublicKey(profile.operator);
    const balance = BigInt(
      await this.maker.options.connection.getBalance(operator, "confirmed"),
    );
    const signatures: string[] = [];
    const recovered = this.view(
      await this.authorizedRequest("fund", { revision: current.revision }),
    )!;
    if (recovered.funding?.status === "pending")
      signatures.push((await this.waitFunding(current.revision)).signature);
    else if (balance < target) {
      const blockhash =
        await this.maker.options.connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction({
        ...blockhash,
        feePayer: this.maker.options.wallet.publicKey,
      }).add(
        SystemProgram.transfer({
          fromPubkey: this.maker.options.wallet.publicKey,
          toPubkey: operator,
          lamports: target - balance,
        }),
      );
      const signed =
        await this.maker.options.wallet.signTransaction(transaction);
      this.view(
        await this.authorizedRequest("fund", {
          revision: current.revision,
          transaction: Buffer.from(signed.serialize()).toString("base64"),
          lastValidBlockHeight: blockhash.lastValidBlockHeight,
          targetLamports: target.toString(),
        }),
      );
      signatures.push((await this.waitFunding(current.revision)).signature);
    }
    signatures.push(
      await this.maker.operator.authorize({
        operator,
        maxCapacity: config.quote.maxCapacity,
        expiresAt: Math.floor(Date.now() / 1000) + grantSeconds,
        canView: true,
      }),
    );
    return { profile: current, signatures };
  }
  private async waitFunding(revision: number) {
    const deadline = Date.now() + 120000;
    for (;;) {
      const profile = this.view(
        await this.authorizedRequest("fund", { revision }),
      )!;
      const receipt = profile.funding;
      if (!receipt) throw new Error("Operator funding receipt is unavailable");
      if (receipt.status === "confirmed") return receipt;
      if (receipt.status !== "pending")
        throw new Error(
          `Operator funding ${receipt.status}; retry approval after reviewing its receipt`,
        );
      if (Date.now() >= deadline)
        throw new Error(
          "Operator funding is pending; its signed transaction is saved and approval can resume",
        );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  private async command(action: "start" | "pause", revision?: number) {
    if (revision === undefined) {
      if (!this.token || this.token.expiresAt <= Date.now())
        await this.authorize();
      const profile = await this.summary();
      if (!profile) throw new Error("Configure maker automation first");
      revision = profile.revision;
    }
    if (!Number.isSafeInteger(revision) || revision < 1)
      throw new Error("Automation revision is invalid");
    return this.view(await this.authorizedRequest(action, { revision }))!;
  }
  start(revision?: number) {
    return this.command("start", revision);
  }
  pause(revision?: number) {
    return this.command("pause", revision);
  }
  resume(revision?: number) {
    return this.start(revision);
  }
}
