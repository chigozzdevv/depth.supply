import { Buffer } from "buffer";
import * as anchor from "@anchor-lang/core";
import {
  getMXEAccAddress,
  getMXEPublicKey,
  RescueCipher,
  x25519,
} from "@arcium-hq/client";
import {
  accountOffsets,
  packQuoteCurve,
  DEPTH_IDL,
  DEPTH_PROGRAM_ID,
  marketAddress,
  quoteQueueAddress,
  protocolAddress,
  SOL_USD_MARKET_ID,
} from "@depthhq/bindings";
import { DepthView } from "@depthhq/sdk/views";
import { DepthRecovery } from "@depthhq/sdk/recovery";
import type { FillSnapshot, PositionSnapshot } from "@depthhq/sdk/views";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "@/chain/random";
import {
  DepthClient,
  DepthProvider,
  FundingClient,
  verifyDeployment,
  resolveConnection,
} from "@depthhq/sdk";
import type {
  AmountSelector,
  CloseInput,
  ReductionInput,
  ReverseInput,
  TradeInput,
} from "@depthhq/sdk";
import { mxeAccount, queueAccounts } from "@/chain/arcium";
import { BackstopHandle } from "@/backstop/backstop";
import { FillHistory } from "@/fill/history";
import { createCursorStore } from "@/fill/store";
import { QuoteHandle } from "@/quote/quote";
import { QuoteReplacement } from "@/quote/replacement";
import type {
  GrantState,
  BackstopInput,
  MakerOptions,
  ResolvedMakerOptions,
  MarketState,
  QuoteInput,
  QuoteRequest,
  QuoteState,
} from "@/client/types";

function pda(seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, DEPTH_PROGRAM_ID)[0];
}

function u64(value: bigint, name: string): anchor.BN {
  if (typeof value !== "bigint" || value < 0n || value > (1n << 64n) - 1n) {
    throw new RangeError(`${name} must be an unsigned 64-bit bigint`);
  }
  return new anchor.BN(value.toString());
}

function offset(): anchor.BN {
  return new anchor.BN(randomBytes(8), "le");
}

