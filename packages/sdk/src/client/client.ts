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
  DEPTH_IDL,
  DEPTH_PROGRAM_ID,
  marketAddress,
  protocolAddress,
  recoveryConfigAddress,
  SOL_USD_MARKET_ID,
} from "@depth/bindings";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import { verifyDeployment } from "@/chain/manifest";
import { arciumAccount } from "@/chain/arcium";
import { AppAdmin } from "@/app/app";
import { FundingDiscovery } from "@/account/discovery";
import { FundingClient } from "@/account/funding";
import { submissionError } from "@/operation/error";
import { DepthOperation } from "@/operation/operation";
import { DepthRecovery } from "@/recovery/recovery";
import { encodeSide, u64 } from "@/trade/input";
import { DepthView } from "@/view/view";
import type { BalanceSnapshot, PositionSnapshot } from "@/view/view";
import type {
  AccountState,
  AppState,
  DepthOptions,
  MarketState,
  OrderState,
  ProtocolState,
  TradeInput,
  TradeIntent,
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
  readonly marketAddress = marketAddress();
  readonly protocolAddress = protocolAddress();
  readonly mxeAddress = getMXEAccAddress(DEPTH_PROGRAM_ID);

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

  private constructor(readonly options: DepthOptions) {
    this.provider = new anchor.AnchorProvider(
      options.connection,
      options.wallet,
      { commitment: "confirmed", preflightCommitment: "confirmed" },
    );
    this.program = new anchor.Program(DEPTH_IDL, this.provider);
  }

  static async create(options: DepthOptions): Promise<DepthClient> {
    const client = new DepthClient(options);
    await verifyDeployment(client.provider, options.deployment);
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
      Buffer.from(getCompDefAccOffset(name)).readUInt32LE(),
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
      !record.trader.equals(this.options.wallet.publicKey) ||
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
        view,
      })
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

  readonly account = {
    pending: (options?: Parameters<FundingDiscovery["pending"]>[0]) =>
      new FundingDiscovery(
        this.program,
        this.options.connection,
        this.options.wallet.publicKey,
      ).pending(options),
    cancelOpen: () => this.funding.cancelOpenBalance(),
    open: async () => this.funding.openBalance(),
    deposit: async (source: PublicKey, amount: bigint, clientNonce: bigint) =>
      this.funding.deposit(source, amount, clientNonce),
    withdrawalHandle: (clientNonce: bigint) =>
      this.funding.withdrawalHandle(clientNonce),
    depositHandle: (nonce: bigint) => this.funding.depositHandle(nonce),
    withdraw: async (
      destination: PublicKey,
      amount: bigint,
      clientNonce: bigint,
    ) => this.funding.withdraw(destination, amount, clientNonce),
    allocate: async (amount: bigint, clientNonce: bigint) =>
      this.funding.allocate(amount, clientNonce),
    release: async (amount: bigint, clientNonce: bigint) =>
      this.funding.release(amount, clientNonce),
    transferHandle: (nonce: bigint) => this.funding.transferHandle(nonce),
    summary: async (
      options: { timeoutMs: number; pollMs?: number } = { timeoutMs: 30_000 },
    ): Promise<BalanceSnapshot> => {
      const view = await this.requestBalanceView();
      return (await view.wait(options)) as BalanceSnapshot;
    },
  };

  readonly position = {
    cancelOpen: () => this.funding.cancelOpenMarket(),
    addMargin: (amount: bigint, clientNonce: bigint) =>
      this.funding.allocate(amount, clientNonce),
    removeMargin: (amount: bigint, clientNonce: bigint) =>
      this.funding.release(amount, clientNonce),
    open: async () => this.funding.openMarket(),
    summary: async (
      options: { timeoutMs: number; pollMs?: number } = { timeoutMs: 30_000 },
    ): Promise<PositionSnapshot> => {
      const view = await this.requestMarketView();
      return (await view.wait(options)) as PositionSnapshot;
    },
  };

  readonly trade = {
    submit: (input: TradeInput) => this.submitTrade(input, "increase"),
    reduce: (input: TradeInput) => this.submitTrade(input, "reduce"),
    close: (input: TradeInput) => this.submitTrade(input, "close"),
    reverse: (input: TradeInput) => this.submitTrade(input, "reverse"),
    operation: (clientNonce: bigint) =>
      new DepthOperation(
        this.orderAddress(clientNonce),
        undefined,
        this.program,
        this.options.connection,
        (order) => this.requestFillView(order),
      ),
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
    input: TradeInput,
    intent: TradeIntent,
  ): Promise<DepthOperation> {
    const appId = this.options.appId;
    if (!appId) throw new Error("An app ID is required to submit a trade");
    const orderNonce = u64(input.clientNonce, "clientNonce");
    const order = this.orderAddress(input.clientNonce);
    const existing = await this.options.connection.getAccountInfo(
      order,
      "confirmed",
    );
    if (existing) {
      const operation = this.trade.operation(input.clientNonce);
      const snapshot = await operation.status();
      if (snapshot.owner !== this.options.wallet.publicKey.toBase58())
        throw new Error("Order owner does not match");
      return operation;
    }

    if (input.marketId !== SOL_USD_MARKET_ID) {
      throw new Error("Only SOL-USD is supported");
    }
    encodeSide(input.direction);
    const values = [input.size, input.margin, input.worstPriceE8, input.maxFee];
    values.forEach((value, index) =>
      u64(value, ["size", "margin", "worstPriceE8", "maxFee"][index]),
    );
    if (values.some((value) => value === 0n)) {
      throw new RangeError("Trade amounts and price must be positive");
    }
    if (!Number.isSafeInteger(input.expiresAt)) {
      throw new RangeError("expiresAt must be a Unix second");
    }
    const [market, protocol, account, app] = await Promise.all([
      this.market(),
      this.read<ProtocolState>("Protocol", this.protocolAddress),
      this.read<AccountState>("MarketAccount", this.accountAddress()),
      this.read<AppState>("AppConfig", appAddress(appId)),
    ]);
    this.validateTrade(input, market.state, protocol, account, app, appId);
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
    u64(input.positionVersion, "positionVersion");
    if (account.version.toString() !== input.positionVersion.toString()) {
      throw new Error("Position version changed; request a fresh private view");
    }
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
        side: encodeSide(input.direction),
        size: input.size,
        margin: input.margin,
        limit_price: input.worstPriceE8,
        max_fee: input.maxFee,
        intent: BigInt(
          ["increase", "reduce", "close", "reverse"].indexOf(intent),
        ),
        version: input.positionVersion,
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
        new anchor.BN(input.expiresAt),
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
    );
  }

  private validateTrade(
    input: TradeInput,
    market: MarketState,
    protocol: ProtocolState,
    account: AccountState,
    app: AppState,
    appId: PublicKey,
  ): void {
    const now = Math.floor(Date.now() / 1_000);
    if (!protocol.tradingEnabled || enumName(market.status) !== "active") {
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
      input.expiresAt <= now ||
      input.expiresAt - now > market.config.maxOrderQueueSeconds
    ) {
      throw new Error("Order deadline is outside market policy");
    }
  }
}

export async function createDepth(options: DepthOptions): Promise<DepthClient> {
  return DepthClient.create(options);
}
