import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import {
  automationConfig,
  automationWire,
  type AutomationView,
} from "@depthhq/maker-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { WalletAccess } from "@/shared/http/access";
import { AutomationStore } from "@/features/automation/automation.store";
import type { AutomationFunding } from "@/features/automation/funding.service";
import {
  AutomationError,
  publicAutomation,
} from "@/features/automation/automation.model";

export class AutomationService {
  readonly access = new WalletAccess(undefined, "Manage maker automation");
  constructor(
    readonly store: AutomationStore,
    private readonly running: (owner: string) => boolean,
    readonly funding?: AutomationFunding,
  ) {}
  summary(owner: string): AutomationView | null {
    const record = this.store.get(owner);
    return record ? publicAutomation(record) : null;
  }
  configure(owner: string, revision: number, input: unknown) {
    let config;
    try {
      config = automationWire(automationConfig(input));
    } catch (error) {
      throw new AutomationError((error as Error).message, 400);
    }
    return this.store.change((records) => {
      let record = records.find((record) => record.owner === owner);
      if ((record?.revision ?? 0) !== revision)
        throw new AutomationError(
          "Automation configuration changed; review it again",
        );
      if (record?.funding?.status === "pending")
        throw new AutomationError(
          "Wait for operator funding to finalize before changing limits",
        );
      if (
        record &&
        (record.desired !== "paused" ||
          !["configured", "paused"].includes(record.phase) ||
          this.running(owner))
      )
        throw new AutomationError(
          "Pause automation and wait for quote cancellation before changing its limits",
        );
      if (
        record?.hedgeBound &&
        config.hedge?.account !== record.config.hedge?.account
      )
        throw new AutomationError(
          "Keep the existing hedge account to preserve its inventory and order recovery",
        );
      if (
        config.hedge &&
        records.some(
          (entry) =>
            entry.owner !== owner &&
            entry.hedgeBound &&
            entry.config.hedge?.account === config.hedge!.account,
        )
      )
        throw new AutomationError(
          "This Hyperliquid account is already assigned to another maker",
        );
      if (!record) {
        if (records.length >= 128)
          throw new AutomationError(
            "Automation onboarding is at capacity",
            503,
          );
        const operator = Keypair.generate();
        const agentSecret =
          `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
        record = {
          owner,
          environment: this.store.environment,
          revision: 0,
          operator: operator.publicKey.toBase58(),
          operatorSecret: Buffer.from(operator.secretKey).toString("base64"),
          agent: privateKeyToAccount(agentSecret).address,
          agentSecret,
          config,
          desired: "paused",
          phase: "configured",
          updatedAt: Date.now(),
          hedge: {
            maker: owner,
            enabled: Boolean(config.hedge),
            snapshot: null,
          },
        };
        records.push(record);
      }
      record.config = config;
      record.revision++;
      record.updatedAt = Date.now();
      record.hedge.enabled = Boolean(config.hedge);
      record.reason = undefined;
      return publicAutomation(record);
    });
  }
  command(owner: string, revision: number, action: "start" | "pause") {
    return this.store.change((records) => {
      const record = records.find((record) => record.owner === owner);
      if (!record || record.revision !== revision)
        throw new AutomationError(
          "Automation configuration changed; review it again",
        );
      if (action === "start" && record.phase === "pausing")
        throw new AutomationError(
          "Wait for quote cancellation before resuming",
        );
      if (action === "start" && record.funding?.status === "pending")
        throw new AutomationError(
          "Wait for operator funding to finalize before starting",
        );
      if (
        action === "start" &&
        record.desired !== "running" &&
        records.filter((entry) => entry.desired === "running").length >= 32
      )
        throw new AutomationError("Automation workers are at capacity", 503);
      record.desired = action === "start" ? "running" : "paused";
      if (action === "start" && record.phase !== "running")
        record.phase = "starting";
      if (
        action === "pause" &&
        !["configured", "paused"].includes(record.phase)
      )
        record.phase =
          !this.running(owner) &&
          (!record.started || record.bot?.phase === "stopped")
            ? "paused"
            : "pausing";
      record.updatedAt = Date.now();
      record.reason = undefined;
      return publicAutomation(record);
    });
  }
}
