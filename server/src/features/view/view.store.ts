import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { BotStore } from "@depthhq/maker-sdk/node";
import { PublicKey } from "@solana/web3.js";
import type { ViewRecord } from "@/features/view/view.model";

export class ViewStore {
  private records: ViewRecord[] = [];
  private readonly path: string;
  private readonly lease: BotStore;
  private constructor(
    private readonly directory: string,
    private readonly identity: string,
  ) {
    this.path = join(directory, "views.json");
    this.lease = new BotStore(
      PublicKey.default.toBase58(),
      new PublicKey(Buffer.alloc(32, 2)).toBase58(),
      PublicKey.default.toBase58(),
      directory,
    );
  }
  static async open(directory: string, identity: string): Promise<ViewStore> {
    const store = new ViewStore(directory, identity);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await store.lease.acquire();
    try {
      let data: string;
      try {
        data = await readFile(store.path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return store;
        throw error;
      }
      const journal = JSON.parse(data);
      if (journal.identity !== identity || !Array.isArray(journal.records))
        throw new Error("Private read journal identity is invalid");
      const keys = new Set<string>();
      for (const record of journal.records as ViewRecord[]) {
        if (
          typeof record.key !== "string" ||
          keys.has(record.key) ||
          !record.request ||
          !record.receipt ||
          !Number.isSafeInteger(record.createdAt)
        )
          throw new Error("Private read journal is invalid");
        keys.add(record.key);
      }
      store.records = journal.records;
      return store;
    } catch (error) {
      await store.close();
      throw error;
    }
  }
  list(): ViewRecord[] {
    return structuredClone(this.records);
  }
  get(key: string): ViewRecord | undefined {
    return structuredClone(this.records.find((record) => record.key === key));
  }
  async save(record: ViewRecord): Promise<void> {
    const records = this.records.filter(
      (r) =>
        r.key !== record.key &&
        (!r.closed || r.createdAt >= Date.now() - 7 * 86400000),
    );
    records.push(structuredClone(record));
    const temporary = `${this.path}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(
          JSON.stringify({ identity: this.identity, records }),
        );
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, this.path);
      const directory = await open(this.directory, "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
      this.records = records;
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }
  async close(): Promise<void> {
    await this.lease.release();
  }
}
