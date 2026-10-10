import { Buffer } from "buffer";
import * as anchor from "@anchor-lang/core";
import {
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
  getMXEPublicKey,
  RescueCipher,
  x25519,
} from "@arcium-hq/client";
import {
  appAddress,
  circuits,
  computationName,
  DEPTH_IDL,
  DEPTH_PROGRAM_ID,
  marketAddress,
  protocolAddress,
  recoveryConfigAddress,
  SOL_USD_MARKET_ID,
} from "@depthhq/bindings";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "@/chain/random";
import { verifyDeployment } from "@/chain/manifest";
import { resolveConnection } from "@/chain/environment";
import { arciumAccount } from "@/chain/arcium";
import { DepthProvider } from "@/chain/provider";
import { AppAdmin } from "@/app/app";
import { MarketCatalog } from "@/catalog/catalog";
import { FundingDiscovery } from "@/account/discovery";
import { FundingClient } from "@/account/funding";
import { destinationTokenAccount, sourceTokenAccount } from "@/account/token";
import { releasableMargin } from "@/account/release";
import { submissionError } from "@/operation/error";
import { DepthOperation } from "@/operation/operation";
import { DepthRecovery } from "@/recovery/recovery";
import { ExecutionHistory } from "@/history/history";
import { encodeSide, u64 } from "@/trade/input";
import { resolveAmount } from "@/trade/amount";
import type { AmountSelector } from "@/trade/amount";
import { tradeDeadline, tradeLimit } from "@/trade/terms";
import { TradeFlow } from "@/trade/flow";
import { DepthView } from "@/view/view";
import type { BalanceSnapshot, PositionSnapshot } from "@/view/view";
import { positionPnl } from "@/position/pnl";
import { settlementTransaction } from "@/chain/settlement";
import type {
  AccountState,
  AppState,
  CloseInput,
  DepthOptions,
  ResolvedDepthOptions,
  MarketState,
  OrderState,
  ProtocolState,
  ReductionInput,
  ReverseInput,
  TradeInput,
  TradeIntent,
  TradeTerms,
} from "@/client/types";

