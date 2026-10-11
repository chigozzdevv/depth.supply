import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BotStore } from "@depthhq/maker-sdk/node";
import { automationView } from "@depthhq/maker-sdk";
import { privateKeyToAccount } from "viem/accounts";
import {
  publicAutomation,
  type AutomationRecord,
} from "@/features/automation/automation.model";

export class AutomationStore {
  private records: AutomationRecord[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private readonly lease: BotStore;
  private readonly key: Buffer;
  private readonly path: string;
  private constructor(
    readonly directory: string,
    secret: string,
    readonly environment: "devnet" | "mainnet-beta",
  ) {
    if (!/^[0-9a-f]{64}$/.test(secret))
      throw new Error(
        "DEPTH_AUTOMATION_SECRET must contain 32 random bytes in hexadecimal",
      );
    this.key = Buffer.from(secret, "hex");
    this.path = join(directory, "automation.json");
    this.lease = new BotStore(
      PublicKey.default.toBase58(),
      new PublicKey(Buffer.alloc(32, 1)).toBase58(),
      PublicKey.default.toBase58(),
      directory,
    );
  }
  static async open(
    directory: string,
    secret: string,
    environment: "devnet" | "mainnet-beta",
  ) {
    const store = new AutomationStore(directory, secret, environment);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    await store.lease.acquire();
    try {
      let source: string;
      try {
        source = await readFile(store.path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return store;
        throw error;
      }
      const envelope = JSON.parse(source);
      if (
        envelope.version !== 1 ||
        !/^[0-9a-f]{24}$/.test(envelope.iv) ||
        !/^[0-9a-f]{32}$/.test(envelope.tag) ||
        typeof envelope.data !== "string"
      )
        throw new Error("Automation vault is invalid");
      const cipher = createDecipheriv(
        "aes-256-gcm",
        store.key,
        Buffer.from(envelope.iv, "hex"),
      );
      cipher.setAAD(Buffer.from(`depth:automation:1:${environment}`));
      cipher.setAuthTag(Buffer.from(envelope.tag, "hex"));
      const records = JSON.parse(
        Buffer.concat([
          cipher.update(Buffer.from(envelope.data, "base64")),
          cipher.final(),
        ]).toString(),
      );
      if (!Array.isArray(records) || records.length > 128)
        throw new Error("Automation vault is invalid");
      const owners = new Set<string>();
      const accounts = new Set<string>();
      for (const record of records as AutomationRecord[]) {
        automationView(publicAutomation(record), record.owner, environment);
        if (
          owners.has(record.owner) ||
          new PublicKey(record.owner).toBase58() !== record.owner ||
          Keypair.fromSecretKey(
            Buffer.from(record.operatorSecret, "base64"),
          ).publicKey.toBase58() !== record.operator ||
          !/^0x[0-9a-f]{64}$/.test(record.agentSecret)
        )
          throw new Error("Automation vault identity is invalid");
        owners.add(record.owner);
        if (
          privateKeyToAccount(record.agentSecret).address.toLowerCase() !==
            record.agent.toLowerCase() ||
          (record.started !== undefined && typeof record.started !== "boolean")
        )
          throw new Error("Automation vault agent identity is invalid");
        if (record.hedgeBound && record.config.hedge) {
          const account = record.config.hedge.account.toLowerCase();
          if (accounts.has(account))
            throw new Error("Hyperliquid account is assigned twice");
          accounts.add(account);
        }
      }
      store.records = records;
      await chmod(store.path, 0o600);
      return store;
    } catch (error) {
      await store.lease.release();
      throw error;
    }
  }
  list() {
    return structuredClone(this.records);
  }
  get(owner: string) {
    return structuredClone(
      this.records.find((record) => record.owner === owner),
    );
  }
  async change<T>(action: (records: AutomationRecord[]) => T): Promise<T> {
    const task = this.queue.then(async () => {
      const records = structuredClone(this.records);
      const result = action(records);
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", this.key, iv);
      cipher.setAAD(Buffer.from(`depth:automation:1:${this.environment}`));
      const data = Buffer.concat([
        cipher.update(JSON.stringify(records)),
        cipher.final(),
      ]);
      const envelope = JSON.stringify({
        version: 1,
        iv: iv.toString("hex"),
        tag: cipher.getAuthTag().toString("hex"),
        data: data.toString("base64"),
      });
      const temporary = `${this.path}.${randomBytes(8).toString("hex")}.tmp`;
      try {
        const file = await open(temporary, "wx", 0o600);
        try {
          await file.writeFile(envelope);
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
        return structuredClone(result);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async close() {
    await this.queue;
    await this.lease.release();
    this.key.fill(0);
  }
}
