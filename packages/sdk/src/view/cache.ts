import type { BalanceSnapshot, PositionSnapshot } from "@/view/view";

type Snapshot = BalanceSnapshot | PositionSnapshot;
type Kind = "balance" | "market";
type Envelope = { iv: Uint8Array; data: ArrayBuffer };

export interface ViewStorage {
  key(scope: string, proposed: CryptoKey): Promise<CryptoKey>;
  read(id: string): Promise<Envelope | undefined>;
  write(id: string, value: Envelope): Promise<void>;
}

export class DeviceViews implements ViewStorage {
  private database?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    return (this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("depth-private-views", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("keys");
        request.result.createObjectStore("views");
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Private view storage is blocked"));
      request.onsuccess = () => resolve(request.result);
    }));
  }

  async key(scope: string, proposed: CryptoKey): Promise<CryptoKey> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("keys", "readwrite");
      const store = transaction.objectStore("keys");
      const request = store.get(scope);
      let value: CryptoKey;
      request.onsuccess = () => {
        value = request.result ?? proposed;
        if (!request.result) store.put(value, scope);
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async read(id: string): Promise<Envelope | undefined> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("views", "readonly");
      const request = transaction.objectStore("views").get(id);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async write(id: string, value: Envelope): Promise<void> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("views", "readwrite");
      transaction.objectStore("views").put(value, id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

export class EncryptedViews {
  private key?: Promise<CryptoKey>;
  constructor(
    private readonly scope: string,
    private readonly storage: ViewStorage,
  ) {}

  private encryptionKey(): Promise<CryptoKey> {
    return (this.key ??= crypto.subtle
      .generateKey({ name: "AES-GCM", length: 256 }, false, [
        "encrypt",
        "decrypt",
      ])
      .then((key) => this.storage.key(this.scope, key)));
  }

  async read<T>(name: string): Promise<T | undefined> {
    const id = `${this.scope}:${name}`;
    const envelope = await this.storage.read(id);
    if (!envelope) return;
    const bytes = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: envelope.iv,
        additionalData: new TextEncoder().encode(id),
      },
      await this.encryptionKey(),
      envelope.data,
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  }

  async write(name: string, value: unknown): Promise<void> {
    const id = `${this.scope}:${name}`;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) },
      await this.encryptionKey(),
      new TextEncoder().encode(JSON.stringify(value)),
    );
    await this.storage.write(id, { iv, data });
  }
}

export class ViewCache {
  private readonly memory = new Map<string, Snapshot>();
  private key?: Promise<CryptoKey>;

  constructor(
    private readonly scope: string,
    private readonly storage?: ViewStorage,
  ) {}

  private encryptionKey(): Promise<CryptoKey> {
    return (this.key ??= crypto.subtle
      .generateKey({ name: "AES-GCM", length: 256 }, false, [
        "encrypt",
        "decrypt",
      ])
      .then((key) => this.storage!.key(this.scope, key)));
  }

  private id(kind: Kind, account: string): string {
    return `${this.scope}:${kind}:${account}`;
  }

  async get<T extends Snapshot>(
    kind: Kind,
    account: string,
    version: bigint,
  ): Promise<T | undefined> {
    const id = this.id(kind, account);
    let snapshot = this.memory.get(id);
    if (!snapshot && this.storage) {
      try {
        const envelope = await this.storage.read(id);
        if (envelope) {
          const bytes = await crypto.subtle.decrypt(
            {
              name: "AES-GCM",
              iv: envelope.iv,
              additionalData: new TextEncoder().encode(id),
            },
            await this.encryptionKey(),
            envelope.data,
          );
          snapshot = JSON.parse(new TextDecoder().decode(bytes), (_, value) =>
            value &&
            typeof value === "object" &&
            typeof value.$bigint === "string"
              ? BigInt(value.$bigint)
              : value,
          );
        }
      } catch {
        return undefined;
      }
    }
    if (
      !snapshot ||
      snapshot.status !== "ready" ||
      snapshot.version !== version ||
      typeof snapshot.id !== "string" ||
      !Number.isSafeInteger(snapshot.slot) ||
      (kind === "balance"
        ? typeof (snapshot as BalanceSnapshot).amount !== "bigint"
        : [
            "collateral",
            "reserved",
            "position",
            "entryPriceE8",
            "fundingCheckpoint",
          ].some(
            (field) =>
              typeof (snapshot as unknown as Record<string, unknown>)[field] !==
              "bigint",
          ))
    )
      return undefined;
    this.memory.set(id, snapshot);
    return { ...snapshot } as T;
  }

  async set(kind: Kind, account: string, snapshot: Snapshot): Promise<void> {
    if (snapshot.status !== "ready") return;
    const id = this.id(kind, account);
    this.memory.set(id, { ...snapshot });
    if (!this.storage) return;
    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const bytes = new TextEncoder().encode(
        JSON.stringify(snapshot, (_, value) =>
          typeof value === "bigint" ? { $bigint: value.toString() } : value,
        ),
      );
      const data = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) },
        await this.encryptionKey(),
        bytes,
      );
      await this.storage.write(id, { iv, data });
    } catch {
      // Unavailable device storage falls back to the current wallet session.
    }
  }
}