export async function retryQuote<T>(
  action: () => Promise<T>,
  deadline: number,
): Promise<T> {
  for (;;) {
    try {
      return await action();
    } catch (error) {
      if (
        !(error instanceof anchor.AnchorError) ||
        error.error.errorCode.code !== "WrongMarketAccountStatus" ||
        Date.now() >= deadline
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

function stateName(value: Record<string, unknown>): string {
  return Object.keys(value)[0] ?? "unknown";
}

export class MakerClient {
  readonly provider: anchor.AnchorProvider;
  readonly program: anchor.Program;
  readonly position: ReturnType<MakerClient["positionActions"]>;
  readonly marketAddress = marketAddress();
  readonly quoteQueueAddress = quoteQueueAddress();
  readonly protocolAddress = protocolAddress();
  readonly backstop: ((id: PublicKey) => BackstopHandle) & {
    offer: (input: BackstopInput) => Promise<BackstopHandle>;
  };
  private ownerClient?: Promise<DepthClient>;

  private owned(): Promise<DepthClient> {
    if (!this.options.wallet.publicKey.equals(this.options.maker))
      throw new Error(
        "Operator wallet cannot move or trade the maker's collateral",
      );
    this.ownerClient ??= DepthClient.create({
      deployment: this.options.deployment,
      connection: this.options.connection,
      wallet: this.options.wallet,
      appId: this.options.appId,
    });
    return this.ownerClient;
  }

  get funding(): FundingClient {
    return new FundingClient(
      this.program,
      this.options.connection,
      this.options.maker,
      (name, offset) => this.queue(name, offset),
    );
  }

  get recovery(): DepthRecovery {
    return new DepthRecovery(
      this.program,
      this.options.connection,
      this.options.maker,
    );
  }

  private constructor(readonly options: ResolvedMakerOptions) {
    this.provider = new DepthProvider(options.connection, options.wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    this.program = new anchor.Program(DEPTH_IDL, this.provider);
    this.position = this.positionActions();
    this.backstop = Object.assign(
      (id: PublicKey) => new BackstopHandle(id, this),
      { offer: (input: BackstopInput) => BackstopHandle.offer(this, input) },
    );
  }

  static async create(options: MakerOptions): Promise<MakerClient> {
    const appId =
      typeof options.appId === "string"
        ? new PublicKey(options.appId)
        : options.appId;
    if (
      options.maker &&
      options.makerOwner &&
      !options.maker.equals(options.makerOwner)
    ) {
      throw new Error("maker and makerOwner identify different accounts");
    }
    const resolved = {
      ...options,
      ...(await resolveConnection(options)),
      maker: options.makerOwner ?? options.maker ?? options.wallet.publicKey,
      appId,
    };
    const client = new MakerClient(resolved);
    await verifyDeployment(client.provider, resolved.deployment);
    const [programInfo, mxe, market, protocol] = await Promise.all([
      resolved.connection.getAccountInfo(DEPTH_PROGRAM_ID, "confirmed"),
      mxeAccount(client.provider).fetch(getMXEAccAddress(DEPTH_PROGRAM_ID)),
      client.read<MarketState>("Market", client.marketAddress),
      client.read<{ settlementMint: PublicKey; vault: PublicKey }>(
        "Protocol",
        client.protocolAddress,
      ),
    ]);
    if (
      !programInfo?.executable ||
      !mxe.mxeProgramId.equals(DEPTH_PROGRAM_ID)
    ) {
      throw new Error("Depth program or MXE is unavailable");
    }
    if (
      !market.settlementMint.equals(protocol.settlementMint) ||
      !market.vault.equals(protocol.vault)
    ) {
      throw new Error("Depth market and protocol vault disagree");
    }
    const accountInfo = await resolved.connection.getAccountInfo(
      client.marketAccount(),
      "confirmed",
    );
    if (!accountInfo) return client;
    if (!accountInfo.owner.equals(DEPTH_PROGRAM_ID)) {
      throw new Error("Maker market account is not owned by Depth");
    }
    const account = client.program.coder.accounts.decode<{
      owner: PublicKey;
      market: PublicKey;
    }>("marketAccount", accountInfo.data);
    if (
      !account.owner.equals(resolved.maker) ||
      !account.market.equals(client.marketAddress)
    ) {
      throw new Error("Maker market account does not match this market");
    }
    return client;
  }

  private accountActions() {
    const actions = {
      history: async (
        options?: Parameters<DepthClient["account"]["history"]>[0],
      ) => (await this.owned()).account.history(options),
      cancelOpen: () => this.funding.cancelOpenBalance(),
      open: async () => this.funding.openBalance(),
      openMarket: async () => this.funding.openMarket(),
      summary: async () => (await this.owned()).account.summary(),
      pending: async () => (await this.owned()).account.pending(),
      deposit: async (
        sourceOrAmount: PublicKey | bigint,
        amount?: bigint,
        clientNonce?: bigint,
      ) => {
        if (sourceOrAmount instanceof PublicKey) {
          if (amount === undefined || clientNonce === undefined)
            throw new RangeError("Source deposits require amount and nonce");
          return this.funding.deposit(sourceOrAmount, amount, clientNonce);
        }
        return (await this.owned()).account.deposit(sourceOrAmount);
      },
      withdrawalHandle: (clientNonce: bigint) =>
        this.funding.withdrawalHandle(clientNonce),
      depositHandle: (nonce: bigint) => this.funding.depositHandle(nonce),
      withdraw: async (
        destinationOrAmount: PublicKey | AmountSelector,
        amount?: bigint,
        clientNonce?: bigint,
      ) => {
        if (destinationOrAmount instanceof PublicKey) {
          if (amount === undefined || clientNonce === undefined)
            throw new RangeError(
              "Destination withdrawals require amount and nonce",
            );
          return this.funding.withdraw(
            destinationOrAmount,
            amount,
            clientNonce,
          );
        }
        return (await this.owned()).account.withdraw(destinationOrAmount);
      },
      allocate: async (
        input:
          | bigint
          | { marketId: typeof SOL_USD_MARKET_ID; amount: AmountSelector },
        clientNonce?: bigint,
      ) => (await this.owned()).account.allocate(input, clientNonce),
      release: async (
        input:
          | bigint
          | { marketId: typeof SOL_USD_MARKET_ID; amount: AmountSelector },
        clientNonce?: bigint,
      ) => (await this.owned()).account.release(input, clientNonce),
      transferHandle: (nonce: bigint) => this.funding.transferHandle(nonce),
    };
    return Object.assign(() => actions, actions);
  }

  readonly account = this.accountActions();

  readonly positions = {
    list: async () => (await this.owned()).positions.list(),
  };

  readonly trade = {
    submit: async (input: TradeInput) =>
      (await this.owned()).trade.submit(input),
    reduce: async (input: ReductionInput) =>
      (await this.owned()).trade.reduce(input),
    close: async (input: CloseInput) => (await this.owned()).trade.close(input),
    reverse: async (input: ReverseInput) =>
      (await this.owned()).trade.reverse(input),
  };

  marketAccount(): PublicKey {
    return pda([
      Buffer.from("market-account"),
      this.marketAddress.toBuffer(),
      this.options.maker.toBuffer(),
    ]);
  }

  grantAddress(operator = this.options.wallet.publicKey): PublicKey {
    return pda([
      Buffer.from("operator"),
      this.marketAddress.toBuffer(),
      this.options.maker.toBuffer(),
      operator.toBuffer(),
    ]);
  }

  async read<T>(
    name: string,
    address: PublicKey,
    commitment: "confirmed" | "finalized" = "confirmed",
  ): Promise<T> {
    const info = await this.options.connection.getAccountInfo(
      address,
      commitment,
    );
    if (!info || !info.owner.equals(DEPTH_PROGRAM_ID)) {
      throw new Error(`${name} account is unavailable`);
    }
    return this.program.coder.accounts.decode<T>(
      name[0].toLowerCase() + name.slice(1),
      info.data,
    );
  }

  async quoteState(id: PublicKey): Promise<QuoteState> {
    const quote = await this.read<QuoteState>("QuoteRecord", id);
    if (
      !quote.maker.equals(this.options.maker) ||
      !quote.market.equals(this.marketAddress)
    ) {
      throw new Error("Quote does not belong to this maker and market");
    }
    return quote;
  }

  async queue(name: string, computationOffset: anchor.BN) {
    return queueAccounts(
      this.provider,
      this.options.connection,
      name,
      computationOffset,
    );
  }

  private async grantFor(
    capacity: bigint,
    expiry: number,
  ): Promise<PublicKey | undefined> {
    if (this.options.wallet.publicKey.equals(this.options.maker))
      return undefined;
    const address = this.grantAddress();
    const grant = await this.read<GrantState>("OperatorGrant", address);
    if (
      !grant.active ||
      !grant.maker.equals(this.options.maker) ||
      !grant.operator.equals(this.options.wallet.publicKey) ||
      !grant.market.equals(this.marketAddress) ||
      BigInt(grant.maxCapacity.toString()) < capacity ||
      grant.expiresAt.toNumber() < expiry
    ) {
      throw new Error("Quote operator grant does not cover this quote");
    }
    return address;
  }

  readonly operator = {
    list: async () => {
      if (!this.options.wallet.publicKey.equals(this.options.maker))
        throw new Error("Only the maker can list its operator grants");
      const grants = await this.options.connection.getProgramAccounts(
        DEPTH_PROGRAM_ID,
        {
          commitment: "confirmed",
          filters: [
            {
              memcmp: this.program.coder.accounts.memcmp("operatorGrant"),
            },
            {
              memcmp: {
                offset: accountOffsets.OperatorGrant.maker,
                bytes: this.options.maker.toBase58(),
              },
            },
            {
              memcmp: {
                offset: accountOffsets.OperatorGrant.market,
                bytes: this.marketAddress.toBase58(),
              },
            },
          ],
        },
      );
      return grants
        .map(({ pubkey, account }) => ({
          id: pubkey,
          state: this.program.coder.accounts.decode<GrantState>(
            "operatorGrant",
            account.data,
          ),
        }))
        .filter(
          ({ state }) =>
            state.maker.equals(this.options.maker) &&
            state.market.equals(this.marketAddress),
        )
        .sort((a, b) =>
          a.state.operator
            .toBase58()
            .localeCompare(b.state.operator.toBase58()),
        );
    },
    authorize: async (input: {
      operator: PublicKey;
      maxCapacity: bigint;
      expiresAt: number;
      canView: boolean;
    }): Promise<string> => {
      if (!this.options.wallet.publicKey.equals(this.options.maker)) {
        throw new Error("Only the maker can authorize an operator");
      }
      if (!Number.isSafeInteger(input.expiresAt)) {
        throw new RangeError("expiresAt must be a Unix second");
      }
      return this.program.methods
        .grantOperator(
          u64(input.maxCapacity, "maxCapacity"),
          new anchor.BN(input.expiresAt),
          input.canView,
        )
        .accountsPartial({
          maker: this.options.maker,
          market: this.marketAddress,
          marketAccount: this.marketAccount(),
          operator: input.operator,
          grant: this.grantAddress(input.operator),
        })
        .rpc({ commitment: "confirmed" });
    },
    revoke: async (operator: PublicKey): Promise<string> => {
      if (!this.options.wallet.publicKey.equals(this.options.maker)) {
        throw new Error("Only the maker can revoke an operator");
      }
      return this.program.methods
        .revokeOperator()
        .accountsPartial({
          maker: this.options.maker,
          grant: this.grantAddress(operator),
        })
        .rpc({ commitment: "confirmed" });
    },
  };

  readonly quote = {
    replacement: (prior: PublicKey, clientNonce: bigint) =>
      new QuoteReplacement(this, prior, clientNonce),
    publish: async (request: QuoteRequest): Promise<QuoteHandle> => {
      const clientNonce =
        request.clientNonce ??
        BigInt(new anchor.BN(randomBytes(8), "le").toString());
      const readyDeadline = Date.now() + 60_000;
      return retryQuote(async () => {
        const quoteNonce = u64(clientNonce, "clientNonce");
        const id = pda([
          Buffer.from("quote"),
          this.marketAddress.toBuffer(),
          this.options.maker.toBuffer(),
          quoteNonce.toArrayLike(Buffer, "le", 8),
        ]);
        if (await this.options.connection.getAccountInfo(id, "confirmed")) {
          const existing = await this.quoteState(id);
          if (
            BigInt(existing.capacity.toString()) !== request.maxCapacity ||
            ("expiresAt" in request &&
              existing.expiry.toNumber() !== request.expiresAt)
          ) {
            throw new Error(
              "Quote nonce is already bound to different public terms",
            );
          }
          return this.quote.get(id);
        }
        for (;;) {
          const account = await this.read<{ status: Record<string, unknown> }>(
            "MarketAccount",
            this.marketAccount(),
          );
          if (stateName(account.status) === "ready") break;
          if (Date.now() >= readyDeadline) {
            throw new Error("Maker account is processing another operation");
          }
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
        const market = await this.read<MarketState>(
          "Market",
          this.marketAddress,
        );
        const input: QuoteInput =
          "tiers" in request
            ? request
            : this.flatQuote(request, market, clientNonce);
        this.validateQuote(input, market);
        const grant = await this.grantFor(input.maxCapacity, input.expiresAt);
        const mxePublicKey = await getMXEPublicKey(
          this.provider,
          DEPTH_PROGRAM_ID,
        );
        if (!mxePublicKey) throw new Error("MXE public key is unavailable");
        const secret = x25519.utils.randomSecretKey();
        const inputKey = x25519.getPublicKey(secret);
        const inputNonce = randomBytes(16);
        const cipher = new RescueCipher(
          x25519.getSharedSecret(secret, mxePublicKey),
        );
        const bid = Array.from(
          { length: 4 },
          (_, i) => input.tiers[i]?.bidE8 ?? 0n,
        );
        const ask = Array.from(
          { length: 4 },
          (_, i) => input.tiers[i]?.askE8 ?? 0n,
        );
        const reciprocal = (price: bigint) => {
          if (price === 0n) return 0n;
          if (price < 100_000_000n)
            throw new RangeError("SOL quote prices must be at least $1");
          return (1n << 76n) / price;
        };
        const ciphertexts = cipher.encrypt(
          packQuoteCurve({
            bid,
            ask,
            bidReciprocal: bid.map(reciprocal),
            askReciprocal: ask.map(reciprocal),
          }),
          inputNonce,
        );
        const computationOffset = offset();
        const queue = await this.queue("prepare_quote", computationOffset);
        const signature = await this.program.methods
          .submitQuote(
            computationOffset,
            quoteNonce,
            u64(input.maxCapacity, "maxCapacity"),
            input.tiers.length,
            new anchor.BN(input.expiresAt),
            market.revision,
            market.oracleTimestamp,
            ciphertexts,
            Array.from(inputKey),
            new anchor.BN(inputNonce, "le"),
          )
          .accountsPartial({
            ...queue,
            payer: this.options.wallet.publicKey,
            market: this.marketAddress,
            marketAccount: this.marketAccount(),
            grant: grant ?? this.program.programId,
            quote: id,
          })
          .rpc({ commitment: "confirmed" });
        return new QuoteHandle(id, signature, this);
      }, readyDeadline);
    },
    get: (id: PublicKey): QuoteHandle => new QuoteHandle(id, undefined, this),
    list: async (options: { cursor?: string; limit?: number } = {}) => {
      const limit = options.limit ?? 20;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new RangeError("limit must be an integer from 1 to 100");
      const cursor = options.cursor
        ? new PublicKey(options.cursor).toBase58()
        : undefined;
      const accounts = await this.options.connection.getProgramAccounts(
        DEPTH_PROGRAM_ID,
        {
          commitment: "confirmed",
          dataSlice: { offset: 0, length: 0 },
          filters: [
            { memcmp: this.program.coder.accounts.memcmp("quoteRecord") },
            {
              memcmp: {
                offset: accountOffsets.QuoteRecord.maker,
                bytes: this.options.maker.toBase58(),
              },
            },
            {
              memcmp: {
                offset: accountOffsets.QuoteRecord.market,
                bytes: this.marketAddress.toBase58(),
              },
            },
          ],
        },
      );
      const ids = accounts
        .map(({ pubkey }) => pubkey)
        .filter((id) => !cursor || id.toBase58() > cursor)
        .sort((a, b) =>
          a.toBase58() < b.toBase58()
            ? -1
            : a.toBase58() > b.toBase58()
              ? 1
              : 0,
        );
      const selected = ids.slice(0, limit);
      if (selected.length === 0) return { items: [], nextCursor: null };
      const infos = await this.options.connection.getMultipleAccountsInfo(
        selected,
        "confirmed",
      );
      const items = selected.map((id, index) => {
        const info = infos[index];
        if (!info?.owner.equals(DEPTH_PROGRAM_ID))
          throw new Error("Quote changed during discovery");
        const quote = this.program.coder.accounts.decode<QuoteState>(
          "quoteRecord",
          info.data,
        );
        const canonical = pda([
          Buffer.from("quote"),
          this.marketAddress.toBuffer(),
          this.options.maker.toBuffer(),
          quote.nonce.toArrayLike(Buffer, "le", 8),
        ]);
        if (
          !id.equals(canonical) ||
          !quote.maker.equals(this.options.maker) ||
          !quote.market.equals(this.marketAddress)
        )
          throw new Error("Quote identity changed during discovery");
        return {
          id,
          nonce: BigInt(quote.nonce.toString()),
          status: stateName(quote.status),
          replacementNonce:
            quote.replacementNonce == null
              ? undefined
              : BigInt(quote.replacementNonce.toString()),
          handle: this.quote.get(id),
        };
      });
      return {
        items,
        nextCursor: ids.length > limit ? selected.at(-1)!.toBase58() : null,
      };
    },
    active: async (): Promise<QuoteHandle[]> => {
      const market = await this.read<MarketState>("Market", this.marketAddress);
      const handles: QuoteHandle[] = [];
      for (const id of market.activeQuotes.slice(0, market.activeQuoteCount)) {
        const quote = await this.read<QuoteState>("QuoteRecord", id);
        if (quote.maker.equals(this.options.maker))
          handles.push(this.quote.get(id));
      }
      return handles;
    },
    replace: async (
      prior: PublicKey,
      input: QuoteRequest,
      options: { timeoutMs?: number; pollMs?: number } = {},
    ): Promise<QuoteHandle> => {
      const nonce =
        input.clientNonce ??
        BigInt(new anchor.BN(randomBytes(8), "le").toString());
      return this.quote.replacement(prior, nonce).resume(input, options);
    },
  };

  private flatQuote(
    input: Exclude<QuoteRequest, QuoteInput>,
    market: MarketState,
    clientNonce: bigint,
  ): QuoteInput {
    if (input.marketId !== SOL_USD_MARKET_ID)
      throw new Error("Only SOL-USD is supported");
    if (
      !Number.isSafeInteger(input.validForSeconds) ||
      input.validForSeconds < 1 ||
      input.validForSeconds > market.config.maxQuoteLifetimeSeconds
    )
      throw new RangeError("Quote duration is outside market policy");
    const tiers = market.config.quoteTiers
      .map((size) => BigInt(size.toString()))
      .filter((size) => size > 0n && size <= input.maxCapacity)
      .map((size) => ({
        size,
        bidE8: input.bidE8,
        askE8: input.askE8,
      }));
    if (!tiers.length)
      throw new RangeError("Capacity is below the first quote tier");
    return {
      tiers,
      maxCapacity: input.maxCapacity,
      expiresAt: Math.floor(Date.now() / 1_000) + input.validForSeconds,
      clientNonce,
    };
  }

  private async viewGrant(): Promise<PublicKey | undefined> {
    if (this.options.wallet.publicKey.equals(this.options.maker)) {
      return undefined;
    }
    const address = this.grantAddress();
    const grant = await this.read<GrantState>("OperatorGrant", address);
    if (
      !grant.active ||
      !grant.canView ||
      !grant.maker.equals(this.options.maker) ||
      !grant.operator.equals(this.options.wallet.publicKey) ||
      !grant.market.equals(this.marketAddress) ||
      grant.expiresAt.toNumber() <= Math.floor(Date.now() / 1_000)
    ) {
      throw new Error("Maker view grant is inactive");
    }
    return address;
  }

  async requestMarketView(): Promise<DepthView> {
    const account = await this.read<{ status: Record<string, unknown> }>(
      "MarketAccount",
      this.marketAccount(),
    );
    if (stateName(account.status) !== "ready") {
      throw new Error("Maker account is processing another operation");
    }
    const grant = await this.viewGrant();
    const viewNonce = offset();
    const view = pda([
      Buffer.from("market-view"),
      this.marketAccount().toBuffer(),
      viewNonce.toArrayLike(Buffer, "le", 8),
    ]);
    return this.requestView("market", view, viewNonce, {
      market: this.marketAddress,
      marketAccount: this.marketAccount(),
      grant: grant ?? null,
    });
  }

  async requestFillView(order: PublicKey): Promise<DepthView> {
    const state = await this.read<{
      maker: PublicKey;
      market: PublicKey;
      status: Record<string, unknown>;
      kind: Record<string, unknown>;
    }>("OrderRecord", order);
    if (
      !state.maker.equals(this.options.maker) ||
      !state.market.equals(this.marketAddress) ||
      stateName(state.status) !== "filled" ||
      stateName(state.kind) !== "trade"
    ) {
      throw new Error("Fill is not a finalized trade by this maker");
    }
    const grant = await this.viewGrant();
    const viewNonce = offset();
    const view = pda([
      Buffer.from("fill-view"),
      order.toBuffer(),
      this.options.wallet.publicKey.toBuffer(),
      viewNonce.toArrayLike(Buffer, "le", 8),
    ]);
    return this.requestView("fill", view, viewNonce, {
      order,
      grant: grant ?? null,
    });
  }

  async requestQuoteView(quote: PublicKey): Promise<DepthView> {
    const state = await this.quoteState(quote);
    if (
      stateName(state.status) !== "active" &&
      stateName(state.status) !== "closing"
    )
      throw new Error("Quote balance is unavailable in this state");
    const grant = await this.viewGrant();
    const viewNonce = offset();
    const view = pda([
      Buffer.from("quote-view"),
      quote.toBuffer(),
      this.options.wallet.publicKey.toBuffer(),
      viewNonce.toArrayLike(Buffer, "le", 8),
    ]);
    return this.requestView("quote", view, viewNonce, {
      market: this.marketAddress,
      quote,
      grant: grant ?? null,
    });
  }

  private async requestView(
    kind: "market" | "fill" | "quote",
    view: PublicKey,
    viewNonce: anchor.BN,
    accounts: Record<string, PublicKey | null>,
  ): Promise<DepthView> {
    const mxePublicKey = await getMXEPublicKey(this.provider, DEPTH_PROGRAM_ID);
    if (!mxePublicKey) throw new Error("MXE public key is unavailable");
    const secret = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(secret);
    const computationOffset = offset();
    const queue = await this.queue(
      kind === "market"
        ? "view_market"
        : kind === "fill"
          ? "view_fill"
          : "view_quote",
      computationOffset,
    );
    const builder =
      kind === "market"
        ? this.program.methods.requestMarketView(
            computationOffset,
            viewNonce,
            Array.from(publicKey),
          )
        : kind === "fill"
          ? this.program.methods.requestFillView(
              computationOffset,
              viewNonce,
              Array.from(publicKey),
            )
          : this.program.methods.requestQuoteView(
              computationOffset,
              viewNonce,
              Array.from(publicKey),
            );
    const signature = await builder
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

  private positionActions(id?: PublicKey | string) {
    const address = this.marketAccount();
    if (
      id &&
      (typeof id === "string" ? id : id.toBase58()) !== address.toBase58()
    )
      throw new Error("Position does not belong to this maker and market");
    const actions = {
      id: address,
      cancelOpen: () => this.funding.cancelOpenMarket(),
      addMargin: async (amount: AmountSelector, clientNonce?: bigint) =>
        (await this.owned()).position.addMargin(amount, clientNonce),
      removeMargin: async (amount: AmountSelector, clientNonce?: bigint) =>
        (await this.owned()).position.removeMargin(amount, clientNonce),
      summary: async (
        options: { timeoutMs: number; pollMs?: number } = { timeoutMs: 30_000 },
      ): Promise<PositionSnapshot> => {
        const view = await this.requestMarketView();
        const result = (await view.wait(options)) as PositionSnapshot;
        if (result.status !== "pending") await view.close();
        return result;
      },
    };
    return Object.assign(
      (positionId?: PublicKey | string) => this.positionActions(positionId),
      actions,
    );
  }

  readonly fills = {
    list: (options?: Parameters<FillHistory["list"]>[0]) =>
      new FillHistory(this).list(options),
    subscribe: async (options: {
      marketId: typeof SOL_USD_MARKET_ID;
      onFill: (fill: {
        id: string;
        signature: string;
        slot: number;
        execution: FillSnapshot;
      }) => Promise<void>;
      onError: (error: unknown) => void;
      pollMs?: number;
    }) => {
      if (options.marketId !== SOL_USD_MARKET_ID)
        throw new Error("Only SOL-USD is supported");
      const genesis = await this.options.connection.getGenesisHash();
      const store = createCursorStore(
        genesis,
        this.options.maker.toBase58(),
        this.options.cursorDirectory,
      );
      const cursor = await store.load();
      return new FillHistory(this).subscribe(
        async (fill) => {
          const execution = await this.fills.get(new PublicKey(fill.id));
          if (execution.status !== "ready")
            throw new Error(
              `Private maker fill ${fill.id} is ${execution.status}`,
            );
          await options.onFill({ ...fill, execution });
        },
        {
          cursor,
          pollMs: options.pollMs,
          saveCursor: (head) => store.save(head),
          onError: options.onError,
        },
      );
    },
    get: async (
      order: PublicKey,
      options: { timeoutMs: number; pollMs?: number } = { timeoutMs: 30_000 },
    ): Promise<FillSnapshot> => {
      const view = await this.requestFillView(order);
      const result = (await view.wait(options)) as FillSnapshot;
      if (result.status !== "pending") await view.close();
      return result;
    },
  };

  private validateQuote(input: QuoteInput, market: MarketState): void {
    const now = Math.floor(Date.now() / 1_000);
    if (!["draft", "active"].includes(stateName(market.status)))
      throw new Error("Market does not accept quotes");
    if (input.tiers.length === 0 || input.tiers.length > 4) {
      throw new RangeError("A quote needs one to four tiers");
    }
    input.tiers.forEach((tier, index) => {
      u64(tier.size, "tier size");
      u64(tier.bidE8, "bidE8");
      u64(tier.askE8, "askE8");
      if (tier.size !== BigInt(market.config.quoteTiers[index].toString())) {
        throw new Error("Quote size must match the published market tier");
      }
      if (tier.bidE8 === 0n || tier.askE8 === 0n || tier.bidE8 >= tier.askE8) {
        throw new Error("Quote bid and ask are invalid");
      }
    });
    u64(input.maxCapacity, "maxCapacity");
    if (
      input.maxCapacity < input.tiers.at(-1)!.size ||
      input.maxCapacity > BigInt(market.config.maxAccountNotional.toString()) ||
      input.maxCapacity > BigInt(market.config.maxMarketNotional.toString())
    ) {
      throw new Error("Quote exceeds market capacity");
    }
    if (
      !Number.isSafeInteger(input.expiresAt) ||
      input.expiresAt <= now ||
      input.expiresAt - now > market.config.maxQuoteLifetimeSeconds
    ) {
      throw new Error("Quote expiry is outside market policy");
    }
    const oracleAge = now - market.oracleTimestamp.toNumber();
    if (oracleAge < 0 || oracleAge > market.config.maxOracleAgeSeconds) {
      throw new Error("Oracle update is stale");
    }
  }
}

export async function createDepthMaker(
  options: MakerOptions,
): Promise<MakerClient> {
  return MakerClient.create(options);
}
