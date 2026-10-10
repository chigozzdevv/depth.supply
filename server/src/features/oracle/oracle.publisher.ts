import { SOL_USD_FEED_ID, SOL_USD_PUSH_ACCOUNT } from "@depthhq/bindings";
import { HermesClient } from "@pythnetwork/hermes-client";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import type * as anchor from "@anchor-lang/core";
import type { Connection } from "@solana/web3.js";
import { priceTimestamp } from "@/features/oracle/oracle.price";
import type { PublisherConfig } from "@/shared/config/env";

const FEED_ID = `0x${SOL_USD_FEED_ID.toString("hex")}`;

export class OraclePublisher {
  private readonly hermes: HermesClient;
  private readonly receiver: PythSolanaReceiver;

  constructor(
    private readonly connection: Connection,
    wallet: anchor.Wallet,
    private readonly config: PublisherConfig,
  ) {
    this.hermes = new HermesClient(config.hermesUrl, {
      accessToken: config.apiKey,
      timeout: 10_000,
    });
    this.receiver = new PythSolanaReceiver({ connection, wallet });
    if (
      !this.receiver
        .getPriceFeedAccountAddress(config.shardId, FEED_ID)
        .equals(config.priceAccount) ||
      (config.shardId === 0 &&
        !config.priceAccount.equals(SOL_USD_PUSH_ACCOUNT))
    ) {
      throw new Error(
        "Publisher shard does not match the configured price account",
      );
    }
  }

  async advance(): Promise<
    | {
        signatures: string[];
        publishTime: number;
      }
    | undefined
  > {
    const prior = priceTimestamp(
      await this.connection.getAccountInfo(
        this.config.priceAccount,
        "confirmed",
      ),
    );
    const now = Math.floor(Date.now() / 1_000);
    if (prior > now + 10)
      throw new Error("Pyth SOL/USD time is ahead of the local clock");
    if (now - prior < this.config.publishAfterSeconds) return;

    const update = await this.hermes.getLatestPriceUpdates([FEED_ID], {
      encoding: "base64",
      parsed: true,
    });
    const feed = update.parsed?.find(
      (entry) => entry.id.toLowerCase().replace(/^0x/, "") === FEED_ID.slice(2),
    );
    if (
      update.binary.encoding !== "base64" ||
      update.binary.data.length === 0 ||
      !feed ||
      !Number.isSafeInteger(feed.price.publish_time)
    ) {
      throw new Error("Hermes did not return a SOL/USD proof and price");
    }
    const sourceTime = feed.price.publish_time;
    if (sourceTime <= prior) return;
    if (sourceTime > now + 10 || now - sourceTime > 60) {
      throw new Error("Hermes SOL/USD update is outside the freshness window");
    }

    const builder = this.receiver.newTransactionBuilder({
      closeUpdateAccounts: true,
    });
    await builder.addUpdatePriceFeed(update.binary.data, this.config.shardId);
    const transactions = await builder.buildVersionedTransactions({
      computeUnitPriceMicroLamports: 50_000,
      tightComputeBudget: true,
    });
    const signatures = await this.receiver.provider.sendAll(transactions, {
      skipPreflight: false,
      commitment: "confirmed",
    });
    const publishTime = priceTimestamp(
      await this.connection.getAccountInfo(
        this.config.priceAccount,
        "confirmed",
      ),
    );
    if (publishTime < sourceTime) {
      throw new Error("Pyth price account did not advance after publishing");
    }
    return { signatures, publishTime };
  }
}
