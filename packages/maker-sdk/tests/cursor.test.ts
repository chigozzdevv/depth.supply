import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FillCursorStore } from "@/fill/cursor";

test("maker fill cursor resumes only for the same network and maker", async () => {
  const directory = await mkdtemp(join(tmpdir(), "depth-fill-"));
  try {
    const store = new FillCursorStore("Abc123", "Maker123", directory);
    assert.equal(await store.load(), undefined);
    await store.save("Signature123");
    assert.equal(
      await new FillCursorStore("Abc123", "Maker123", directory).load(),
      "Signature123"
    );
    assert.equal(
      await new FillCursorStore("Abc123", "Peer123", directory).load(),
      undefined
    );
    await writeFile(
      store.path,
      JSON.stringify({
        genesis: "Peer123",
        maker: "Maker123",
        cursor: "Signature123",
      })
    );
    await assert.rejects(store.load(), /does not match/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
