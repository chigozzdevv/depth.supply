import * as anchor from "@anchor-lang/core";
import {
  balanceAddress,
  marketAccountAddress,
  DEPTH_PROGRAM_ID,
  viewPermitAddress,
} from "@depthhq/bindings";
import {
  viewMessage,
  viewScopes,
  type ViewRequest,
  type ViewReceipt,
} from "@depthhq/schema";
import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import { createPublicKey, randomBytes, verify } from "node:crypto";
import { ChainSigner } from "@/shared/chain/chain.signer";
import { ViewError, type ViewRecord } from "@/features/view/view.model";
import { ViewStore } from "@/features/view/view.store";

type Permit = {
  owner: PublicKey;
  reader: PublicKey;
  market: PublicKey;
  viewKey: number[];
  expiresAt: anchor.BN;
  active: boolean;
  scopes: number;
};
type Source = {
  owner?: PublicKey;
  maker?: PublicKey;
  trader?: PublicKey;
  market?: PublicKey;
  status: Record<string, unknown>;
  kind?: Record<string, unknown>;
};
const maximumCost = 30_000_000;

export function authenticateView(
  request: ViewRequest,
  action: "read" | "close",
  now = Math.floor(Date.now() / 1000),
): void {
  try {
    for (const name of ["owner", "reader", "permit", "source"] as const)
      if (new PublicKey(request[name]).toBase58() !== request[name])
        throw new Error();
    if (
      !/^\d{1,20}$/.test(request.nonce) ||
      BigInt(request.nonce) > (1n << 64n) - 1n ||
      !Number.isSafeInteger(request.expiresAt) ||
      BigInt(request.nonce).toString() !== request.nonce ||
      request.expiresAt <= now ||
      request.expiresAt > now + 180 ||
      !Object.hasOwn(viewScopes, request.kind)
    )
      throw new Error();
    const bytes = Buffer.from(request.signature, "base64");
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        new PublicKey(request.reader).toBuffer(),
      ]),
      format: "der",
      type: "spki",
    });
    if (
      bytes.length !== 64 ||
      bytes.toString("base64") !== request.signature ||
      !verify(
        null,
        Buffer.from(viewMessage(DEPTH_PROGRAM_ID.toBase58(), request, action)),
        key,
        bytes,
      )
    )
      throw new Error();
  } catch {
    throw new ViewError(401, "invalid_view_signature");
  }
}

