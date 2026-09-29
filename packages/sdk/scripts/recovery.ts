import { PublicKey } from "@solana/web3.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  combineRecoveryShares,
  createRecoveryShares,
  openRecoveryShare,
} from "@/recovery/shares";
import type { RecoveryEnvelope, RecoveryShare } from "@/recovery/shares";

const [action, ...args] = process.argv.slice(2);

if (action === "create") {
  const [marketText, recipientsFile, outputDirectory] = args;
  if (!marketText || !recipientsFile || !outputDirectory)
    throw new Error(
      "Usage: recovery.ts create <market> <recipients.json> <output-directory>"
    );
  const market = new PublicKey(marketText);
  const recipients = JSON.parse(
    await readFile(recipientsFile, "utf8")
  ) as string[];
  if (!Array.isArray(recipients))
    throw new Error("Recipient file must contain five base64 keys");
  const result = createRecoveryShares(
    market,
    recipients.map((recipient) => Buffer.from(recipient, "base64"))
  );
  await mkdir(outputDirectory, { mode: 0o700 });
  await writeFile(
    join(outputDirectory, "public.json"),
    JSON.stringify({
      market: marketText,
      recoveryKey: Buffer.from(result.recoveryKey).toString("base64"),
    }),
    { flag: "wx", mode: 0o600 }
  );
  for (const envelope of result.envelopes)
    await writeFile(
      join(outputDirectory, `share-${envelope.index}.json`),
      JSON.stringify(envelope),
      { flag: "wx", mode: 0o600 }
    );
} else if (action === "open") {
  const [envelopeFile, secretFile, outputFile] = args;
  if (!envelopeFile || !secretFile || !outputFile)
    throw new Error(
      "Usage: recovery.ts open <envelope.json> <member-secret.base64> <output.json>"
    );
  const envelope = JSON.parse(
    await readFile(envelopeFile, "utf8")
  ) as RecoveryEnvelope;
  const secret = Buffer.from(
    (await readFile(secretFile, "utf8")).trim(),
    "base64"
  );
  try {
    const share = openRecoveryShare(envelope, secret);
    await writeFile(
      outputFile,
      JSON.stringify({
        ...share,
        data: Buffer.from(share.data).toString("base64"),
      }),
      { flag: "wx", mode: 0o600 }
    );
    share.data.fill(0);
  } finally {
    secret.fill(0);
  }
} else if (action === "verify") {
  const [marketText, keyText, ...shareFiles] = args;
  if (!marketText || !keyText || shareFiles.length < 3)
    throw new Error(
      "Usage: recovery.ts verify <market> <recovery-key.base64> <share1.json> <share2.json> <share3.json>"
    );
  const shares = await Promise.all(
    shareFiles.map(async (file) => {
      const value = JSON.parse(await readFile(file, "utf8")) as Omit<
        RecoveryShare,
        "data"
      > & { data: string };
      return { ...value, data: Buffer.from(value.data, "base64") };
    })
  );
  try {
    const secret = combineRecoveryShares(
      new PublicKey(marketText),
      Buffer.from(keyText, "base64"),
      shares
    );
    secret.fill(0);
    process.stdout.write("Recovery shares match the market key.\n");
  } finally {
    for (const share of shares) share.data.fill(0);
  }
} else {
  throw new Error("Usage: recovery.ts <create|open|verify> ...");
}
