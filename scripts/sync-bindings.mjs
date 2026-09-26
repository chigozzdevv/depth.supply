import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "contracts/target");
const destination = resolve(root, "packages/bindings/src");
const idl = JSON.parse(readFileSync(resolve(source, "idl/depth.json"), "utf8"));
const anchor = readFileSync(resolve(root, "contracts/Anchor.toml"), "utf8");
const address = anchor.match(/^depth = "([^"]+)"/m)?.[1];
if (!address || idl.address !== address) {
  throw new Error("Generated IDL address does not match Anchor.toml");
}
mkdirSync(destination, { recursive: true });
copyFileSync(
  resolve(source, "idl/depth.json"),
  resolve(destination, "depth.json")
);
copyFileSync(
  resolve(source, "types/depth.ts"),
  resolve(destination, "depth.ts")
);
