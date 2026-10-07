import * as anchor from "@anchor-lang/core";
import {
  ARCIUM_IDL,
  ARCIUM_ADDR,
  getCompDefAccAddress,
  getCompDefAccOffset,
} from "@arcium-hq/client";
import { DEPTH_IDL, DEPTH_PROGRAM_ID, computationName } from "@depth/bindings";
import { PublicKey } from "@solana/web3.js";
import assert from "node:assert/strict";
import { resolvePath } from "@/workspace";
import {
  artifactPath,
  devnetConnection,
  isMain,
  readJson,
  safeError,
  writeJson,
  type Proof,
  type ProofRecord,
} from "@/devnet/context";

type Target = { role: string; address: string; callback: string };

function lastStage(
  records: ProofRecord[],
  stage: string,
): ProofRecord | undefined {
  return [...records].reverse().find((entry) => entry.stage === stage);
}

export function callbackTargets(proof: Proof): Target[] {
  assert.equal(
    proof.status,
    "complete",
    "The latest quote proof has not completed",
  );
  const trip = lastStage(proof.results, "trade_round_trip");
  assert.ok(
    trip && trip.status === "closed",
    "A completed round trip is missing",
  );
  const quote = String(trip.quote);
  assert.ok(
    proof.results.some(
      (entry) =>
        entry.stage === "activate" &&
        entry.quote === quote &&
        entry.status === "active",
    ),
    "The traded quote was not activated in this proof",
  );
  const targets = [
    {
      role: "open",
      address: String(trip.openOrder),
      callback: `${computationName("settle_trade")}_callback`,
    },
    {
      role: "close",
      address: String(trip.closeOrder),
      callback: `${computationName("settle_trade")}_callback`,
    },
    {
      role: "quote",
      address: quote,
      callback: `${computationName("reserve_quote")}_callback`,
    },
  ];
  const release = lastStage(proof.results, "trader_release_settled");
  if (release)
    targets.push({
      role: "release",
      address: String(release.transfer),
      callback: `${computationName("debit_market")}_callback`,
    });
  for (const target of targets) new PublicKey(target.address);
  return targets;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.info(
      "Usage: pnpm devnet:callbacks\nVerifies finalized Arcium callbacks from the latest complete quote proof without submitting transactions.",
    );
    return;
  }
  assert.equal(args.length, 0, "Unknown callback argument");
  const connection = await devnetConnection();
  const targets = callbackTargets(
    await readJson<Proof>(artifactPath("quote-proof")),
  );
  const instructionCoder = new anchor.BorshInstructionCoder(DEPTH_IDL);
  const accountCoder = new anchor.BorshAccountsCoder(ARCIUM_IDL as anchor.Idl);
  const proof = {
    checkedAt: new Date().toISOString(),
    status: "running",
    results: [] as Record<string, unknown>[],
    error: undefined as string | undefined,
  };
  const save = () => writeJson(artifactPath("callback-proof"), proof);
  await save();
  try {
    for (const target of targets) {
      let found = 0;
      const signatures = await connection.getSignaturesForAddress(
        new PublicKey(target.address),
        { limit: 80 },
        "finalized",
      );
      for (const item of signatures) {
        if (item.err) continue;
        const transaction = await connection.getParsedTransaction(
          item.signature,
          { commitment: "finalized", maxSupportedTransactionVersion: 0 },
        );
        if (!transaction || transaction.meta?.err) continue;
        const instructions = [
          ...transaction.transaction.message.instructions,
          ...(transaction.meta?.innerInstructions ?? []).flatMap(
            (inner) => inner.instructions,
          ),
        ];
        for (const instruction of instructions) {
          if (
            !instruction.programId.equals(DEPTH_PROGRAM_ID) ||
            !("accounts" in instruction)
          )
            continue;
          const decoded = instructionCoder.decode(instruction.data, "base58");
          if (
            !decoded ||
            decoded.name.replaceAll("_", "").toLowerCase() !==
              target.callback.replaceAll("_", "").toLowerCase()
          )
            continue;
          const schema = DEPTH_IDL.instructions.find(
            (definition) => definition.name === decoded.name,
          );
          assert.ok(schema, "Callback schema is missing");
          const computation =
            instruction.accounts[
              schema.accounts.findIndex(
                (account) =>
                  account.name.replaceAll("_", "").toLowerCase() ===
                  "computationaccount",
              )
            ];
          const definition =
            instruction.accounts[
              schema.accounts.findIndex(
                (account) =>
                  account.name.replaceAll("_", "").toLowerCase() ===
                  "compdefaccount",
              )
            ];
          assert.ok(
            computation && definition,
            "Callback computation accounts are missing",
          );
          const circuit = target.callback.replace(/_callback$/, "");
          const offset = Buffer.from(
            getCompDefAccOffset(circuit),
          ).readUInt32LE();
          assert.ok(
            definition.equals(getCompDefAccAddress(DEPTH_PROGRAM_ID, offset)),
          );
          const info = await connection.getAccountInfo(definition, "finalized");
          assert.ok(info && info.owner.equals(new PublicKey(ARCIUM_ADDR)));
          const state = accountCoder.decode<{
            deactivation_slot: anchor.BN | null;
            circuit_source: { OffChain: [{ hash: number[] }] };
          }>("ComputationDefinitionAccount", info.data);
          assert.equal(state.deactivation_slot, null);
          const hash = Buffer.from(
            state.circuit_source.OffChain[0].hash,
          ).toString("hex");
          const localHash = Buffer.from(
            await readJson<number[]>(
              resolvePath(`contracts/build/${circuit}.hash`),
            ),
          ).toString("hex");
          assert.equal(hash, localHash);
          const result = {
            role: target.role,
            account: target.address,
            instruction: target.callback,
            circuit,
            signature: item.signature,
            slot: transaction.slot,
            blockTime: transaction.blockTime,
            commitment: "finalized",
            computation: computation.toBase58(),
            definition: definition.toBase58(),
            definitionOffset: offset,
            circuitHash: hash,
            localHashMatches: true,
          };
          proof.results.push(result);
          await save();
          console.info(JSON.stringify(result));
          found++;
        }
        if (found > 0) break;
      }
      assert.equal(
        found,
        1,
        `Expected one finalized ${target.callback} for ${target.role}`,
      );
    }
    proof.status = "complete";
    await save();
  } catch (error) {
    proof.status = "failed";
    proof.error = safeError(error);
    await save();
    throw error;
  }
}

if (isMain(import.meta.url))
  void main().catch((error: unknown) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
