import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packages = ["bindings", "schema", "sdk", "maker-sdk"];
const output = join(root, "dist", "sdk");
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
function unchanged(path, folder, pkg) {
  if (!existsSync(path)) return false;
  const expected = structuredClone(pkg);
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const [name, version] of Object.entries(expected[field] ?? {})) {
      if (version === "workspace:*")
        expected[field][name] = JSON.parse(
          readFileSync(
            join(root, "packages", name.split("/").at(-1), "package.json"),
            "utf8",
          ),
        ).version;
    }
  }
  const files = new Map();
  function collect(directory, prefix) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory())
        collect(join(directory, entry.name), `${prefix}/${entry.name}`);
      else
        files.set(
          `${prefix}/${entry.name}`,
          readFileSync(join(directory, entry.name)),
        );
    }
  }
  collect(join(folder, "dist"), "package/dist");
  const names = execFileSync("tar", ["-tzf", path], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((name) => !name.endsWith("/"));
  if (names.length !== files.size + 1 || new Set(names).size !== names.length)
    return false;
  for (const name of names) {
    if (name !== "package/package.json" && !files.has(name)) return false;
    const bytes = execFileSync("tar", ["-xOf", path, name], {
      maxBuffer: 10 * 1024 * 1024,
    });
    if (name === "package/package.json") {
      if (
        JSON.stringify(canonical(JSON.parse(bytes))) !==
        JSON.stringify(canonical(expected))
      )
        return false;
    } else if (!bytes.equals(files.get(name))) return false;
  }
  return true;
}
execFileSync(
  process.execPath,
  [join(root, "scripts", "build-package.mjs"), ...packages],
  { cwd: root, stdio: "inherit" },
);
mkdirSync(output, { recursive: true });
const files = packages.map((name) => {
  const folder = join(root, "packages", name);
  const pkg = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));
  const file = `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`;
  if (!unchanged(join(output, file), folder, pkg))
    execFileSync("pnpm", ["pack", "--pack-destination", output], {
      cwd: folder,
      stdio: "inherit",
    });
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
