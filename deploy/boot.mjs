import { mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { resolvePath } from "../scripts/paths.mjs";

const archive = resolvePath(
  `data/runtime/leases/${Date.now()}-${randomBytes(4).toString("hex")}`,
);
await mkdir(archive, { recursive: true, mode: 0o700 });
for (const name of ["maker", "views", "runtime"]) {
  const directory = resolvePath(`data/${name}`);
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  for (const entry of entries) {
    const stale =
      name === "runtime"
        ? ["services.json", "services.json.lock"].includes(entry.name)
        : entry.name.endsWith(".lock");
    if (entry.isFile() && stale)
      await rename(
        join(directory, entry.name),
        join(archive, `${name}-${entry.name}`),
      );
  }
}
await import("../scripts/services.mjs");
