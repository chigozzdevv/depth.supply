import { Buffer } from "buffer";
import * as anchor from "@anchor-lang/core";
import { createPacker, RescueCipher, x25519 } from "@arcium-hq/client";
import { circuits, DEPTH_PROGRAM_ID } from "@depthhq/bindings";
import { Connection, PublicKey } from "@solana/web3.js";

export type BalanceSnapshot = {
  status: "pending" | "ready" | "stale";
  id: string;
  version: bigint;
  slot: number;
  amount?: bigint;
};

export type PositionSnapshot = {
  status: "pending" | "ready" | "stale";
  id: string;
  version: bigint;
  slot: number;
  collateral?: bigint;
  reserved?: bigint;
  position?: bigint;
  entryPriceE8?: bigint;
  fundingCheckpoint?: bigint;
};

export type FillSnapshot = {
  status: "pending" | "ready" | "stale";
  id: string;
  slot: number;
  positionId?: PublicKey;
  side?: bigint;
  size?: bigint;
  margin?: bigint;
  executionPriceE8?: bigint;
  fee?: bigint;
  insuranceFee?: bigint;
  appFee?: bigint;
  makerRebate?: bigint;
};

export type QuoteBalanceSnapshot = {
  status: "pending" | "ready" | "stale";
  id: string;
  slot: number;
  remainingCapacity?: bigint;
  remainingMargin?: bigint;
};

type ViewState = {
  owner: PublicKey;
  viewKey: number[];
  status: Record<string, unknown>;
  version?: anchor.BN;
  ciphertext?: number[];
  ciphertexts?: number[][];
  outputNonce: number[];
};

const mask64 = (1n << 64n) - 1n;
const mask128 = (1n << 128n) - 1n;
const fillPacker = createPacker<
  {
    side: bigint;
    size: bigint;
    margin: bigint;
    execution_price: bigint;
    fee: bigint;
    insurance_fee: bigint;
    app_fee: bigint;
  },
  {
    side: bigint;
    size: bigint;
    margin: bigint;
    execution_price: bigint;
    fee: bigint;
    insurance_fee: bigint;
    app_fee: bigint;
  }
>([
  { name: "side", type: { Integer: { signed: true, width: 8 } } },
  { name: "size", type: { Integer: { signed: false, width: 64 } } },
  { name: "margin", type: { Integer: { signed: false, width: 64 } } },
  { name: "execution_price", type: { Integer: { signed: false, width: 64 } } },
  { name: "fee", type: { Integer: { signed: false, width: 64 } } },
  { name: "insurance_fee", type: { Integer: { signed: false, width: 64 } } },
  { name: "app_fee", type: { Integer: { signed: false, width: 64 } } },
] as const);

function decodeMarket(words: bigint[]) {
  if (words.length !== 3) throw new Error("Invalid market view ciphertext");
  const [first, second, third] = words;
  return {
    collateral: (first >> 128n) & mask64,
    reserved: (second >> 128n) & mask64,
    position: (third & mask64) - (1n << 63n),
    entryPriceE8: (third >> 64n) & mask64,
    fundingCheckpoint: (first & mask128) - (1n << 127n),
  };
}

function decodeFill(words: bigint[]) {
  if (words.length !== 3) throw new Error("Invalid fill view ciphertext");
  const values = fillPacker.unpack(words.slice(0, 2));
  return {
    side: values.side,
    size: values.size,
    margin: values.margin,
    executionPriceE8: values.execution_price,
    fee: values.fee,
    insuranceFee: values.insurance_fee,
    appFee: values.app_fee,
    makerRebate: words[2] & mask64,
  };
}

export class DepthView {
  constructor(
    readonly id: PublicKey,
    readonly signature: string,
    readonly kind: "balance" | "market" | "fill" | "quote",
    private readonly owner: PublicKey,
    private readonly secret: Uint8Array,
    private readonly publicKey: Uint8Array,
    private readonly mxePublicKey: Uint8Array,
    private readonly program: anchor.Program,
    private readonly connection: Connection,
  ) {}

