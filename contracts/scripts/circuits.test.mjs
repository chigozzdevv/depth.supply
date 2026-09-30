import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyRemote } from "./circuits.mjs";

test("rejects remote circuit bytes that differ from the compiled hash", async () => {
  const originalFetch = globalThis.fetch;
  const bytes = Buffer.from("expected circuit");
  const hash = createHash("sha256").update(bytes).digest();
  const response = new Response(Buffer.from("altered circuit!"));
  Object.defineProperty(response, "url", {
    value: "https://example.com/circuit.arcis",
  });
  globalThis.fetch = async () => response;

  try {
    await assert.rejects(
      verifyRemote("https://example.com", [{ name: "circuit", bytes, hash }]),
      /Remote circuit hash mismatch/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
