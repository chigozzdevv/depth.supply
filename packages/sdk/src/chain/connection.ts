import {
  Connection,
  type Commitment,
  type TransactionConfirmationStrategy,
  type RpcResponseAndContext,
  type SignatureResult,
} from "@solana/web3.js";

export class HttpConnection extends Connection {
  override async confirmTransaction(
    strategy: TransactionConfirmationStrategy | string,
    commitment: Commitment = "confirmed",
  ): Promise<RpcResponseAndContext<SignatureResult>> {
    const signature =
      typeof strategy === "string" ? strategy : strategy.signature;
    const signal =
      typeof strategy === "string" ? undefined : strategy.abortSignal;
    const deadline = Date.now() + 120_000;
    for (;;) {
      signal?.throwIfAborted();
      const result = await this.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      });
      const status = result.value[0];
      if (
        status &&
        (status.err ||
          status.confirmationStatus === "finalized" ||
          (commitment !== "finalized" &&
            status.confirmationStatus === "confirmed") ||
          commitment === "processed")
      ) {
        return { context: result.context, value: { err: status.err } };
      }
      if (
        !status &&
        typeof strategy !== "string" &&
        "lastValidBlockHeight" in strategy &&
        (await this.getBlockHeight(commitment)) > strategy.lastValidBlockHeight
      ) {
        throw new Error(
          `Transaction ${signature} expired; reconcile its receipt before retrying`,
        );
      }
      if (Date.now() >= deadline)
        throw new Error(
          `Confirmation timed out for ${signature}; reconcile before retrying`,
        );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
