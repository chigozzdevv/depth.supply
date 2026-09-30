import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const build = fileURLToPath(new URL("../build/", import.meta.url));

export async function readCircuits() {
  const names = (await readdir(build))
    .filter((file) => file.endsWith(".arcis"))
    .map((file) => file.slice(0, -6))
    .sort();

  if (names.length !== 26)
    throw new Error(`Expected 26 compiled circuits, found ${names.length}`);

  return Promise.all(
    names.map(async (name) => {
      const bytes = await readFile(join(build, `${name}.arcis`));
      const hashBytes = JSON.parse(
        await readFile(join(build, `${name}.hash`), "utf8")
      );
      if (
        !Array.isArray(hashBytes) ||
        hashBytes.length !== 32 ||
        hashBytes.some(
          (byte) => !Number.isInteger(byte) || byte < 0 || byte > 255
        )
      ) {
        throw new Error(`Invalid hash for ${name}`);
      }
      const hash = Buffer.from(hashBytes);
      const actual = createHash("sha256").update(bytes).digest();
      if (!actual.equals(hash))
        throw new Error(`Local circuit hash mismatch: ${name}`);
      return { name, bytes, hash };
    })
  );
}

export async function verifyRemote(base, circuits) {
  for (const { name, bytes, hash } of circuits) {
    const response = await fetch(`${base}/${name}.arcis`, {
      signal: AbortSignal.timeout(120_000),
    });
    if (
      !response.ok ||
      !response.body ||
      new URL(response.url).protocol !== "https:"
    ) {
      throw new Error(
        `Circuit unavailable over HTTPS: ${name} (${response.status})`
      );
    }

    const remoteHash = createHash("sha256");
    let remoteSize = 0;
    for await (const chunk of response.body) {
      remoteSize += chunk.length;
      if (remoteSize > bytes.length)
        throw new Error(`Remote circuit too large: ${name}`);
      remoteHash.update(chunk);
    }
    if (remoteSize !== bytes.length || !remoteHash.digest().equals(hash)) {
      throw new Error(`Remote circuit hash mismatch: ${name}`);
    }
    process.stdout.write(`${name}: verified ${remoteSize} bytes\n`);
  }
}
