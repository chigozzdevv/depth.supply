import * as anchor from "@anchor-lang/core";
import {
  getArciumProgram,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
} from "@arcium-hq/client";
import {
  DEPTH_IDL,
  DEPTH_PROGRAM_ID,
  marketAddress,
  protocolAddress,
} from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";

type MarketState = {
  pendingOrder: PublicKey;
  pendingOrders: number;
};

type OrderState = {
  status: Record<string, unknown>;
  kind: Record<string, unknown>;
  trader: PublicKey;
  maker: PublicKey;
  market: PublicKey;
  selectedQuote: PublicKey;
  app: PublicKey;
  deadline: anchor.BN;
  claimDeadline: anchor.BN;
  claimStage: Record<string, unknown>;
};

type QuoteState = { maker: PublicKey; market: PublicKey };
type ProtocolState = { authority: PublicKey };
type MxeState = { cluster: number; mxeProgramId: PublicKey };

export type KeeperProgress = {
  order: string;
  stage:
    | "settle_trade"
    | "seal_market"
    | "seal_clearing"
    | "seal_trade_fees"
    | "cancel_order"
    | "cancel_trade"
    | "cancel_liquidation"
    | "cancel_fee_claim";
  signature: string;
};

function pda(seeds: Buffer[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, DEPTH_PROGRAM_ID)[0];
}

function variant(value: Record<string, unknown>): string {
  return Object.keys(value)[0] ?? "unknown";
}

export class Keeper {
  readonly provider: anchor.AnchorProvider;
  readonly program: anchor.Program;
  readonly market = marketAddress();
  readonly protocol = protocolAddress();
  readonly clearing = pda([Buffer.from("clearing"), this.market.toBuffer()]);

  constructor(
    readonly connection: Connection,
    readonly wallet: anchor.Wallet,
  ) {
    this.provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    this.program = new anchor.Program(DEPTH_IDL, this.provider);
  }

  async read<T>(name: string, address: PublicKey): Promise<T> {
    const info = await this.connection.getAccountInfo(address, "confirmed");
    if (!info || !info.owner.equals(DEPTH_PROGRAM_ID)) {
      throw new Error(`${name} account is unavailable`);
    }
    return this.program.coder.accounts.decode<T>(name, info.data);
  }

  private async queue(name: string, offset: anchor.BN) {
    const mxeAddress = getMXEAccAddress(DEPTH_PROGRAM_ID);
    const arcium = getArciumProgram(this.provider) as unknown as {
      account: {
        mxeAccount: { fetch(address: PublicKey): Promise<MxeState> };
      };
    };
    const mxe = await arcium.account.mxeAccount.fetch(mxeAddress);
    if (!mxe.mxeProgramId.equals(DEPTH_PROGRAM_ID)) {
      throw new Error("MXE is registered for another program");
    }
    const definition = getCompDefAccAddress(
      DEPTH_PROGRAM_ID,
      Buffer.from(getCompDefAccOffset(name)).readUInt32LE(),
    );
    if (!(await this.connection.getAccountInfo(definition, "confirmed"))) {
      throw new Error(`${name} computation is not deployed`);
    }
    return {
      computationAccount: getComputationAccAddress(mxe.cluster, offset),
      clusterAccount: getClusterAccAddress(mxe.cluster),
      mxeAccount: mxeAddress,
      mempoolAccount: getMempoolAccAddress(mxe.cluster),
      executingPool: getExecutingPoolAccAddress(mxe.cluster),
      compDefAccount: definition,
    };
  }

