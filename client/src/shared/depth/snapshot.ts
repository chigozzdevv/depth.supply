import type {
  BalanceSnapshot,
  DepthClient,
  PositionSnapshot,
} from "@depthhq/sdk";

export type AccountSnapshot = {
  balance: BalanceSnapshot;
  position?: PositionSnapshot;
};

type AccountClient = Pick<DepthClient, "account" | "positions" | "position">;

export class AccountReader {
  private pending?: Promise<AccountSnapshot>;
  private balance?: { account: string; snapshot: BalanceSnapshot };

  constructor(private readonly client: AccountClient) {}

  read(current: () => boolean): Promise<AccountSnapshot> {
    if (this.pending) return this.pending;
    const request = this.snapshot(current).finally(() => {
      if (this.pending === request) this.pending = undefined;
    });
    this.pending = request;
    return request;
  }

  private async snapshot(current: () => boolean): Promise<AccountSnapshot> {
    const check = () => {
      if (!current()) throw new Error("Wallet changed while loading account");
    };
    check();
    const account = this.client.account();
    const [state, positions] = await Promise.all([
      account.state(),
      this.client.positions.list(),
    ]);
    check();
    if (state.status !== "uninitialized" && state.status !== "ready")
      throw new Error(
        "Account is processing an operation. Retry when it settles.",
      );
    const cached = this.balance;
    const balance: BalanceSnapshot =
      state.status === "uninitialized"
        ? { ...state, status: "uninitialized", amount: 0n }
        : cached?.snapshot.status === "ready" &&
            cached.account === state.id &&
            cached.snapshot.version === state.version
          ? cached.snapshot
          : await account.summary();
    check();
    if (
      (balance.status !== "ready" && balance.status !== "uninitialized") ||
      balance.amount === undefined
    )
      throw new Error("Balance is not ready. Retry the account read.");
    if (balance.version !== state.version)
      throw new Error("Balance changed while loading. Retry the account read.");
    this.balance = { account: state.id, snapshot: balance };
    const position = positions.items.length
      ? await this.client.position().summary()
      : undefined;
    check();
    if (
      position &&
      (position.status !== "ready" ||
        position.collateral === undefined ||
        position.position === undefined)
    )
      throw new Error("Position is not ready. Retry the account read.");
    const latest = await account.state();
    check();
    if (
      latest.status !== balance.status ||
      latest.version !== balance.version ||
      latest.id !== state.id
    )
      throw new Error("Balance changed while loading. Retry the account read.");
    return { balance, position };
  }
}

export function availableBalance(account: {
  balance?: BalanceSnapshot;
  loaded: boolean;
  outdated: boolean;
  checking: boolean;
}): bigint | undefined {
  if (!account.loaded || account.outdated || account.checking) return;
  if (
    account.balance?.status === "ready" ||
    account.balance?.status === "uninitialized"
  )
    return account.balance.amount;
}
