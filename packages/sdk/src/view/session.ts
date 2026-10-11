import { Buffer } from "buffer";
import * as anchor from "@anchor-lang/core";
import { getMXEPublicKey, x25519 } from "@arcium-hq/client";
import {
  DEPTH_PROGRAM_ID,
  marketAddress,
  viewPermitAddress,
} from "@depthhq/bindings";
import {
  viewMessage,
  type ViewKind,
  type ViewRequest,
  type ViewReceipt,
} from "@depthhq/schema";
import { getPublicKey, sign } from "@noble/ed25519";
import { PublicKey, type Connection } from "@solana/web3.js";
import { randomBytes } from "@/chain/random";
import { EncryptedViews, type ViewStorage } from "@/view/cache";
import { DepthView } from "@/view/view";

type Identity = { signing: number[]; encryption: number[] };
type Permit = {
  owner: PublicKey;
  market: PublicKey;
  reader: PublicKey;
  viewKey: number[];
  expiresAt: anchor.BN;
  scopes: number;
  active: boolean;
};
type Pending = { nonce: string };
const identities = new Map<string, Promise<Identity>>();
const approvals = new Map<string, Promise<void>>();
const requests = new Map<string, Promise<DepthView>>();
const disabled = new Set<string>();

export class ViewSession {
  private readonly storage?: EncryptedViews;
  private readonly pending = new Map<string, Pending>();
  constructor(
    private readonly program: anchor.Program,
    private readonly connection: Connection,
    private readonly owner: PublicKey,
    private readonly serviceUrl: string | undefined,
    private readonly scope: string,
    storage?: ViewStorage,
  ) {
    if (storage) this.storage = new EncryptedViews(scope, storage);
  }

  private identity(): Promise<Identity> {
    let value = identities.get(this.scope);
    if (!value) {
      value = (async () => {
        const saved = await this.storage?.read<Identity>("authorization");
        if (saved) {
          if (
            ![saved.signing, saved.encryption].every(
              (key) =>
                Array.isArray(key) &&
                key.length === 32 &&
                key.every((v) => Number.isInteger(v) && v >= 0 && v <= 255),
            )
          )
            throw new Error("Invalid private read identity");
          return saved;
        }
        const identity = {
          signing: Array.from(randomBytes(32)),
          encryption: Array.from(x25519.utils.randomSecretKey()),
        };
        await this.storage?.write("authorization", identity);
        return identity;
      })();
      identities.set(this.scope, value);
      value.catch(() => identities.delete(this.scope));
    }
    return value;
  }

  private async keys() {
    const identity = await this.identity();
    const secret = Uint8Array.from(identity.encryption);
    const signing = Uint8Array.from(identity.signing);
    const reader = new PublicKey(await getPublicKey(signing));
    return {
      signing,
      secret,
      reader,
      viewKey: x25519.getPublicKey(secret),
      permit: viewPermitAddress(this.owner, reader),
    };
  }

  async status(): Promise<{ active: boolean; expiresAt?: number; id: string }> {
    const keys = await this.keys();
    const info = await this.connection.getAccountInfo(keys.permit, "confirmed");
    if (!info) return { active: false, id: keys.permit.toBase58() };
    if (!info.owner.equals(DEPTH_PROGRAM_ID))
      throw new Error("Invalid private read permission owner");
    const permit = this.program.coder.accounts.decode<Permit>(
      "viewPermit",
      info.data,
    );
    const expiresAt = permit.expiresAt.toNumber();
    if (
      !permit.owner.equals(this.owner) ||
      !permit.reader.equals(keys.reader) ||
      !permit.market.equals(marketAddress()) ||
      !Buffer.from(permit.viewKey).equals(Buffer.from(keys.viewKey))
    )
      throw new Error("Private read permission does not match this device");
    return {
      id: keys.permit.toBase58(),
      active:
        permit.active &&
        expiresAt > Math.floor(Date.now() / 1000) &&
        permit.scopes === 15,
      expiresAt,
    };
  }

