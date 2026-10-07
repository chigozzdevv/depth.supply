import { lstatSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { dirname, relative } from "node:path";
import { resolvePath } from "../../scripts/paths.mjs";
import { readSigner, signerPath } from "../../scripts/signers.mjs";

export function stageProgramKeypair(
  source = signerPath("program"),
  target = resolvePath("contracts/target/deploy/depth-keypair.json"),
) {
  source = resolvePath(source);
  target = resolvePath(target);
  const expectedPublicKey =
    source === signerPath("program")
      ? JSON.parse(
          readFileSync(resolvePath("packages/bindings/src/depth.json"), "utf8"),
        ).address
      : undefined;
  let sourceKey;
  try {
    sourceKey = readSigner(source, {
      label: "program signer",
      expectedPublicKey,
    });
  } catch (error) {
    if (
      error.code === "ENOENT" &&
      !process.env.DEPTH_PROGRAM_KEYPAIR_PATH &&
      source === signerPath("program")
    )
      return;
    throw error;
  }
  let targetExists = false;
  try {
    lstatSync(target);
    targetExists = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (targetExists) {
    const targetKey = readSigner(target, { label: "generated program signer" });
    if (!sourceKey.publicKey.equals(targetKey.publicKey)) {
      throw new Error(
        "The generated program keypair differs from the configured program identity",
      );
    }
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(relative(dirname(target), source), target);
}