function pda(seeds: Buffer[], programId = DEPTH_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function nonce(): anchor.BN {
  return new anchor.BN(randomBytes(8), "le");
}

function enumName(value: Record<string, unknown>): string {
  return Object.keys(value)[0] ?? "unknown";
}

export class DepthClient {
  readonly program: anchor.Program;
  readonly provider: anchor.AnchorProvider;
  readonly position: ReturnType<DepthClient["positionActions"]>;
  readonly marketAddress = marketAddress();
  readonly protocolAddress = protocolAddress();
  readonly mxeAddress = getMXEAccAddress(DEPTH_PROGRAM_ID);

  get catalog(): MarketCatalog {
    return new MarketCatalog(this);
  }

  get funding(): FundingClient {
    return new FundingClient(
      this.program,
      this.options.connection,
      this.options.wallet.publicKey,
      (name, offset) => this.queue(name, offset),
    );
  }

  get app(): AppAdmin {
    return new AppAdmin(
      this.program,
      this.options.connection,
      this.options.wallet.publicKey,
      this.funding,
    );
  }

  get recovery(): DepthRecovery {
    return new DepthRecovery(
      this.program,
      this.options.connection,
      this.options.wallet.publicKey,
    );
  }

  private historyClient?: ExecutionHistory;
  get history(): ExecutionHistory {
    return (this.historyClient ??= new ExecutionHistory(
      this.program,
      this.options.connection,
      this.options.wallet.publicKey,
      (id) => this.requestFillView(id),
    ));
  }

  private constructor(readonly options: ResolvedDepthOptions) {
    this.provider = new DepthProvider(options.connection, options.wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    this.program = new anchor.Program(DEPTH_IDL, this.provider);
    this.position = this.positionActions();
  }

  static async create(options: DepthOptions): Promise<DepthClient> {
    const appId =
      typeof options.appId === "string"
        ? new PublicKey(options.appId)
        : options.appId;
    const resolved = {
      ...options,
      ...(await resolveConnection(options)),
      appId,
    };
    const client = new DepthClient(resolved);
    await verifyDeployment(client.provider, resolved.deployment);
    await client.verifyDeployment();
    return client;
  }

  private async verifyDeployment(): Promise<void> {
    const [programInfo, protocol, market, app, mxe] = await Promise.all([
      this.options.connection.getAccountInfo(DEPTH_PROGRAM_ID, "confirmed"),
      this.read<ProtocolState>("Protocol", this.protocolAddress),
      this.read<MarketState>("Market", this.marketAddress),
      this.options.appId
        ? this.read<AppState>("AppConfig", appAddress(this.options.appId))
        : Promise.resolve(undefined),
      arciumAccount(this.provider).fetch(this.mxeAddress),
    ]);
    if (!programInfo?.executable)
      throw new Error("Depth program is not deployed");
    if (
      !market.settlementMint.equals(protocol.settlementMint) ||
      !market.vault.equals(protocol.vault) ||
      (this.options.appId && !app?.app.equals(this.options.appId)) ||
      !mxe.mxeProgramId.equals(DEPTH_PROGRAM_ID)
    ) {
      throw new Error("Depth deployment accounts disagree");
    }
  }

  private async read<T>(name: string, address: PublicKey): Promise<T> {
    const info = await this.options.connection.getAccountInfo(
      address,
      "confirmed",
    );
    if (!info || !info.owner.equals(DEPTH_PROGRAM_ID)) {
      throw new Error(`${name} account is unavailable`);
    }
    return this.program.coder.accounts.decode<T>(
      name[0].toLowerCase() + name.slice(1),
      info.data,
    );
  }

  private async queue(name: string, offset: anchor.BN) {
    const mxe = await arciumAccount(this.provider).fetch(this.mxeAddress);
    const cluster = mxe.cluster;
    const definition = getCompDefAccAddress(
      DEPTH_PROGRAM_ID,
      Buffer.from(getCompDefAccOffset(computationName(name))).readUInt32LE(),
    );
    const definitionInfo = await this.options.connection.getAccountInfo(
      definition,
      "confirmed",
    );
    if (!definitionInfo) throw new Error(`${name} computation is not deployed`);
    return {
      computationAccount: getComputationAccAddress(cluster, offset),
      clusterAccount: getClusterAccAddress(cluster),
      mxeAccount: this.mxeAddress,
      mempoolAccount: getMempoolAccAddress(cluster),
      executingPool: getExecutingPoolAccAddress(cluster),
      compDefAccount: definition,
    };
  }

  private accountAddress(): PublicKey {
    return pda([
      Buffer.from("market-account"),
      this.marketAddress.toBuffer(),
      this.options.wallet.publicKey.toBuffer(),
    ]);
  }

  async market(): Promise<{
    address: PublicKey;
    state: MarketState;
    slot: number;
  }> {
    const response = await this.options.connection.getAccountInfoAndContext(
      this.marketAddress,
      "confirmed",
    );
    if (!response.value || !response.value.owner.equals(DEPTH_PROGRAM_ID)) {
      throw new Error("Depth market is unavailable");
    }
    return {
      address: this.marketAddress,
      state: this.program.coder.accounts.decode<MarketState>(
        "market",
        response.value.data,
      ),
      slot: response.context.slot,
    };
  }

  operation(id: PublicKey): DepthOperation {
    return new DepthOperation(
      id,
      undefined,
      this.program,
      this.options.connection,
      (order) => this.requestFillView(order),
    );
  }

  async requestBalanceView(): Promise<DepthView> {
    const owner = this.options.wallet.publicKey;
    const balance = pda([Buffer.from("balance"), owner.toBuffer()]);
    const state = await this.read<{ status: Record<string, unknown> }>(
      "BalanceAccount",
      balance,
    );
    if (enumName(state.status) !== "ready") {
      throw new Error("Balance is processing another operation");
    }
    const viewNonce = nonce();
    const view = pda([
      Buffer.from("view"),
      owner.toBuffer(),
      viewNonce.toArrayLike(Buffer, "le", 8),
    ]);
    return this.requestView("balance", view, viewNonce, { balance });
  }

  async requestMarketView(): Promise<DepthView> {
    const owner = this.options.wallet.publicKey;
    const marketAccount = this.accountAddress();
    const state = await this.read<AccountState>("MarketAccount", marketAccount);
    if (enumName(state.status) !== "ready") {
      throw new Error("Market account is processing another operation");
    }
    const viewNonce = nonce();
    const view = pda([
      Buffer.from("market-view"),
      marketAccount.toBuffer(),
      viewNonce.toArrayLike(Buffer, "le", 8),
    ]);
    return this.requestView("market", view, viewNonce, {
      market: this.marketAddress,
      marketAccount,
    });
  }

  async requestFillView(order: PublicKey): Promise<DepthView> {
    const record = await this.read<OrderState>("OrderRecord", order);
    if (
      (!record.trader.equals(this.options.wallet.publicKey) &&
        !record.maker?.equals(this.options.wallet.publicKey)) ||
      !record.market.equals(this.marketAddress) ||
      enumName(record.kind) !== "trade" ||
      enumName(record.status) !== "filled"
    )
      throw new Error("Filled trade does not belong to this wallet and market");
    const viewNonce = nonce();
    const view = pda([
      Buffer.from("fill-view"),
      order.toBuffer(),
      this.options.wallet.publicKey.toBuffer(),
      viewNonce.toArrayLike(Buffer, "le", 8),
    ]);
    return this.requestView("fill", view, viewNonce, { order });
  }

  private async requestView(
    kind: "balance" | "market" | "fill",
    view: PublicKey,
    viewNonce: anchor.BN,
    accounts: Record<string, PublicKey>,
  ): Promise<DepthView> {
    const mxePublicKey = await getMXEPublicKey(this.provider, DEPTH_PROGRAM_ID);
    if (!mxePublicKey) throw new Error("MXE public key is unavailable");
    const secret = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(secret);
    const offset = nonce();
    const queue = await this.queue(
      kind === "balance"
        ? "view_balance"
        : kind === "market"
          ? "view_market"
          : "view_fill",
      offset,
    );
    const builder =
      kind === "balance"
        ? this.program.methods.requestBalanceView
        : kind === "market"
          ? this.program.methods.requestMarketView
          : this.program.methods.requestFillView;
    const signature = await builder(offset, viewNonce, Array.from(publicKey))
      .accountsPartial({
        ...queue,
        payer: this.options.wallet.publicKey,
        ...accounts,
        ...(kind === "balance" ? {} : { grant: null }),
        view,
      } as unknown as Record<string, PublicKey>)
      .rpc({ commitment: "confirmed" });
    return new DepthView(
      view,
      signature,
      kind,
      this.options.wallet.publicKey,
      secret,
      publicKey,
      mxePublicKey,
      this.program,
      this.options.connection,
    );
  }

  private async ensureBalanceReady(): Promise<void> {
    const address = this.funding.balance;
    const read = () =>
      this.funding.read<{ status: Record<string, unknown> }>(
        "BalanceAccount",
        address,
      );
    if (!(await read())) {
      try {
        await this.funding.openBalance();
      } catch (error) {
        if (!(await read())) throw error;
      }
    }
    const deadline = Date.now() + 60_000;
    for (;;) {
      const state = await read();
      if (state && enumName(state.status) === "ready") return;
      if (Date.now() >= deadline)
        throw new Error(
          `Balance account ${address.toBase58()} is still opening`,
        );
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  private async ensureMarketReady(): Promise<void> {
    const address = this.accountAddress();
    const read = () =>
      this.funding.read<AccountState>("MarketAccount", address);
    if (!(await read())) {
      try {
        await this.funding.openMarket();
      } catch (error) {
        if (!(await read())) throw error;
      }
    }
    const deadline = Date.now() + 60_000;
    for (;;) {
      const state = await read();
      if (state && enumName(state.status) === "ready") return;
      if (Date.now() >= deadline)
        throw new Error(
          `Market account ${address.toBase58()} is still opening`,
        );
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  private async allocateRequest(
    input:
      bigint | { marketId: typeof SOL_USD_MARKET_ID; amount: AmountSelector },
    clientNonce?: bigint,
  ) {
    if (typeof input === "bigint") {
      if (clientNonce === undefined)
        throw new RangeError("Allocation nonce is required");
      return this.funding.allocate(input, clientNonce);
    }
    if (input.marketId !== SOL_USD_MARKET_ID)
      throw new Error("Only SOL-USD is supported");
    await this.ensureBalanceReady();
    await this.ensureMarketReady();
    const balance = await this.account.summary();
    if (balance.status !== "ready" || balance.amount === undefined)
      throw new Error("Private balance is unavailable for allocation");
    const amount = resolveAmount(input.amount, balance.amount, "allocation");
    return this.funding.allocate(
      amount,
      clientNonce ?? BigInt(nonce().toString()),
    );
  }

  private async releaseRequest(
    input:
      bigint | { marketId: typeof SOL_USD_MARKET_ID; amount: AmountSelector },
    clientNonce?: bigint,
  ) {
    if (typeof input === "bigint") {
      if (clientNonce === undefined)
        throw new RangeError("Release nonce is required");
      return this.funding.release(input, clientNonce);
    }
    if (input.marketId !== SOL_USD_MARKET_ID)
      throw new Error("Only SOL-USD is supported");
    const [position, market] = await Promise.all([
      this.position.summary(),
      this.market(),
    ]);
    if (
      position.status !== "ready" ||
      position.collateral === undefined ||
      position.reserved === undefined ||
      position.position === undefined ||
      position.entryPriceE8 === undefined ||
      position.fundingCheckpoint === undefined
    )
      throw new Error("Private position is unavailable for release");
    if (
      Math.floor(Date.now() / 1_000) - market.state.oracleTimestamp.toNumber() >
      market.state.config.maxOracleAgeSeconds
    )
      throw new Error("Oracle update is stale");
    const available = releasableMargin(
      {
        collateral: position.collateral,
        reserved: position.reserved,
        position: position.position,
        entryPriceE8: position.entryPriceE8,
        fundingCheckpoint: position.fundingCheckpoint,
      },
      BigInt(market.state.oraclePriceE8.toString()),
      BigInt(market.state.fundingIndex.toString()),
      market.state.config.initialMarginBps,
    );
    const amount = resolveAmount(input.amount, available, "release");
    return this.funding.release(
      amount,
      clientNonce ?? BigInt(nonce().toString()),
    );
  }

  private async depositRequest(
    sourceOrAmount: PublicKey | bigint,
    amount?: bigint,
    clientNonce?: bigint,
  ) {
    if (sourceOrAmount instanceof PublicKey) {
      if (amount === undefined || clientNonce === undefined)
        throw new RangeError("Source deposits require amount and client nonce");
      return this.funding.deposit(sourceOrAmount, amount, clientNonce);
    }
    await this.ensureBalanceReady();
    const protocol = await this.read<ProtocolState>(
      "Protocol",
      this.protocolAddress,
    );
    const source = await sourceTokenAccount(
      this.options.connection,
      this.options.wallet.publicKey,
      protocol.settlementMint,
      sourceOrAmount,
    );
    return this.funding.deposit(
      source,
      sourceOrAmount,
      amount ?? BigInt(nonce().toString()),
    );
  }

  private async withdrawRequest(
    destinationOrAmount: PublicKey | AmountSelector,
    amount?: bigint,
    clientNonce?: bigint,
  ) {
    if (destinationOrAmount instanceof PublicKey) {
      if (amount === undefined || clientNonce === undefined)
        throw new RangeError(
          "Destination withdrawals require amount and client nonce",
        );
      return this.funding.withdraw(destinationOrAmount, amount, clientNonce);
    }
    const balance = await this.account.summary();
    if (balance.status !== "ready" || balance.amount === undefined)
      throw new Error("Private balance is unavailable for withdrawal");
    const requested = resolveAmount(
      destinationOrAmount,
      balance.amount,
      "withdrawal",
    );
    const protocol = await this.read<ProtocolState>(
      "Protocol",
      this.protocolAddress,
    );
    const destination = await destinationTokenAccount(
      this.provider,
      this.options.wallet.publicKey,
      protocol.settlementMint,
    );
    return this.funding.withdraw(
      destination,
      requested,
      amount ?? BigInt(nonce().toString()),
    );
  }

  private accountActions() {
    const actions = {
      detail: (item: Parameters<FundingDiscovery["detail"]>[0]) =>
        new FundingDiscovery(
          this.program,
          this.options.connection,
          this.options.wallet.publicKey,
        ).detail(item),
      transaction: (item: Parameters<FundingDiscovery["transaction"]>[0]) =>
        new FundingDiscovery(
          this.program,
          this.options.connection,
          this.options.wallet.publicKey,
        ).transaction(item),
      history: (options?: Parameters<FundingDiscovery["history"]>[0]) =>
        new FundingDiscovery(
          this.program,
          this.options.connection,
          this.options.wallet.publicKey,
        ).history(options),
      pending: (options?: Parameters<FundingDiscovery["pending"]>[0]) =>
        new FundingDiscovery(
          this.program,
          this.options.connection,
          this.options.wallet.publicKey,
        ).pending(options),
      cancelOpen: () => this.funding.cancelOpenBalance(),
      open: async () => this.funding.openBalance(),
      deposit: (
        sourceOrAmount: PublicKey | bigint,
        amount?: bigint,
        clientNonce?: bigint,
      ) => this.depositRequest(sourceOrAmount, amount, clientNonce),
      withdrawalHandle: (clientNonce: bigint) =>
        this.funding.withdrawalHandle(clientNonce),
      depositHandle: (nonce: bigint) => this.funding.depositHandle(nonce),
      withdraw: (
        destinationOrAmount: PublicKey | AmountSelector,
        amount?: bigint,
        clientNonce?: bigint,
      ) => this.withdrawRequest(destinationOrAmount, amount, clientNonce),
      allocate: (
        input:
          | bigint
          | { marketId: typeof SOL_USD_MARKET_ID; amount: AmountSelector },
        clientNonce?: bigint,
      ) => this.allocateRequest(input, clientNonce),
      release: (
        input:
          | bigint
          | { marketId: typeof SOL_USD_MARKET_ID; amount: AmountSelector },
        clientNonce?: bigint,
      ) => this.releaseRequest(input, clientNonce),
      transferHandle: (nonce: bigint) => this.funding.transferHandle(nonce),
      summary: async (
        options: { timeoutMs: number; pollMs?: number } = {
          timeoutMs: 180_000,
        },
      ): Promise<BalanceSnapshot> => {
        const view = await this.requestBalanceView();
        const result = (await view.wait(options)) as BalanceSnapshot;
        if (result.status !== "pending") await view.close();
        return result;
      },
    };
    return Object.assign(() => actions, actions);
  }

  readonly account = this.accountActions();

  private positionActions(id?: PublicKey | string) {
    const address = this.accountAddress();
    if (
      id &&
      (typeof id === "string" ? id : id.toBase58()) !== address.toBase58()
    )
      throw new Error("Position does not belong to this wallet and market");
    const actions = {
      id: address,
      cancelOpen: () => this.funding.cancelOpenMarket(),
      addMargin: (amount: AmountSelector, clientNonce?: bigint) =>
        typeof amount === "bigint" && clientNonce !== undefined
          ? this.funding.allocate(amount, clientNonce)
          : this.allocateRequest(
              { marketId: SOL_USD_MARKET_ID, amount },
              clientNonce,
            ),
      removeMargin: (amount: AmountSelector, clientNonce?: bigint) =>
        typeof amount === "bigint" && clientNonce !== undefined
          ? this.funding.release(amount, clientNonce)
          : this.releaseRequest(
              { marketId: SOL_USD_MARKET_ID, amount },
              clientNonce,
            ),
      open: async () => this.funding.openMarket(),
      transaction: () =>
        settlementTransaction(this.options.connection, this.program, address, {
          trader: this.options.wallet.publicKey,
          market: this.marketAddress,
        }),
      pnl: async () => {
        const position = await this.positionActions(id).summary();
        const [market, account] = await Promise.all([
          this.market(),
          this.read<AccountState>("MarketAccount", address),
        ]);
        const age =
          Math.floor(Date.now() / 1_000) -
          market.state.oracleTimestamp.toNumber();
        if (age < 0 || age > market.state.config.maxOracleAgeSeconds)
          throw new Error(
            "A fresh oracle price is required to value this position",
          );
        if (
          position.version !== BigInt(account.version.toString()) ||
          enumName(account.status) !== "ready"
        )
          throw new Error(
            "The position changed during valuation; refresh its private view",
          );
        return positionPnl(
          position,
          BigInt(market.state.oraclePriceE8.toString()),
          BigInt(market.state.fundingIndex.toString()),
        );
      },
      summary: async (
        options: { timeoutMs: number; pollMs?: number } = {
          timeoutMs: 180_000,
        },
      ): Promise<PositionSnapshot> => {
        const deadline = Date.now() + options.timeoutMs;
        let view: DepthView;
        for (;;) {
          try {
            view = await this.requestMarketView();
            break;
          } catch (error) {
            const code = (
              error as {
                error?: { errorCode?: { code?: string } };
              }
            ).error?.errorCode?.code;
            if (
              code !== "WrongMarketAccountStatus" &&
              !String(error).includes(
                "Market account is processing another operation",
              )
            ) {
              throw error;
            }
            if (Date.now() >= deadline) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1_000));
          }
        }
        const result = (await view.wait({
          ...options,
          timeoutMs: Math.max(0, deadline - Date.now()),
        })) as PositionSnapshot;
        if (result.status !== "pending") await view.close();
        return result;
      },
    };
    return Object.assign(
      (positionId?: PublicKey | string) => this.positionActions(positionId),
      actions,
    );
  }

  readonly positions = {
    list: async (options: { cursor?: string; limit?: number } = {}) => {
      if (options.cursor && options.cursor !== "1")
        throw new RangeError("Position cursor is invalid");
      if (
        options.limit !== undefined &&
        (!Number.isInteger(options.limit) || options.limit < 1)
      )
        throw new RangeError("Position limit must be positive");
      if (options.cursor === "1") return { items: [], nextCursor: null };
      const state = await this.funding.read<AccountState>(
        "MarketAccount",
        this.accountAddress(),
      );
      if (!state) return { items: [], nextCursor: null };
      if (
        !state.owner.equals(this.options.wallet.publicKey) ||
        !state.market.equals(this.marketAddress)
      )
        throw new Error("Market account does not belong to this wallet");
      return {
        items: [{ id: this.accountAddress(), marketId: SOL_USD_MARKET_ID }],
        nextCursor: null,
      };
    },
  };

  readonly trade = {
    submit: (input: TradeInput) => this.submitTrade(input, "increase"),
    reduce: (input: ReductionInput) => this.submitTrade(input, "reduce"),
    close: (input: CloseInput) => this.submitTrade(input, "close"),
    reverse: (input: ReverseInput) => this.submitTrade(input, "reverse"),
    operation: (clientNonce: bigint) =>
      new DepthOperation(
        this.orderAddress(clientNonce),
        undefined,
        this.program,
        this.options.connection,
        (order) => this.requestFillView(order),
        undefined,
        async () => {
          const detail = await this.history.execution(clientNonce);
          if (!detail.pnl)
            throw new Error("This execution does not close any exposure");
          return detail.pnl;
        },
      ),
    flow: (clientNonce: bigint) => new TradeFlow(this, clientNonce),
    unpairedAllocations: (
      options?: Parameters<FundingDiscovery["unpairedAllocations"]>[0],
    ) =>
      new FundingDiscovery(
        this.program,
        this.options.connection,
        this.options.wallet.publicKey,
      ).unpairedAllocations(options),
  };

  private orderAddress(clientNonce: bigint): PublicKey {
    return pda([
      Buffer.from("order"),
      this.marketAddress.toBuffer(),
      this.options.wallet.publicKey.toBuffer(),
      u64(clientNonce, "clientNonce").toArrayLike(Buffer, "le", 8),
    ]);
  }

  private async submitTrade(
    input: TradeInput | ReductionInput | CloseInput | ReverseInput,
    intent: TradeIntent,
  ): Promise<DepthOperation> {
    const appId = this.options.appId;
    if (!appId) throw new Error("An app ID is required to submit a trade");
    const clientNonce = input.clientNonce ?? BigInt(nonce().toString());
    const orderNonce = u64(clientNonce, "clientNonce");
    const order = this.orderAddress(clientNonce);
    const existing = await this.options.connection.getAccountInfo(
      order,
      "confirmed",
    );
    if (existing) {
      const operation = this.trade.operation(clientNonce);
      const snapshot = await operation.status();
      if (snapshot.owner !== this.options.wallet.publicKey.toBase58())
        throw new Error("Order owner does not match");
      return operation;
    }

    if (input.marketId !== SOL_USD_MARKET_ID) {
      throw new Error("Only SOL-USD is supported");
    }
    u64(input.maxFee, "maxFee");
    if (input.maxFee === 0n)
      throw new RangeError("Trade fee cap must be positive");
    const additionalMargin = "margin" in input ? input.margin : 0n;
    u64(additionalMargin, "margin");
    let amount =
      intent === "close"
        ? 0n
        : intent === "reduce"
          ? 0n
          : (input as TradeInput).notional;
    u64(amount, "notional");
    if ((intent === "increase" || intent === "reverse") && amount === 0n)
      throw new RangeError("Trade amount must be positive");
    if (
      "positionId" in input &&
      input.positionId &&
      !input.positionId.equals(this.accountAddress())
    )
      throw new Error("Position does not belong to this wallet and market");
    await this.ensureBalanceReady();
    await this.ensureMarketReady();
    let [market, protocol, account, app] = await Promise.all([
      this.market(),
      this.read<ProtocolState>("Protocol", this.protocolAddress),
      this.read<AccountState>("MarketAccount", this.accountAddress()),
      this.read<AppState>("AppConfig", appAddress(appId)),
    ]);
    const deadline = tradeDeadline(
      input,
      Math.floor(Date.now() / 1_000),
      market.state.config.maxOrderQueueSeconds,
    );
    tradeLimit(input, "long", BigInt(market.state.oraclePriceE8.toString()));
    this.validateTrade(
      market.state,
      protocol,
      account,
      app,
      appId,
      intent,
      deadline,
    );
    if (additionalMargin > 0n) {
      const transfer = await this.funding.allocate(
        additionalMargin,
        clientNonce,
      );
      const allocationDeadline = Date.now() + 120_000;
      for (;;) {
        const current = await transfer.status();
        if (current.state === "settled") break;
        if (current.state === "rejected" || current.state === "refunded")
          throw new Error(
            `Margin allocation ${transfer.id.toBase58()} ${current.state}`,
          );
        if (current.state === "escrow") {
          try {
            await transfer.settle();
          } catch (error) {
            if ((await transfer.status()).state === "escrow") throw error;
          }
        }
        if (Date.now() >= allocationDeadline)
          throw new Error(
            `Margin allocation ${transfer.id.toBase58()} is pending`,
          );
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      [market, protocol, account, app] = await Promise.all([
        this.market(),
        this.read<ProtocolState>("Protocol", this.protocolAddress),
        this.read<AccountState>("MarketAccount", this.accountAddress()),
        this.read<AppState>("AppConfig", appAddress(appId)),
      ]);
      this.validateTrade(
        market.state,
        protocol,
        account,
        app,
        appId,
        intent,
        deadline,
      );
    }
    const viewDeadline = Date.now() + 120_000;
    let position: PositionSnapshot;
    for (;;) {
      const remaining = viewDeadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          "Private position did not stabilize before the trade deadline",
        );
      }
      try {
        position = await this.position.summary({ timeoutMs: remaining });
      } catch (error) {
        if (
          !String(error).includes(
            "Market account is processing another operation",
          )
        ) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }
      [market, account] = await Promise.all([
        this.market(),
        this.read<AccountState>("MarketAccount", this.accountAddress()),
      ]);
      if (
        position.status === "ready" &&
        enumName(account.status) === "ready" &&
        account.version.toString() === position.version.toString()
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    this.validateTrade(
      market.state,
      protocol,
      account,
      app,
      appId,
      intent,
      deadline,
    );
    if (
      position.status !== "ready" ||
      position.collateral === undefined ||
      position.position === undefined
    )
      throw new Error(
        `Private position view ${position.id} is ${position.status}`,
      );
    const currentSide = position.position > 0n ? "long" : "short";
    const direction =
      intent === "reduce" || intent === "close"
        ? currentSide === "long"
          ? "short"
          : "long"
        : (input as TradeInput).direction;
    encodeSide(direction);
    const worstPriceE8 = tradeLimit(
      input,
      direction,
      BigInt(market.state.oraclePriceE8.toString()),
    );
    if (
      (intent === "reduce" || intent === "close" || intent === "reverse") &&
      position.position === 0n
    )
      throw new Error("There is no position to manage");
    if (
      intent === "increase" &&
      position.position !== 0n &&
      direction !== currentSide
    )
      throw new Error("Use trade.reverse for an opposite-side position");
    if (intent === "reverse" && direction === currentSide)
      throw new Error("Reversal must choose the opposite side");
    if (intent === "reduce")
      amount = resolveAmount(
        (input as ReductionInput).amount,
        position.position < 0n ? -position.position : position.position,
        "reduction",
      );
    u64(position.collateral, "collateral");
    if (position.collateral === 0n)
      throw new Error("The market account has no collateral");
    const quotes = market.state.activeQuotes.slice(
      0,
      market.state.activeQuoteCount,
    );
    if (quotes.length === 0) throw new Error("No active maker quote");
    const keys = [market.state.backstopOffer, ...quotes];
    const records = await this.options.connection.getMultipleAccountsInfo(
      keys,
      "confirmed",
    );
    records.forEach((info, index) => {
      if (!info?.owner.equals(DEPTH_PROGRAM_ID)) {
        throw new Error(`Market quote snapshot missing account ${index}`);
      }
    });
    const mxePublicKey = await getMXEPublicKey(this.provider, DEPTH_PROGRAM_ID);
    if (!mxePublicKey) throw new Error("MXE public key is unavailable");
    const secret = x25519.utils.randomSecretKey();
    const inputKey = x25519.getPublicKey(secret);
    const inputNonce = randomBytes(16);
    const cipher = new RescueCipher(
      x25519.getSharedSecret(secret, mxePublicKey),
    );
    const ciphertexts = cipher.encrypt(
      circuits.OrderInput.pack({
        side: encodeSide(direction),
        amount,
        margin: position.collateral,
        limit_price: worstPriceE8,
        max_fee: input.maxFee,
        intent: BigInt(
          ["increase", "reduce", "close", "reverse"].indexOf(intent),
        ),
        version: position.version,
      }),
      inputNonce,
    );
    const offset = nonce();
    const queue = await this.queue("match_order", offset);
    const signature = await this.program.methods
      .submitOrder(
        offset,
        orderNonce,
        appId,
        app.feeBps,
        app.version,
        new anchor.BN(deadline),
        market.state.revision,
        market.state.oracleTimestamp,
        ciphertexts,
        Array.from(inputKey),
        new anchor.BN(inputNonce, "le"),
      )
      .accountsPartial({
        ...queue,
        trader: this.options.wallet.publicKey,
        protocol: this.protocolAddress,
        appConfig: appAddress(appId),
        market: this.marketAddress,
        marketAccount: this.accountAddress(),
        order,
      })
      .remainingAccounts([
        ...keys.map((pubkey) => ({
          pubkey,
          isSigner: false,
          isWritable: false,
        })),
        { pubkey: recoveryConfigAddress(), isSigner: false, isWritable: false },
        {
          pubkey: pda([Buffer.from("fee-recovery"), order.toBuffer()]),
          isSigner: false,
          isWritable: true,
        },
      ])
      .rpc({ commitment: "confirmed" })
      .catch((error) => submissionError(order.toBase58(), error));
    return new DepthOperation(
      order,
      signature,
      this.program,
      this.options.connection,
      (id) => this.requestFillView(id),
      position,
    );
  }

  private validateTrade(
    market: MarketState,
    protocol: ProtocolState,
    account: AccountState,
    app: AppState,
    appId: PublicKey,
    intent: TradeIntent = "increase",
    deadline: number,
  ): void {
    const now = Math.floor(Date.now() / 1_000);
    const marketStatus = enumName(market.status);
    if (
      (marketStatus !== "active" || !protocol.tradingEnabled) &&
      !(
        (intent === "reduce" || intent === "close") &&
        marketStatus === "paused"
      )
    ) {
      throw new Error("Market is paused");
    }
    if (!app.active || !app.app.equals(appId)) {
      throw new Error("App registration is inactive");
    }
    if (
      enumName(account.status) !== "ready" ||
      !account.market.equals(this.marketAddress) ||
      !account.owner.equals(this.options.wallet.publicKey)
    ) {
      throw new Error("Market account is unavailable");
    }
    if (market.pendingOrders !== 0 || market.activeQuoteCount === 0) {
      throw new Error("Market is processing another order or has no quotes");
    }
    const age = now - market.oracleTimestamp.toNumber();
    if (age < 0 || age > market.config.maxOracleAgeSeconds) {
      throw new Error("Oracle update is stale");
    }
    if (
      deadline <= now ||
      deadline - now > market.config.maxOrderQueueSeconds
    ) {
      throw new Error("Order deadline is outside market policy");
    }
  }
}

export async function createDepth(options: DepthOptions): Promise<DepthClient> {
  return DepthClient.create(options);
}
