import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export class FillCursorStore {
  readonly path: string;

  constructor(
    readonly genesis: string,
    readonly maker: string,
    directory?: string
  ) {
    if (
      !/^[1-9A-HJ-NP-Za-km-z]+$/.test(genesis) ||
      !/^[1-9A-HJ-NP-Za-km-z]+$/.test(maker)
    )
      throw new RangeError("Fill cursor identity is invalid");
    this.path = join(
      directory ??
        process.env.XDG_STATE_HOME ??
        join(homedir(), ".local", "state"),
      "depth",
      "fills",
      `${genesis}-${maker}.json`
    );
  }

  async load(): Promise<string | undefined> {
    let contents: string;
    try {
      contents = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const saved = JSON.parse(contents) as Record<string, unknown>;
    if (
      saved.genesis !== this.genesis ||
      saved.maker !== this.maker ||
      typeof saved.cursor !== "string" ||
      !saved.cursor
    )
      throw new Error("Fill cursor file does not match this maker and network");
    return saved.cursor;
  }

  async save(cursor: string): Promise<void> {
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(cursor))
      throw new RangeError("Fill cursor signature is invalid");
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.${randomBytes(8).toString(
      "hex"
    )}`;
    await writeFile(
      temporary,
      JSON.stringify({
        genesis: this.genesis,
        maker: this.maker,
        cursor,
      }),
      { mode: 0o600 }
    );
    await rename(temporary, this.path);
  }
}
