import { transferAddress } from "@depth/bindings";
import { PublicKey } from "@solana/web3.js";
import type { TransferHandle } from "@/account/funding";
import type { DepthClient } from "@/client/client";
import type {
  CloseInput,
  ReductionInput,
  ReverseInput,
  TradeInput,
  TradeIntent,
} from "@/client/types";
import type { DepthOperation } from "@/operation/operation";

export type TradeFlowSnapshot = {
  id: PublicKey;
  allocationId: PublicKey;
  phase: "unstarted" | "allocating" | "allocated" | "order" | "failed";
  allocation?: Awaited<ReturnType<TransferHandle["status"]>>;
  order?: Awaited<ReturnType<DepthOperation["status"]>>;
};

export class TradeFlow {
  readonly id: PublicKey;
  readonly allocationId: PublicKey;

  constructor(readonly client: DepthClient, readonly nonce: bigint) {
    if (nonce < 0n || nonce > (1n << 64n) - 1n) {
      throw new RangeError("clientNonce must be an unsigned 64-bit bigint");
    }
    this.id = client.trade.operation(nonce).id;
    this.allocationId = transferAddress(
      client.options.wallet.publicKey,
      nonce,
      client.program.programId,
    );
  }

  async status(): Promise<TradeFlowSnapshot> {
    const [order, allocation] =
      await this.client.options.connection.getMultipleAccountsInfo(
        [this.id, this.allocationId],
        "confirmed",
      );
    if (order) {
      const snapshot = await this.client.trade.operation(this.nonce).status();
      if (snapshot.owner !== this.client.options.wallet.publicKey.toBase58()) {
        throw new Error("Order belongs to another wallet");
      }
      return {
        id: this.id,
        allocationId: this.allocationId,
        phase: snapshot.status === "rejected" ? "failed" : "order",
        order: snapshot,
      };
    }
    if (!allocation) {
      return {
        id: this.id,
        allocationId: this.allocationId,
        phase: "unstarted",
      };
    }
    const receipt = await this.client.funding
      .transferHandle(this.nonce)
      .status();
    if (!receipt.toMarket)
      throw new Error("The nonce belongs to a margin release");
    return {
      id: this.id,
      allocationId: this.allocationId,
      phase:
        receipt.state === "settled"
          ? "allocated"
          : ["rejected", "refunded", "cancelled"].includes(receipt.state)
          ? "failed"
          : "allocating",
      allocation: receipt,
    };
  }

  async resume(
    input: TradeInput | ReductionInput | CloseInput | ReverseInput,
    intent: TradeIntent,
  ): Promise<DepthOperation> {
    if (input.clientNonce !== undefined && input.clientNonce !== this.nonce) {
      throw new Error("Trade terms use a different client nonce");
    }
    const terms = { ...input, clientNonce: this.nonce };
    if (intent === "increase")
      return this.client.trade.submit(terms as TradeInput);
    if (intent === "reduce")
      return this.client.trade.reduce(terms as ReductionInput);
    if (intent === "close") return this.client.trade.close(terms as CloseInput);
    return this.client.trade.reverse(terms as ReverseInput);
  }
}
