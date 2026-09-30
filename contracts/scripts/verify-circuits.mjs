import { readCircuits, verifyRemote } from "./circuits.mjs";

const localOnly = process.argv.includes("--local");
const base = process.env.DEPTH_CIRCUIT_BASE_URL?.replace(/\/+$/, "");

if (!localOnly) {
  if (!base) throw new Error("DEPTH_CIRCUIT_BASE_URL is required");
  const url = new URL(base);
  if (url.protocol !== "https:" || url.search || url.hash) {
    throw new Error(
      "DEPTH_CIRCUIT_BASE_URL must be an HTTPS URL without a query or fragment"
    );
  }
}

const circuits = await readCircuits();
if (localOnly) {
  for (const { name, bytes } of circuits) {
    process.stdout.write(`${name}: verified ${bytes.length} bytes\n`);
  }
} else {
  await verifyRemote(base, circuits);
}
const total = circuits.reduce((sum, circuit) => sum + circuit.bytes.length, 0);
process.stdout.write(`Verified ${circuits.length} circuits (${total} bytes)\n`);
