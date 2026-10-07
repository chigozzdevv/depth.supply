import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { dirname, relative } from "node:path";
import { Keypair } from "@solana/web3.js";
import { resolvePath, settingPath } from "../../scripts/paths.mjs";

export function stageProgramKeypair(
  source = settingPath(
    "DEPTH_PROGRAM_KEYPAIR_PATH",
    "keys/devnet/program.json"
  ),
  target = resolvePath("contracts/target/deploy/depth-keypair.json")
) {
  if (!existsSync(source)) return;
  if (existsSync(target)) {
    const sourceKey = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(source, "utf8")))
    );
    const targetKey = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(readFileSync(target, "utf8")))
    );
    if (!sourceKey.publicKey.equals(targetKey.publicKey)) {
      throw new Error(
        "The generated program keypair differs from the configured program identity"
      );
    }
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(relative(dirname(target), source), target);
}
