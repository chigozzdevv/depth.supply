import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packages = ["bindings", "schema", "sdk", "maker-sdk"];
const output = join(root, "dist", "sdk");
execFileSync(
  process.execPath,
  [join(root, "scripts", "build-package.mjs"), ...packages],
  { cwd: root, stdio: "inherit" },
);
mkdirSync(output, { recursive: true });
const files = packages.map((name) => {
  const folder = join(root, "packages", name);
  const pkg = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));
  execFileSync("pnpm", ["pack", "--pack-destination", output], {
    cwd: folder,
    stdio: "inherit",
  });
  const file = `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`;
  return {
    name: pkg.name,
    version: pkg.version,
    file,
    sha256: createHash("sha256")
      .update(readFileSync(join(output, file)))
      .digest("hex"),
  };
});
writeFileSync(
  join(output, "release.json"),
  `${JSON.stringify({ files }, null, 2)}\n`,
);
