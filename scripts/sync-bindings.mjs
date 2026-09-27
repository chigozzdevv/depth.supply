import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const circuits = readFileSync(
  resolve(root, "contracts/build/circuits.ts"),
  "utf8"
).replace(/export interface (\w+) \{/g, "export type $1 = {");
writeFileSync(resolve(destination, "circuits.ts"), circuits);

const constants = readFileSync(
  resolve(root, "contracts/programs/depth/src/constants.rs"),
  "utf8"
);
const computations = [...constants.matchAll(/comp_def_offset\("([^"\n]+)"\)/g)]
  .map((match) => match[1])
  .sort();
writeFileSync(
  resolve(destination, "computations.ts"),
  `export const computations = ${JSON.stringify(
    computations,
    null,
    2
  )} as const;\n`
);

const typeByName = new Map(idl.types.map((type) => [type.name, type.type]));
const widths = {
  bool: 1,
  u8: 1,
  i8: 1,
  u16: 2,
  i16: 2,
  u32: 4,
  i32: 4,
  u64: 8,
  i64: 8,
  u128: 16,
  i128: 16,
  pubkey: 32,
};
function span(type) {
  if (typeof type === "string" && type in widths) return widths[type];
  if (type.array) return span(type.array[0]) * type.array[1];
  if (type.defined) {
    const definition = typeByName.get(type.defined.name);
    if (
      definition?.kind === "enum" &&
      definition.variants.every((variant) => !variant.fields?.length)
    )
      return 1;
  }
  throw new Error(
    `Expected a fixed-width account field: ${JSON.stringify(type)}`
  );
}
const offsets = {};
for (const name of [
  "OrderRecord",
  "MarketAccount",
  "QuoteRecord",
  "WithdrawalReceipt",
]) {
  const type = typeByName.get(name);
  if (type?.kind !== "struct")
    throw new Error(`Missing account layout: ${name}`);
  let offset = 8;
  offsets[name] = Object.fromEntries(
    type.fields.map((field) => {
      const entry = [field.name, offset];
      offset += span(field.type);
      return entry;
    })
  );
}
const variants = Object.fromEntries(
  [...typeByName]
    .filter(
      ([name, type]) =>
        [
          "OrderStatus",
          "OrderKind",
          "FeeClaimStage",
          "MarketAccountStatus",
        ].includes(name) &&
        type.kind === "enum" &&
        type.variants.every((variant) => !variant.fields?.length)
    )
    .map(([name, type]) => [
      name,
      Object.fromEntries(
        type.variants.map((variant, index) => [variant.name, index])
      ),
    ])
);
writeFileSync(
  resolve(destination, "layout.ts"),
  `export const accountOffsets = ${JSON.stringify(
    offsets,
    null,
    2
  )} as const;\nexport const enumValues = ${JSON.stringify(
    variants,
    null,
    2
  )} as const;\n`
);
