import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const entries = {
  bindings: ["index"],
  schema: ["index"],
  sdk: ["index", "view/view", "recovery/recovery", "account/funding"],
  "maker-sdk": ["index"],
};

function rewriteDeclarations(folder, output) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      rewriteDeclarations(path, output);
      continue;
    }
    if (!path.endsWith(".d.ts")) continue;
    const source = readFileSync(path, "utf8");
    const rewritten = source.replace(
      /(["'])@\/([^"']+)\1/g,
      (_match, quote, name) => {
        const target = join(output, name);
        let specifier = relative(dirname(path), target).split(sep).join("/");
        if (!specifier.startsWith(".")) specifier = `./${specifier}`;
        return `${quote}${specifier}${quote}`;
      },
    );
    writeFileSync(path, rewritten);
  }
}

const requested = process.argv.slice(2);
if (requested.length === 0 || requested.some((name) => !(name in entries))) {
  throw new Error("Specify one or more of bindings, schema, sdk, maker-sdk");
}

for (const name of requested) {
  const folder = join(root, "packages", name);
  const output = join(folder, "dist");
  rmSync(output, { recursive: true, force: true });
  for (const entry of entries[name]) {
    const file = join(output, `${entry}.js`);
    mkdirSync(dirname(file), { recursive: true });
    execFileSync(
      "bun",
      [
        "build",
        join(folder, "src", `${entry}.ts`),
        "--external=@anchor-lang/*",
        "--external=@arcium-hq/*",
        "--external=@depth/*",
        "--external=@solana/*",
        "--target=node",
        "--format=esm",
        `--outfile=${file}`,
      ],
      { cwd: folder, stdio: "inherit" },
    );
  }
  execFileSync(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "-p",
      join(folder, "tsconfig.build.json"),
    ],
    { cwd: folder, stdio: "inherit" },
  );
  rewriteDeclarations(output, output);
}
