import { createSigner, signerPath } from "./signers.mjs";

const environment = process.argv[2];
if (
  process.argv.length !== 3 ||
  !["devnet", "localnet"].includes(environment)
) {
  throw new Error("Usage: keys.mjs <devnet|localnet>");
}
for (const role of environment === "devnet"
  ? ["app", "trader", "maker"]
  : ["localnet"]) {
  const signer = createSigner(role);
  console.log(`${role}: ${signer.publicKey.toBase58()} (${signerPath(role)})`);
}
