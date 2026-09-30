import { setTimeout } from "node:timers/promises";

export async function submitTransaction(connection, signer, transaction) {
  const blockhash = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = signer.publicKey;
  transaction.recentBlockhash = blockhash.blockhash;
  transaction.sign(signer);
  const signature = await connection.sendRawTransaction(
    transaction.serialize(),
    {
      skipPreflight: false,
      maxRetries: 3,
    }
  );
  for (;;) {
    const status = (await connection.getSignatureStatuses([signature]))
      .value[0];
    if (status?.err) throw new Error(`Transaction failed: ${signature}`);
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return signature;
    }
    if (
      (await connection.getBlockHeight("confirmed")) >
      blockhash.lastValidBlockHeight
    ) {
      throw new Error(`Transaction expired: ${signature}`);
    }
    await setTimeout(1_000);
  }
}
