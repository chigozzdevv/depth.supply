import { readCircuits, verifyRemote } from "./circuits.mjs";

const jwt = process.env.PINATA_JWT;
const gateway = process.env.PINATA_GATEWAY_HOST;
if (!jwt || !gateway || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(gateway)) {
  throw new Error("PINATA_JWT and PINATA_GATEWAY_HOST are required");
}

const circuits = await readCircuits();
const form = new FormData();
for (const { name, bytes } of circuits) {
  const filename = `${name}.arcis`;
  form.append("file", new File([bytes], filename), `depth/${filename}`);
}
form.append("pinataMetadata", JSON.stringify({ name: "depth-circuits" }));

const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}` },
  body: form,
  signal: AbortSignal.timeout(600_000),
});
if (!response.ok)
  throw new Error(`Pinata upload failed: HTTP ${response.status}`);

const result = await response.json();
if (!/^Qm[1-9A-HJ-NP-Za-km-z]{44}$|^bafy[a-z2-7]+$/i.test(result.IpfsHash)) {
  throw new Error("Pinata did not return a valid folder CID");
}

const base = `https://${gateway}/ipfs/${result.IpfsHash}`;
process.stdout.write(`Pinata folder CID: ${result.IpfsHash}\n`);
await verifyRemote(base, circuits);
process.stdout.write(`DEPTH_CIRCUIT_BASE_URL=${base}\n`);
