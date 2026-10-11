import * as anchor from "@anchor-lang/core";
import {
  PublicKey,
  SystemInstruction,
  Transaction,
  type Connection,
} from "@solana/web3.js";
import { AutomationStore } from "@/features/automation/automation.store";
import {
  AutomationError,
  publicAutomation,
  type AutomationRecord,
} from "@/features/automation/automation.model";

export type FundingInput = {
  revision: number;
  transaction?: string;
  lastValidBlockHeight?: number;
  targetLamports?: string;
};
export class AutomationFunding {
  private readonly tasks = new Map<string, Promise<unknown>>();
  constructor(
    private readonly store: AutomationStore,
    private readonly connection: Connection,
  ) {}
  request(owner: string, input: FundingInput) {
    const prior = this.tasks.get(owner) ?? Promise.resolve();
    const task = prior.catch(() => {}).then(() => this.advance(owner, input));
    this.tasks.set(owner, task);
    void task
      .finally(() => {
        if (this.tasks.get(owner) === task) this.tasks.delete(owner);
      })
      .catch(() => {});
    return task;
  }
  private async reconcile(record: AutomationRecord) {
    const receipt = record.funding!;
    const transaction = record.fundingTransaction!;
    const status = (
      await this.connection.getSignatureStatuses([receipt.signature], {
        searchTransactionHistory: true,
      })
    ).value[0];
    let result = receipt.status;
    if (status?.err) result = "failed";
    else if (status?.confirmationStatus === "finalized") result = "confirmed";
    else if (
      !status &&
      (await this.connection.getBlockHeight("finalized")) >
        transaction.lastValidBlockHeight &&
      !// Jito's transitive web3 declarations omit this supported RPC method.
      (
        await (
          this.connection as Connection & {
            isBlockhashValid(
              blockhash: string,
              config: { commitment: "finalized" },
            ): Promise<{ value: boolean }>;
          }
        ).isBlockhashValid(transaction.blockhash, {
          commitment: "finalized",
        })
      ).value
    )
      result = "expired";
    if (result !== "pending") {
      await this.store.change((records) => {
        const current = records.find((value) => value.owner === record.owner)!;
        current.funding!.status = result;
      });
    } else {
      await this.connection
        .sendRawTransaction(Buffer.from(transaction.bytes, "base64"), {
          skipPreflight: false,
          maxRetries: 2,
        })
        .catch(() => {});
    }
  }
  private async advance(owner: string, input: FundingInput) {
    let record = this.store.get(owner);
    if (!record || record.revision !== input.revision)
      throw new AutomationError(
        "Automation configuration changed; review it again",
      );
    if (record.funding?.status === "pending") {
      await this.reconcile(record);
      record = this.store.get(owner)!;
      if (record.funding!.status === "pending") return publicAutomation(record);
    }
    if (!input.transaction) {
      if (
        input.lastValidBlockHeight !== undefined ||
        input.targetLamports !== undefined
      )
        throw new AutomationError(
          "Operator funding request is incomplete",
          400,
        );
      return publicAutomation(record);
    }
    if (
      record.desired !== "paused" ||
      !["configured", "paused"].includes(record.phase)
    )
      throw new AutomationError("Pause automation before funding its operator");
    if (
      !input.lastValidBlockHeight ||
      !input.targetLamports ||
      !/^\d{1,20}$/.test(input.targetLamports)
    )
      throw new AutomationError("Operator funding request is invalid", 400);
    let transaction: Transaction;
    try {
      transaction = Transaction.from(Buffer.from(input.transaction, "base64"));
    } catch {
      throw new AutomationError("Operator funding transaction is invalid", 400);
    }
    let valid = false;
    try {
      valid = transaction.verifySignatures();
    } catch {}
    if (
      !valid ||
      transaction.instructions.length !== 1 ||
      transaction.signatures.length !== 1 ||
      transaction.nonceInfo ||
      !transaction.recentBlockhash ||
      !transaction.feePayer?.equals(new PublicKey(owner))
    )
      throw new AutomationError(
        "Operator funding must be signed by its maker owner",
        400,
      );
    let transfer;
    try {
      transfer = SystemInstruction.decodeTransfer(transaction.instructions[0]);
    } catch {
      throw new AutomationError(
        "Only an operator SOL transfer can be funded",
        400,
      );
    }
    const target = BigInt(input.targetLamports);
    if (
      !transfer.fromPubkey.equals(new PublicKey(owner)) ||
      !transfer.toPubkey.equals(new PublicKey(record.operator)) ||
      transfer.lamports <= 0n ||
      transfer.lamports > target ||
      target > 10_000_000_000n
    )
      throw new AutomationError(
        "Operator funding destination or amount is invalid",
        400,
      );
    const signature = anchor.utils.bytes.bs58.encode(
      transaction.signatures[0].signature!,
    );
    if (record.funding?.signature === signature)
      return publicAutomation(record);
    const [height, balance] = await Promise.all([
      this.connection.getBlockHeight("confirmed"),
      this.connection.getBalance(new PublicKey(record.operator), "finalized"),
    ]);
    if (
      input.lastValidBlockHeight <= height ||
      input.lastValidBlockHeight > height + 200 ||
      BigInt(balance) + transfer.lamports > target
    )
      throw new AutomationError(
        "Operator funding expired or exceeds its reviewed budget",
        400,
      );
    await this.store.change((records) => {
      const current = records.find((value) => value.owner === owner)!;
      if (
        current.revision !== input.revision ||
        current.desired !== "paused" ||
        !["configured", "paused"].includes(current.phase)
      )
        throw new AutomationError(
          "Automation configuration changed; review it again",
        );
      current.funding = {
        signature,
        lamports: transfer.lamports.toString(),
        status: "pending",
      };
      current.fundingTransaction = {
        bytes: transaction.serialize().toString("base64"),
        blockhash: transaction.recentBlockhash!,
        lastValidBlockHeight: input.lastValidBlockHeight!,
      };
    });
    await this.reconcile(this.store.get(owner)!);
    return publicAutomation(this.store.get(owner)!);
  }
  async tick() {
    const results = await Promise.allSettled(
      this.store
        .list()
        .filter(
          (record) =>
            record.funding?.status === "pending" &&
            !this.tasks.has(record.owner),
        )
        .map((record) =>
          this.request(record.owner, { revision: record.revision }),
        ),
    );
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Operator funding reconciliation is unavailable");
  }
  async close() {
    await Promise.allSettled(this.tasks.values());
  }
}