  async status(): Promise<
    BalanceSnapshot | PositionSnapshot | FillSnapshot | QuoteBalanceSnapshot
  > {
    const response = await this.connection.getAccountInfoAndContext(
      this.id,
      "confirmed",
    );
    if (!response.value || !response.value.owner.equals(DEPTH_PROGRAM_ID)) {
      throw new Error("Private view account is unavailable");
    }
    const state = this.program.coder.accounts.decode<ViewState>(
      this.kind === "balance"
        ? "balanceView"
        : this.kind === "market"
          ? "marketView"
          : this.kind === "fill"
            ? "fillView"
            : "quoteView",
      response.value.data,
    );
    if (
      !state.owner.equals(this.owner) ||
      !Buffer.from(state.viewKey).equals(Buffer.from(this.publicKey))
    ) {
      throw new Error("Private view authorization does not match this request");
    }
    const current = Object.keys(state.status)[0];
    if (current !== "pending" && current !== "ready" && current !== "stale") {
      throw new Error("Private view has an unknown status");
    }
    const status: BalanceSnapshot["status"] = current;
    const base = {
      status,
      id: this.id.toBase58(),
      ...(state.version ? { version: BigInt(state.version.toString()) } : {}),
      slot: response.context.slot,
    };
    if (status !== "ready") return base;
    const cipher = new RescueCipher(
      x25519.getSharedSecret(this.secret, this.mxePublicKey),
    );
    const nonce = Uint8Array.from(state.outputNonce);
    if (this.kind === "balance") {
      if (!state.ciphertext) throw new Error("Balance view has no ciphertext");
      return {
        ...base,
        amount: cipher.decrypt([Array.from(state.ciphertext)], nonce)[0],
      };
    }
    if (this.kind === "quote") {
      if (!state.ciphertext) throw new Error("Quote view has no ciphertext");
      const words = cipher.decrypt([Array.from(state.ciphertext)], nonce);
      const balance = circuits.QuoteBalance.unpack(words);
      return {
        ...base,
        remainingCapacity: balance.remaining_capacity,
        remainingMargin: balance.remaining_margin,
      };
    }
    if (!state.ciphertexts) throw new Error("Private view has no ciphertexts");
    if (this.kind === "fill") {
      return {
        ...base,
        ...decodeFill(
          cipher.decrypt(
            state.ciphertexts.map((word) => Array.from(word)),
            nonce,
          ),
        ),
      };
    }
    return {
      ...base,
      ...decodeMarket(
        cipher.decrypt(
          state.ciphertexts.map((word) => Array.from(word)),
          nonce,
        ),
      ),
    };
  }

  async wait(options: {
    timeoutMs: number;
    pollMs?: number;
  }): Promise<
    BalanceSnapshot | PositionSnapshot | FillSnapshot | QuoteBalanceSnapshot
  > {
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 0) {
      throw new RangeError("timeoutMs must be a nonnegative integer");
    }
    const pollMs = options.pollMs ?? 1_000;
    if (!Number.isSafeInteger(pollMs) || pollMs < 100) {
      throw new RangeError("pollMs must be at least 100");
    }
    const deadline = Date.now() + options.timeoutMs;
    for (;;) {
      const snapshot = await this.status();
      if (snapshot.status !== "pending" || Date.now() >= deadline) {
        return snapshot;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollMs, deadline - Date.now())),
      );
    }
  }

  async close(): Promise<string> {
    const snapshot = await this.status();
    if (snapshot.status === "pending") {
      throw new Error("Private view computation is still pending");
    }
    const builder =
      this.kind === "balance"
        ? this.program.methods.closeBalanceView()
        : this.kind === "market"
          ? this.program.methods.closeMarketView()
          : this.kind === "fill"
            ? this.program.methods.closeFillView()
            : this.program.methods.closeQuoteView();
    return builder
      .accountsPartial({ owner: this.owner, view: this.id })
      .rpc({ commitment: "confirmed" });
  }
}