  async advance(): Promise<KeeperProgress | undefined> {
    const market = await this.read<MarketState>("Market", this.market);
    if (market.pendingOrders === 0) {
      if (!market.pendingOrder.equals(PublicKey.default)) {
        throw new Error("Market pending order pointer is inconsistent");
      }
      return undefined;
    }
    if (
      market.pendingOrders !== 1 ||
      market.pendingOrder.equals(PublicKey.default)
    ) {
      throw new Error("Market pending order pointer is inconsistent");
    }
    const orderId = market.pendingOrder;
    const order = await this.read<OrderState>("OrderRecord", orderId);
    if (!order.market.equals(this.market)) {
      throw new Error("Pending order belongs to another market");
    }
    const status = variant(order.status);
    const kind = variant(order.kind);
    const claimStage = variant(order.claimStage);
    const now = Math.floor(Date.now() / 1_000);
    const traderAccount = pda([
      Buffer.from("market-account"),
      this.market.toBuffer(),
      order.trader.toBuffer(),
    ]);
    if (
      status === "filled" &&
      claimStage !== "idle" &&
      now >= order.claimDeadline.toNumber()
    ) {
      return this.claimStep(orderId, order, "cancel_fee_claim");
    }
    if (status === "filled" && claimStage === "ready") {
      return this.claimStep(orderId, order, "seal_trade_fees");
    }
    if (
      now >= order.deadline.toNumber() &&
      status !== "filled" &&
      status !== "rejected" &&
      status !== "cancelled"
    ) {
      if (status === "matching" || status === "matched") {
        const signature = await this.program.methods
          .cancelOrder()
          .accountsPartial({
            actor: this.wallet.publicKey,
            market: this.market,
            marketAccount: traderAccount,
            order: orderId,
          })
          .rpc({ commitment: "confirmed" });
        return { order: orderId.toBase58(), stage: "cancel_order", signature };
      }
      if (kind === "trade") {
        return this.cancelTrade(orderId, order, traderAccount);
      }
      if (kind === "liquidation") {
        return this.cancelLiquidation(orderId, order, traderAccount);
      }
    }
    let stage: KeeperProgress["stage"];
    let maker = order.maker;
    if (status === "matched" && kind === "trade") {
      stage = "settle_trade";
      const quote = await this.read<QuoteState>(
        "QuoteRecord",
        order.selectedQuote,
      );
      if (!quote.market.equals(this.market)) {
        throw new Error("Selected quote belongs to another market");
      }
      maker = quote.maker;
    } else if (status === "riskApproved" || status === "traderSealed") {
      stage = "seal_market";
    } else if (status === "makerSealed") {
      stage = "seal_clearing";
    } else {
      return undefined;
    }
    if (maker.equals(PublicKey.default) || maker.equals(order.trader)) {
      throw new Error("Pending order has no distinct maker");
    }
    const makerAccount = pda([
      Buffer.from("market-account"),
      this.market.toBuffer(),
      maker.toBuffer(),
    ]);
    const offset = new anchor.BN(randomBytes(8), "le");
    const queue = await this.queue(stage, offset);
    const accounts = {
      ...queue,
      payer: this.wallet.publicKey,
      market: this.market,
      clearing: this.clearing,
      traderAccount,
      makerAccount,
      order: orderId,
    };
    let signature: string;
    if (stage === "settle_trade") {
      signature = await this.program.methods
        .settleTrade(offset)
        .accountsPartial({
          ...queue,
          payer: this.wallet.publicKey,
          trade: {
            market: this.market,
            clearing: this.clearing,
            traderAccount,
            makerAccount,
            order: orderId,
          },
        })
        .remainingAccounts([
          { pubkey: order.selectedQuote, isSigner: false, isWritable: false },
        ])
        .rpc({ commitment: "confirmed" });
    } else if (stage === "seal_market") {
      signature = await this.program.methods
        .sealMarket(offset)
        .accountsPartial(accounts)
        .rpc({ commitment: "confirmed" });
    } else {
      signature = await this.program.methods
        .sealClearing(offset)
        .accountsPartial(accounts)
        .remainingAccounts([
          { pubkey: order.selectedQuote, isSigner: false, isWritable: false },
        ])
        .rpc({ commitment: "confirmed" });
    }
    return { order: orderId.toBase58(), stage, signature };
  }

  private async cancelTrade(
    orderId: PublicKey,
    order: OrderState,
    traderAccount: PublicKey,
  ): Promise<KeeperProgress> {
    const makerAccount = pda([
      Buffer.from("market-account"),
      this.market.toBuffer(),
      order.maker.toBuffer(),
    ]);
    const signature = await this.program.methods
      .cancelTrade()
      .accountsPartial({
        actor: this.wallet.publicKey,
        market: this.market,
        clearing: this.clearing,
        traderAccount,
        makerAccount,
        quote: order.selectedQuote,
        order: orderId,
      })
      .rpc({ commitment: "confirmed" });
    return { order: orderId.toBase58(), stage: "cancel_trade", signature };
  }

  private async cancelLiquidation(
    orderId: PublicKey,
    order: OrderState,
    targetAccount: PublicKey,
  ): Promise<KeeperProgress> {
    const backstopAccount = pda([
      Buffer.from("market-account"),
      this.market.toBuffer(),
      order.maker.toBuffer(),
    ]);
    const signature = await this.program.methods
      .cancelLiquidation()
      .accountsPartial({
        actor: this.wallet.publicKey,
        protocol: this.protocol,
        market: this.market,
        clearing: this.clearing,
        targetAccount,
        backstopAccount,
        offer: order.selectedQuote,
        order: orderId,
      })
      .rpc({ commitment: "confirmed" });
    return {
      order: orderId.toBase58(),
      stage: "cancel_liquidation",
      signature,
    };
  }

  private async claimStep(
    orderId: PublicKey,
    order: OrderState,
    stage: "seal_trade_fees" | "cancel_fee_claim",
  ): Promise<KeeperProgress> {
    const protocol = await this.read<ProtocolState>("Protocol", this.protocol);
    const balances = {
      protocolBalance: pda([
        Buffer.from("balance"),
        protocol.authority.toBuffer(),
      ]),
      appBalance: pda([Buffer.from("balance"), order.app.toBuffer()]),
    };
    let signature: string;
    if (stage === "seal_trade_fees") {
      const offset = new anchor.BN(randomBytes(8), "le");
      const queue = await this.queue(stage, offset);
      signature = await this.program.methods
        .sealTradeFees(offset)
        .accountsPartial({
          ...queue,
          payer: this.wallet.publicKey,
          market: this.market,
          clearing: this.clearing,
          ...balances,
          order: orderId,
        })
        .remainingAccounts([
          { pubkey: this.protocol, isSigner: false, isWritable: false },
        ])
        .rpc({ commitment: "confirmed" });
    } else {
      signature = await this.program.methods
        .cancelFeeClaim()
        .accountsPartial({
          actor: this.wallet.publicKey,
          protocol: this.protocol,
          market: this.market,
          clearing: this.clearing,
          ...balances,
          order: orderId,
        })
        .rpc({ commitment: "confirmed" });
    }
    return { order: orderId.toBase58(), stage, signature };
  }
}
