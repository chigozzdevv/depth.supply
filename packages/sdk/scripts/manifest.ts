import * as anchor from "@anchor-lang/core";
import { Connection, Keypair } from "@solana/web3.js";
import { createPrivateKey, sign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { captureDeployment, manifestBytes } from "@/chain/manifest";
import { resolvePath } from "@/workspace";

const [rpcSource, keyfile, versionText, expiryText, output] =
  process.argv.slice(2);
const rpc = rpcSource === "env" ? process.env.SOLANA_RPC_URL : rpcSource;
const version = Number(versionText);
const expiresAt = Number(expiryText);
if (
  !rpc ||
  !keyfile ||
  !output ||
  !Number.isSafeInteger(version) ||
  version < 1 ||
  !Number.isSafeInteger(expiresAt) ||
  expiresAt <= Math.floor(Date.now() / 1000)
) {
  throw new Error(
    "Usage: manifest.ts <rpc|env> <signer-keypair.json> <version> <expiry-unix-seconds> <output.json>",
  );
}
const signer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(await readFile(resolvePath(keyfile), "utf8"))),
);
const provider = new anchor.AnchorProvider(
  new Connection(rpc, "confirmed"),
  new anchor.Wallet(signer),
  { commitment: "confirmed" },
);
const payload = await captureDeployment(provider, version, expiresAt);
const key = createPrivateKey({
  key: Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    Buffer.from(signer.secretKey.subarray(0, 32)),
  ]),
  format: "der",
  type: "pkcs8",
});
const signature = sign(null, manifestBytes(payload), key).toString("base64");
const outputPath = resolvePath(output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  JSON.stringify(
    { payload, signer: signer.publicKey.toBase58(), signature },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
process.stdout.write(`Wrote deployment manifest to ${outputPath}\n`);
