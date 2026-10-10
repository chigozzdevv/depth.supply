import * as anchor from "@anchor-lang/core";
import { appAddress } from "@depthhq/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import type { FundingClient } from "@/account/funding";
import { DepthError, submissionError } from "@/operation/error";

type AppState = {
  app: PublicKey;
  feeBps: number;
  version: anchor.BN;
  active: boolean;
};
type BalanceState = { owner: PublicKey; status: Record<string, unknown> };

export type AppSummary = {
  id: PublicKey;
  feeBps: number;
  version: bigint;
  active: boolean;
};

export type ConfirmOptions = {
  timeoutMs?: number;
  pollMs?: number;
  signal?: AbortSignal;
};

function timing(options: ConfirmOptions): {
  timeoutMs: number;
  pollMs: number;
} {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollMs = options.pollMs ?? 1_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0)
    throw new RangeError("timeoutMs must be a nonnegative integer");
  if (!Number.isSafeInteger(pollMs) || pollMs < 100)
    throw new RangeError("pollMs must be at least 100");
  return { timeoutMs, pollMs };
}

export class AppAdmin {
  readonly id: PublicKey;
  readonly address: PublicKey;

  constructor(
    private readonly program: anchor.Program,
    private readonly connection: Connection,
    private readonly owner: PublicKey,
    private readonly funding: FundingClient,
  ) {
    this.id = owner;
    this.address = appAddress(owner, program.programId);
  }

  async summary(): Promise<AppSummary | undefined> {
    const info = await this.connection.getAccountInfo(
      this.address,
      "confirmed",
    );
    if (!info) return undefined;
    if (!info.owner.equals(this.program.programId))
      throw new Error("App configuration is not owned by Depth");
    const state = this.program.coder.accounts.decode<AppState>(
      "appConfig",
      info.data,
    );
    if (!state.app.equals(this.owner))
      throw new Error("App configuration belongs to another owner");
    return {
      id: this.owner,
      feeBps: state.feeBps,
      version: BigInt(state.version.toString()),
      active: state.active,
    };
  }

  async register(input: { feeBps: number }): Promise<AppRegistration> {
    this.validateFee(input.feeBps);
    const existing = await this.summary();
    if (existing) {
      if (existing.feeBps !== input.feeBps)
        throw new Error("App is registered with another fee; use setFee");
      return new AppRegistration(this, this.funding, input.feeBps);
    }
    const signature = await this.program.methods
      .registerApp(input.feeBps)
      .accountsPartial({ app: this.owner, config: this.address })
      .rpc({ commitment: "confirmed" })
      .catch((error: unknown) =>
        submissionError(this.address.toBase58(), error),
      );
    return new AppRegistration(this, this.funding, input.feeBps, signature);
  }

  async setFee(feeBps: number): Promise<AppUpdate> {
    this.validateFee(feeBps);
    const current = await this.requireSummary();
    return this.update(feeBps, current.active);
  }

  async setActive(active: boolean): Promise<AppUpdate> {
    const current = await this.requireSummary();
    return this.update(current.feeBps, active);
  }

  private async requireSummary(): Promise<AppSummary> {
    const summary = await this.summary();
    if (!summary) throw new Error("App is not registered");
    return summary;
  }

  private validateFee(feeBps: number): void {
    if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 2)
      throw new RangeError("App fee must be an integer from 0 to 2 bps");
  }

  private async update(feeBps: number, active: boolean): Promise<AppUpdate> {
    const signature = await this.program.methods
      .setAppFee(feeBps, active)
      .accountsPartial({ app: this.owner, config: this.address })
      .rpc({ commitment: "confirmed" })
      .catch((error: unknown) =>
        submissionError(this.address.toBase58(), error),
      );
    return new AppUpdate(this, feeBps, active, signature);
  }
}

export class AppUpdate {
  constructor(
    private readonly admin: AppAdmin,
    private readonly feeBps: number,
    private readonly active: boolean,
    readonly signature: string,
  ) {}

  async confirm(): Promise<AppSummary> {
    const summary = await this.admin.summary();
    if (
      !summary ||
      summary.feeBps !== this.feeBps ||
      summary.active !== this.active
    )
      throw new DepthError(
        "APP_STATE_CHANGED",
        "confirmation",
        "App settings changed after submission",
        false,
        "Refresh the app summary before another update",
        this.admin.address.toBase58(),
      );
    return summary;
  }
}

export class AppRegistration {
  constructor(
    private readonly admin: AppAdmin,
    private readonly funding: FundingClient,
    private readonly feeBps: number,
    readonly signature?: string,
  ) {}

  async confirm(options: ConfirmOptions = {}): Promise<{ appId: PublicKey }> {
    const { timeoutMs, pollMs } = timing(options);
    const summary = await this.admin.summary();
    if (!summary || summary.feeBps !== this.feeBps)
      throw new DepthError(
        "APP_REGISTRATION_CHANGED",
        "confirmation",
        "App registration is unavailable or has different terms",
        false,
        "Read the current app summary",
        this.admin.address.toBase58(),
      );
    let balance = await this.funding.read<BalanceState>(
      "BalanceAccount",
      this.funding.balance,
    );
    if (!balance) {
      try {
        await this.funding.openBalance();
      } catch (error) {
        balance = await this.funding.read<BalanceState>(
          "BalanceAccount",
          this.funding.balance,
        );
        if (!balance) throw error;
      }
    }
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      options.signal?.throwIfAborted();
      balance = await this.funding.read<BalanceState>(
        "BalanceAccount",
        this.funding.balance,
      );
      if (balance && !balance.owner.equals(this.admin.id))
        throw new Error("App fee balance belongs to another owner");
      if (balance && "ready" in balance.status) return { appId: this.admin.id };
      if (Date.now() >= deadline)
        throw new DepthError(
          "APP_BALANCE_PENDING",
          "confirmation",
          "App is registered but its private fee balance is still pending",
          true,
          "Call registration.confirm again with the same app owner wallet",
          this.admin.address.toBase58(),
        );
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}
