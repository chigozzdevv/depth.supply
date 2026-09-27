import * as anchor from "@anchor-lang/core";
import { accountOffsets, balanceAddress, enumValues } from "@depth/bindings";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import { ChainScan } from "@/shared/chain/chain.scan";
import type { ChainSigner } from "@/shared/chain/chain.signer";

type Variant = Record<string, unknown>;
type FeeOrder = {
  market: PublicKey;
  app: PublicKey;
  kind: Variant;
  status: Variant;
  claimStage: Variant;
  feesClaimed: boolean;
};

export class FeeService {
  private readonly scan: ChainScan;
  private pending: Array<{ address: PublicKey; state: FeeOrder }> = [];

  constructor(private readonly chain: ChainSigner) {
    this.scan = new ChainScan(chain, "OrderRecord", [
      {
        offset: accountOffsets.OrderRecord.market,
        bytes: chain.market.toBase58(),
      },
      {
        offset: accountOffsets.OrderRecord.fees_claimed,
        bytes: anchor.utils.bytes.bs58.encode(Buffer.from([0])),
      },
      {
        offset: accountOffsets.OrderRecord.status,
        bytes: anchor.utils.bytes.bs58.encode(
          Buffer.from([enumValues.OrderStatus.Filled]),
        ),
      },
    ]);
  }

  async advance(): Promise<string | undefined> {
    const market = await this.chain.read<{
      pendingOrders: number;
      status: Variant;
    }>("Market", this.chain.market);
    if (market.pendingOrders || "settling" in market.status) return;
    const protocol = await this.chain.read<{ authority: PublicKey }>(
      "Protocol",
      this.chain.protocol,
    );
    const protocolBalance = balanceAddress(protocol.authority);
    const recipients = await this.chain.connection.getAccountInfo(
      protocolBalance,
      "confirmed",
    );
    if (!recipients) return;
    const balance = await this.chain.read<{ status: Variant }>(
      "BalanceAccount",
      protocolBalance,
    );
    const clearing = await this.chain.read<{ status: Variant }>(
      "ClearingAccount",
      this.chain.clearing,
    );
    if (!("ready" in balance.status) || !("ready" in clearing.status)) return;
    if (!this.pending.length) this.pending = await this.scan.next<FeeOrder>();
    while (this.pending.length) {
      const candidate = this.pending.shift()!;
      const order = await this.chain.read<FeeOrder>(
        "OrderRecord",
        candidate.address,
      );
      if (
        !order.market.equals(this.chain.market) ||
        !("trade" in order.kind) ||
        !("filled" in order.status) ||
        !("idle" in order.claimStage) ||
        order.feesClaimed
      )
        continue;
      const appBalance = balanceAddress(order.app);
      if (
        !(await this.chain.connection.getAccountInfo(appBalance, "confirmed"))
      )
        continue;
      if (
        !(
          "ready" in
          (
            await this.chain.read<{ status: Variant }>(
              "BalanceAccount",
              appBalance,
            )
          ).status
        )
      )
        continue;
      const offset = new anchor.BN(randomBytes(8), "le");
      return this.chain.program.methods
        .claimTradeFees(offset)
        .accountsPartial({
          ...(await this.chain.queue("claim_trade_fees", offset)),
          payer: this.chain.wallet.publicKey,
          market: this.chain.market,
          clearing: this.chain.clearing,
          protocolBalance,
          appBalance,
          order: candidate.address,
        })
        .remainingAccounts([
          { pubkey: this.chain.protocol, isSigner: false, isWritable: false },
        ])
        .rpc({ commitment: "confirmed" });
    }
  }
}
