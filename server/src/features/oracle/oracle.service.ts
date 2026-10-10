import * as anchor from "@anchor-lang/core";
import { DEPTH_PROGRAM_ID, accountOffsets, enumValues } from "@depthhq/bindings";
import { PublicKey } from "@solana/web3.js";
import { priceTimestamp } from "@/features/oracle/oracle.price";
import type { ChainSigner } from "@/shared/chain/chain.signer";

export type OracleMarket = {
  pendingOrders: number;
  status: Record<string, unknown>;
  oracleAccount: PublicKey;
  oracleTimestamp: { toString(): string };
};

export class OracleService {
  constructor(
    private readonly chain: ChainSigner,
    private readonly address: PublicKey,
  ) {}

  async advance(): Promise<string | undefined> {
    const market = await this.chain.read<OracleMarket>(
      "Market",
      this.chain.market,
    );
    if (!market.oracleAccount.equals(this.address)) {
      throw new Error("Configured Pyth account does not match the market oracle");
    }
    if (market.pendingOrders !== 0 || "settling" in market.status) return;
    const info = await this.chain.connection.getAccountInfo(
      this.address,
      "confirmed",
    );
    if (!info) throw new Error("Configured Pyth price account is missing");
    if (BigInt(priceTimestamp(info)) <= BigInt(market.oracleTimestamp.toString())) return;
    if (await this.hasSnapshotComputation()) return;
    return this.chain.program.methods
      .refreshOracle()
      .accountsPartial({
        protocol: this.chain.protocol,
        market: this.chain.market,
        priceUpdate: this.address,
      })
      .rpc({ commitment: "confirmed" });
  }

  private async hasSnapshotComputation(): Promise<boolean> {
    const checks = [
      {
        name: "quoteRecord",
        marketOffset: accountOffsets.QuoteRecord.market,
        statusOffset: accountOffsets.QuoteRecord.status,
        deadlineOffset: accountOffsets.QuoteRecord.expiry,
        status: enumValues.QuoteStatus.Validating,
      },
      {
        name: "quoteRecord",
        marketOffset: accountOffsets.QuoteRecord.market,
        statusOffset: accountOffsets.QuoteRecord.status,
        deadlineOffset: accountOffsets.QuoteRecord.expiry,
        status: enumValues.QuoteStatus.Validated,
      },
      {
        name: "quoteRecord",
        marketOffset: accountOffsets.QuoteRecord.market,
        statusOffset: accountOffsets.QuoteRecord.status,
        deadlineOffset: accountOffsets.QuoteRecord.expiry,
        status: enumValues.QuoteStatus.Reserving,
      },
      {
        name: "marginTransfer",
        marketOffset: accountOffsets.MarginTransfer.market,
        statusOffset: accountOffsets.MarginTransfer.status,
        deadlineOffset: accountOffsets.MarginTransfer.deadline,
        status: enumValues.MarginTransferStatus.Debiting,
        extra: {
          offset: accountOffsets.MarginTransfer.to_market,
          bytes: anchor.utils.bytes.bs58.encode(Buffer.from([0])),
        },
      },
      {
        name: "backstopOffer",
        marketOffset: accountOffsets.BackstopOffer.market,
        statusOffset: accountOffsets.BackstopOffer.status,
        deadlineOffset: accountOffsets.BackstopOffer.expiry,
        status: enumValues.BackstopStatus.Reserving,
      },
    ];
    for (const check of checks) {
      const accounts = await this.chain.connection.getProgramAccounts(
        DEPTH_PROGRAM_ID,
        {
          commitment: "confirmed",
          dataSlice: { offset: check.deadlineOffset, length: 8 },
          filters: [
            { memcmp: this.chain.program.coder.accounts.memcmp(check.name) },
            {
              memcmp: {
                offset: check.marketOffset,
                bytes: this.chain.market.toBase58(),
              },
            },
            {
              memcmp: {
                offset: check.statusOffset,
                bytes: anchor.utils.bytes.bs58.encode(Buffer.from([check.status])),
              },
            },
            ...(check.extra ? [{ memcmp: check.extra }] : []),
          ],
        },
      );
      for (const { account } of accounts) {
        if (account.data.length !== 8) {
          throw new Error("Snapshot computation deadline is unavailable");
        }
        if (account.data.readBigInt64LE(0) > BigInt(Math.floor(Date.now() / 1_000))) {
          return true;
        }
      }
    }
    return false;
  }
}