  private async capability(): Promise<void> {
    if (!this.serviceUrl)
      throw new Error(
        "A Depth service is required for automatic private reads",
      );
    const response = await fetch(`${this.serviceUrl}/v1/views`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (
      !response.ok ||
      ((await response.json()) as { enabled?: boolean }).enabled !== true
    )
      throw new Error("Automatic private reads are unavailable");
  }

  async authorize(): Promise<void> {
    const { permit, reader, viewKey } = await this.keys();
    const id = permit.toBase58();
    const existing = approvals.get(id);
    if (existing) return existing;
    const approval = (async () => {
      if ((await this.status()).active) {
        disabled.delete(this.scope);
        await this.storage?.write("disabled", false);
        return;
      }
      await this.capability();
      const expiresAt = new anchor.BN(
        Math.floor(Date.now() / 1000) + 7 * 86400 - 60,
      );
      await this.program.methods
        .authorizeViews(reader, Array.from(viewKey), expiresAt, 15)
        .accountsPartial({ owner: this.owner, market: marketAddress(), permit })
        .rpc({ commitment: "confirmed" });
      disabled.delete(this.scope);
      await this.storage?.write("disabled", false);
    })().finally(() => approvals.delete(id));
    approvals.set(id, approval);
    return approval;
  }

  async revoke(): Promise<string> {
    const { permit } = await this.keys();
    const signature = await this.program.methods
      .revokeViews()
      .accountsPartial({ owner: this.owner, permit })
      .rpc({ commitment: "confirmed" });
    disabled.add(this.scope);
    await this.storage?.write("disabled", true);
    return signature;
  }

  private async post(
    request: ViewRequest,
    action: "read" | "close",
  ): Promise<Response> {
    const { signing } = await this.keys();
    request.expiresAt = Math.floor(Date.now() / 1000) + 120;
    request.signature = Buffer.from(
      await sign(
        new TextEncoder().encode(
          viewMessage(DEPTH_PROGRAM_ID.toBase58(), request, action),
        ),
        signing,
      ),
    ).toString("base64");
    return fetch(
      `${this.serviceUrl}/v1/views${action === "close" ? "/close" : ""}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(60000),
      },
    );
  }

  request(kind: ViewKind, source: PublicKey): Promise<DepthView> {
    const key = `${this.scope}:${kind}:${source.toBase58()}`;
    const pending = requests.get(key);
    if (pending) return pending;
    const request = this.read(kind, source).finally(() => requests.delete(key));
    requests.set(key, request);
    return request;
  }

  private async read(
    kind: ViewKind,
    source: PublicKey,
    retry = true,
  ): Promise<DepthView> {
    if (
      disabled.has(this.scope) ||
      (await this.storage?.read<boolean>("disabled"))
    )
      throw new Error("Private reads are disabled on this device");
    await this.authorize();
    const keys = await this.keys();
    const name = `request:${kind}:${source.toBase58()}`;
    let pending =
      this.pending.get(name) ??
      (await this.storage?.read<Pending | null>(name));
    if (!pending) {
      pending = { nonce: new anchor.BN(randomBytes(8), "le").toString() };
      await this.storage?.write(name, pending);
      this.pending.set(name, pending);
    }
    const request: ViewRequest = {
      owner: this.owner.toBase58(),
      reader: keys.reader.toBase58(),
      permit: keys.permit.toBase58(),
      kind,
      source: source.toBase58(),
      nonce: pending.nonce,
      expiresAt: 0,
      signature: "",
    };
    const response = await this.post(request, "read");
    if (response.status === 410 && retry) {
      this.pending.delete(name);
      await this.storage?.write(name, null);
      return this.read(kind, source, false);
    }
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (error.error === "view_source_busy")
        throw new Error("Private account is processing another operation");
      throw new Error(`Private read service returned HTTP ${response.status}`);
    }
    const receipt = (await response.json()) as ViewReceipt;
    const payer = new PublicKey(receipt.payer);
    const nonce = new anchor.BN(request.nonce).toArrayLike(Buffer, "le", 8);
    const seeds =
      kind === "balance"
        ? [Buffer.from("view"), payer.toBuffer(), nonce]
        : kind === "market"
          ? [Buffer.from("market-view"), source.toBuffer(), nonce]
          : [
              Buffer.from(`${kind}-view`),
              source.toBuffer(),
              payer.toBuffer(),
              nonce,
            ];
    const id = PublicKey.findProgramAddressSync(seeds, DEPTH_PROGRAM_ID)[0];
    if (receipt.id !== id.toBase58() || typeof receipt.signature !== "string")
      throw new Error("Invalid private read receipt");
    const mxeKey = await getMXEPublicKey(
      this.program.provider as anchor.AnchorProvider,
      DEPTH_PROGRAM_ID,
    );
    if (!mxeKey) throw new Error("MXE public key is unavailable");
    return new DepthView(
      id,
      receipt.signature,
      kind,
      payer,
      keys.secret,
      keys.viewKey,
      mxeKey,
      this.program,
      this.connection,
      source,
      async () => {
        this.pending.delete(name);
        await this.storage?.write(name, null);
        try {
          await this.post(request, "close");
        } catch {
          /* The relay reclaims abandoned receipts after their retention period. */
        }
        return "";
      },
    );
  }
}
