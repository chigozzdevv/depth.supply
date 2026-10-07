import { DEPTH_PROGRAM_ID } from "@depth/bindings";
import { readFile } from "node:fs/promises";
import { resolvePath } from "@/shared/config/path";

const genesis = {
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
} as const;

export type PublicEnvironment = keyof typeof genesis;

export class DeploymentService {
  constructor(
    private readonly paths: Record<PublicEnvironment, string | undefined>
  ) {}

  async manifest(environment: PublicEnvironment): Promise<unknown> {
    const path = this.paths[environment];
    if (!path) return undefined;
    let contents: string;
    try {
      contents = await readFile(resolvePath(path), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const value: unknown = JSON.parse(contents);
    if (!value || typeof value !== "object")
      throw new Error("Deployment manifest is invalid");
    const signed = value as Record<string, unknown>;
    const payload = signed.payload as Record<string, unknown> | undefined;
    if (
      typeof signed.signer !== "string" ||
      typeof signed.signature !== "string" ||
      !payload ||
      payload.genesisHash !== genesis[environment] ||
      payload.program !== DEPTH_PROGRAM_ID.toBase58() ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      throw new Error("Deployment manifest does not match this environment");
    }
    return value;
  }
}
