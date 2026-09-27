import * as anchor from "@anchor-lang/core";
import {
  getMXEAccAddress,
  getMXEPublicKey,
  RescueCipher,
  x25519,
} from "@arcium-hq/client";
import {
  accountOffsets,
  DEPTH_IDL,
  DEPTH_PROGRAM_ID,
  marketAddress,
  protocolAddress,
  SOL_USD_MARKET_ID,
} from "@depth/bindings";
import { DepthView } from "@depth/sdk/views";
import { DepthRecovery } from "@depth/sdk/recovery";
import type { FillSnapshot, PositionSnapshot } from "@depth/sdk/views";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import { FundingClient, verifyDeployment } from "@depth/sdk";
import { mxeAccount, queueAccounts } from "@/chain/arcium";
import { FillHistory } from "@/fill/history";
import { QuoteHandle } from "@/quote/quote";
import type {
  GrantState,
  MakerOptions,
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

function stateName(value: Record<string, unknown>): string {
  return Object.keys(value)[0] ?? "unknown";
}

export class MakerClient {
  readonly provider: anchor.AnchorProvider;
  readonly program: anchor.Program;
  readonly marketAddress = marketAddress();
  readonly protocolAddress = protocolAddress();

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

  private constructor(readonly options: MakerOptions) {
    this.provider = new anchor.AnchorProvider(
      options.connection,
      options.wallet,
      {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      },
    );
    this.program = new anchor.Program(DEPTH_IDL, this.provider);
  }

  static async create(options: MakerOptions): Promise<MakerClient> {
    const client = new MakerClient(options);
    await verifyDeployment(client.provider, options.deployment);
    const [programInfo, mxe, market, protocol] = await Promise.all([
      options.connection.getAccountInfo(DEPTH_PROGRAM_ID, "confirmed"),
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
    const accountInfo = await options.connection.getAccountInfo(
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
      !account.owner.equals(options.maker) ||
      !account.market.equals(client.marketAddress)
    ) {
      throw new Error("Maker market account does not match this market");
    }
    return client;
  }

  readonly account = {
    cancelOpen: () => this.funding.cancelOpenBalance(),
    open: async () => this.funding.openBalance(),
    openMarket: async () => this.funding.openMarket(),
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

  async read<T>(name: string, address: PublicKey): Promise<T> {
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
          a.state.operator.toBase58().localeCompare(b.state.operator.toBase58()),
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
    publish: async (request: QuoteRequest): Promise<QuoteHandle> => {
      const clientNonce =
        request.clientNonce ?? BigInt(new anchor.BN(randomBytes(8), "le").toString());
      const quoteNonce = u64(clientNonce, "clientNonce");
      const id = pda([
        Buffer.from("quote"),
        this.marketAddress.toBuffer(),
        this.options.maker.toBuffer(),
        quoteNonce.toArrayLike(Buffer, "le", 8),
      ]);
      if (await this.options.connection.getAccountInfo(id, "confirmed")) {
        await this.quoteState(id);
        return this.quote.get(id);
      }
      const market = await this.read<MarketState>("Market", this.marketAddress);
      const input: QuoteInput =
        "tiers" in request
          ? request
          : this.flatQuote(request, market, clientNonce);
      this.validateQuote(input, market);
      const grant = await this.grantFor(input.maxCapacity, input.expiresAt);
      const account = await this.read<{ status: Record<string, unknown> }>(
        "MarketAccount",
        this.marketAccount(),
      );
      if (stateName(account.status) !== "ready") {
        throw new Error("Maker account is processing another operation");
      }
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
      const prices = [
        ...Array.from({ length: 4 }, (_, i) => input.tiers[i]?.bidE8 ?? 0n),
        ...Array.from({ length: 4 }, (_, i) => input.tiers[i]?.askE8 ?? 0n),
      ];
      const ciphertexts = cipher.encrypt(prices, inputNonce);
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
          ...(grant ? { grant } : {}),
          quote: id,
        })
        .rpc({ commitment: "confirmed" });
      return new QuoteHandle(id, signature, this);
    },
    get: (id: PublicKey): QuoteHandle => new QuoteHandle(id, undefined, this),
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
      options: { timeoutMs: number },
    ): Promise<QuoteHandle> => {
      const previous = this.quote.get(prior);
      const snapshot = await previous.status();
      if (
        !["active", "closing", "releasing", "cancelled", "filled"].includes(
          snapshot.status,
        )
      ) {
        throw new Error("Prior quote cannot be replaced in its current state");
      }
      if (snapshot.status === "active" || snapshot.status === "closing")
        await previous.cancel();
      const final = await previous.wait(options);
      if (final.status !== "cancelled" && final.status !== "filled") {
        throw new Error(
          "Prior quote still has reserved capital or attached orders; resume replacement with the same IDs",
        );
      }
      return this.quote.publish(input);
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
      ...(grant ? { grant } : {}),
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
      ...(grant ? { grant } : {}),
    });
  }

  private async requestView(
    kind: "market" | "fill",
    view: PublicKey,
    viewNonce: anchor.BN,
    accounts: Record<string, PublicKey>,
  ): Promise<DepthView> {
    const mxePublicKey = await getMXEPublicKey(this.provider, DEPTH_PROGRAM_ID);
    if (!mxePublicKey) throw new Error("MXE public key is unavailable");
    const secret = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(secret);
    const computationOffset = offset();
    const queue = await this.queue(
      kind === "market" ? "view_market" : "view_fill",
      computationOffset,
    );
    const builder =
      kind === "market"
        ? this.program.methods.requestMarketView(
            computationOffset,
            viewNonce,
            Array.from(publicKey),
          )
        : this.program.methods.requestFillView(
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

  readonly position = {
    cancelOpen: () => this.funding.cancelOpenMarket(),
    addMargin: (amount: bigint, clientNonce: bigint) =>
      this.funding.allocate(amount, clientNonce),
    removeMargin: (amount: bigint, clientNonce: bigint) =>
      this.funding.release(amount, clientNonce),
    summary: async (
      options: { timeoutMs: number; pollMs?: number } = { timeoutMs: 30_000 },
    ): Promise<PositionSnapshot> => {
      const view = await this.requestMarketView();
      return (await view.wait(options)) as PositionSnapshot;
    },
  };

  readonly fills = {
    list: (options?: Parameters<FillHistory["list"]>[0]) =>
      new FillHistory(this).list(options),
    subscribe: (...args: Parameters<FillHistory["subscribe"]>) =>
      new FillHistory(this).subscribe(...args),
    get: async (
      order: PublicKey,
      options: { timeoutMs: number; pollMs?: number } = { timeoutMs: 30_000 },
    ): Promise<FillSnapshot> => {
      const view = await this.requestFillView(order);
      return (await view.wait(options)) as FillSnapshot;
    },
  };

  private validateQuote(input: QuoteInput, market: MarketState): void {
    const now = Math.floor(Date.now() / 1_000);
    if (stateName(market.status) !== "active")
      throw new Error("Market is not active");
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
      BigInt(market.quotedNotional.toString()) + input.maxCapacity >
        BigInt(market.config.maxMarketNotional.toString()) ||
      market.activeQuoteCount >= 4
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