export class ViewService {
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly chain: ChainSigner,
    private readonly store: ViewStore,
    private readonly reserve = 250_000_000,
  ) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const task = this.queue.then(work);
    this.queue = task.catch(() => {});
    return task;
  }
  start(): void {
    this.timer = setInterval(() => {
      void this.serial(() => this.sweep()).catch(() => {});
    }, 30000);
    this.timer.unref();
  }
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.queue;
    await this.store.close();
  }
  private key(request: ViewRequest): string {
    return [
      request.owner,
      request.reader,
      request.kind,
      request.source,
      request.nonce,
    ].join(":");
  }

  private async permission(request: ViewRequest): Promise<Permit> {
    const owner = new PublicKey(request.owner);
    const reader = new PublicKey(request.reader);
    const id = viewPermitAddress(owner, reader);
    if (id.toBase58() !== request.permit)
      throw new ViewError(403, "invalid_view_permission");
    const permit = await this.chain.read<Permit>("ViewPermit", id);
    if (
      !permit.owner.equals(owner) ||
      !permit.reader.equals(reader) ||
      !permit.market.equals(this.chain.market) ||
      !permit.active ||
      permit.expiresAt.toNumber() <= Math.floor(Date.now() / 1000) ||
      !(permit.scopes & viewScopes[request.kind]) ||
      !permit.viewKey.some((v) => v !== 0)
    )
      throw new ViewError(403, "invalid_view_permission");
    return permit;
  }

  private async source(request: ViewRequest): Promise<void> {
    const id = new PublicKey(request.source);
    const owner = new PublicKey(request.owner);
    const source = await this.chain.read<Source>(
      request.kind === "balance"
        ? "BalanceAccount"
        : request.kind === "market"
          ? "MarketAccount"
          : request.kind === "fill"
            ? "OrderRecord"
            : "QuoteRecord",
      id,
    );
    const status = Object.keys(source.status)[0];
    if (request.kind === "balance") {
      if (!id.equals(balanceAddress(owner)) || !source.owner?.equals(owner))
        throw new ViewError(403, "invalid_view_source");
    } else {
      if (!source.market?.equals(this.chain.market))
        throw new ViewError(403, "invalid_view_source");
      if (
        request.kind === "market"
          ? !id.equals(marketAccountAddress(owner)) ||
            !source.owner?.equals(owner)
          : request.kind === "fill"
            ? !source.trader?.equals(owner) && !source.maker?.equals(owner)
            : !source.maker?.equals(owner)
      )
        throw new ViewError(403, "invalid_view_source");
    }
    if (
      request.kind === "fill"
        ? status !== "filled" || !source.kind || !("trade" in source.kind)
        : request.kind === "quote"
          ? status !== "active" && status !== "closing"
          : status !== "ready"
    )
      throw new ViewError(409, "view_source_busy");
  }

  read(request: ViewRequest): Promise<ViewReceipt> {
    authenticateView(request, "read");
    return this.serial(async () => {
      const permit = await this.permission(request);
      let record = this.store.get(this.key(request));
      if (record?.closed) throw new ViewError(410, "view_receipt_closed");
      if (!record) {
        await this.source(request);
        const window = this.store
          .list()
          .filter((r) => r.createdAt > Date.now() - 3600000);
        if (
          window.length >= 60 ||
          window.filter((r) => r.request.owner === request.owner).length >= 30
        )
          throw new ViewError(429, "view_budget_exhausted");
        if (
          (await this.chain.connection.getBalance(
            this.chain.wallet.publicKey,
            "confirmed",
          )) <
          this.reserve + maximumCost
        )
          throw new ViewError(503, "view_sponsor_unavailable");
        const nonce = new anchor.BN(request.nonce);
        const payer = this.chain.wallet.publicKey;
        const source = new PublicKey(request.source);
        const seeds =
          request.kind === "balance"
            ? [
                Buffer.from("view"),
                payer.toBuffer(),
                nonce.toArrayLike(Buffer, "le", 8),
              ]
            : request.kind === "market"
              ? [
                  Buffer.from("market-view"),
                  source.toBuffer(),
                  nonce.toArrayLike(Buffer, "le", 8),
                ]
              : [
                  Buffer.from(`${request.kind}-view`),
                  source.toBuffer(),
                  payer.toBuffer(),
                  nonce.toArrayLike(Buffer, "le", 8),
                ];
        record = {
          key: this.key(request),
          request,
          createdAt: Date.now(),
          receipt: {
            id: PublicKey.findProgramAddressSync(
              seeds,
              DEPTH_PROGRAM_ID,
            )[0].toBase58(),
            payer: payer.toBase58(),
            signature: "",
          },
        };
        await this.prepare(record, permit);
      }
      await this.submit(record, permit);
      return record.receipt;
    });
  }

  private async prepare(record: ViewRecord, permit: Permit): Promise<void> {
    const request = record.request;
    const offset = new anchor.BN(randomBytes(8), "le");
    const queue = await this.chain.queue(
      `view_${request.kind === "balance" ? "balance" : request.kind}`,
      offset,
    );
    const builder =
      request.kind === "balance"
        ? this.chain.program.methods.requestBalanceView
        : request.kind === "market"
          ? this.chain.program.methods.requestMarketView
          : request.kind === "fill"
            ? this.chain.program.methods.requestFillView
            : this.chain.program.methods.requestQuoteView;
    const source = new PublicKey(request.source);
    const tx = await builder(
      offset,
      new anchor.BN(request.nonce),
      permit.viewKey,
    )
      .accountsPartial({
        ...queue,
        payer: this.chain.wallet.publicKey,
        view: new PublicKey(record.receipt.id),
        ...(request.kind === "balance"
          ? { balance: source }
          : request.kind === "market"
            ? { market: this.chain.market, marketAccount: source, grant: null }
            : request.kind === "fill"
              ? { order: source, grant: null }
              : { market: this.chain.market, quote: source, grant: null }),
      } as never)
      .remainingAccounts([
        {
          pubkey: new PublicKey(request.permit),
          isSigner: false,
          isWritable: false,
        },
      ])
      .transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }));
    const block = await this.chain.connection.getLatestBlockhash("confirmed");
    tx.feePayer = this.chain.wallet.publicKey;
    tx.recentBlockhash = block.blockhash;
    tx.sign(this.chain.wallet.payer);
    record.transaction = tx.serialize().toString("base64");
    record.blockhash = block.blockhash;
    record.lastValidBlockHeight = block.lastValidBlockHeight;
    // The signature and signed bytes are durable before any network submission.
    record.receipt.signature = anchor.utils.bytes.bs58.encode(tx.signature!);
    await this.store.save(record);
  }

  private async submit(record: ViewRecord, permit: Permit): Promise<void> {
    const id = new PublicKey(record.receipt.id);
    if (await this.chain.connection.getAccountInfo(id, "confirmed")) return;
    const status = (
      await this.chain.connection.getSignatureStatuses(
        [record.receipt.signature],
        { searchTransactionHistory: true },
      )
    ).value[0];
    if (status?.err) {
      record.closed = true;
      await this.store.save(record);
      throw new ViewError(409, "view_request_failed");
    }
    if (status && status.confirmationStatus !== "processed") {
      if (
        await this.chain.connection.getAccountInfo(id, {
          commitment: "confirmed",
          minContextSlot: status.slot,
        })
      )
        return;
      record.closed = true;
      await this.store.save(record);
      throw new ViewError(410, "view_receipt_closed");
    }
    if (
      (await this.chain.connection.getBlockHeight("confirmed")) >
      record.lastValidBlockHeight!
    ) {
      if (status) throw new ViewError(503, "view_confirmation_pending");
      await this.source(record.request);
      await this.prepare(record, permit);
    }
    await this.chain.connection.sendRawTransaction(
      Buffer.from(record.transaction!, "base64"),
      { skipPreflight: false, maxRetries: 3 },
    );
    const result = await this.chain.connection.confirmTransaction(
      {
        signature: record.receipt.signature,
        blockhash: record.blockhash!,
        lastValidBlockHeight: record.lastValidBlockHeight!,
      },
      "confirmed",
    );
    if (result.value.err) {
      record.closed = true;
      await this.store.save(record);
      throw new ViewError(409, "view_request_failed");
    }
  }

  close(request: ViewRequest): Promise<void> {
    authenticateView(request, "close");
    return this.serial(async () => {
      const record = this.store.get(this.key(request));
      if (!record || record.request.permit !== request.permit)
        throw new ViewError(404, "view_receipt_missing");
      await this.release(record);
    });
  }
  private async release(record: ViewRecord): Promise<void> {
    if (record.closed) return;
    const id = new PublicKey(record.receipt.id);
    const info = await this.chain.connection.getAccountInfo(id, "confirmed");
    if (!info) return;
    if (!info.owner.equals(DEPTH_PROGRAM_ID))
      throw new Error("Private read receipt has the wrong owner");
    const state = this.chain.program.coder.accounts.decode<{
      owner: PublicKey;
      status: Record<string, unknown>;
    }>(
      `${record.request.kind === "balance" ? "balance" : record.request.kind}View`,
      info.data,
    );
    if (!state.owner.equals(this.chain.wallet.publicKey))
      throw new Error("Private read receipt has the wrong sponsor");
    if ("pending" in state.status) return;
    const builder =
      record.request.kind === "balance"
        ? this.chain.program.methods.closeBalanceView
        : record.request.kind === "market"
          ? this.chain.program.methods.closeMarketView
          : record.request.kind === "fill"
            ? this.chain.program.methods.closeFillView
            : this.chain.program.methods.closeQuoteView;
    await builder()
      .accountsPartial({ owner: this.chain.wallet.publicKey, view: id })
      .rpc({ commitment: "confirmed" });
    record.closed = true;
    record.transaction = undefined;
    await this.store.save(record);
  }
  private async sweep(): Promise<void> {
    for (const record of this.store
      .list()
      .filter((r) => !r.closed && r.createdAt < Date.now() - 600000)) {
      try {
        await this.release(record);
      } catch {
        /* A later sweep retries receipts whose callback or cleanup is delayed. */
      }
    }
  }
}
