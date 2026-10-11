import * as anchor from "@anchor-lang/core";
import { ARCIUM_IDL, getMXEAccAddress } from "@arcium-hq/client";
import {
  DEPTH_IDL,
  DEPTH_PROGRAM_ID,
  marketAddress,
  protocolAddress,
} from "@depthhq/bindings";
import {
  Connection,
  Keypair,
  PublicKey,
  type AccountInfo,
} from "@solana/web3.js";
import { createPrivateKey, sign } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captureDeployment,
  manifestBytes,
  verifyDeployment,
  type DeploymentManifest,
  type SignedManifest,
} from "@/chain/manifest";
import { prepare_depth } from "@/chain/environment";

function defaults(idl: anchor.Idl, type: anchor.IdlType): unknown {
  if (typeof type === "string") {
    if (type === "pubkey") return PublicKey.default;
    if (type === "bool") return false;
    if (/^[ui](?:64|128|256)$/.test(type)) return new anchor.BN(0);
    return 0;
  }
  if ("array" in type)
    return Array.from({ length: type.array[1] as number }, () =>
      defaults(idl, type.array[0]),
    );
  if ("option" in type) return null;
  if ("vec" in type) return [];
  if ("defined" in type) {
    const definition = idl.types!.find(
      (item) => item.name === type.defined.name,
    )!.type;
    if (definition.kind === "struct")
      return Object.fromEntries(
        (definition.fields as anchor.IdlField[]).map((field) => [
          field.name,
          defaults(idl, field.type),
        ]),
      );
    if (definition.kind === "enum")
      return { [definition.variants[0].name]: {} };
  }
  throw new Error("Unsupported fixture type");
}

test("wallet-free preparation shares verification, expires it, and rejects changed chain state", async () => {
  const connection = new Connection("http://localhost:8899");
  const depth = new anchor.Program(DEPTH_IDL, { connection });
  const arcium = new anchor.Program(ARCIUM_IDL, { connection });
  const signer = Keypair.generate();
  const programData = PublicKey.unique();
  const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
  const info = (
    owner: PublicKey,
    data: Buffer,
    executable = false,
  ): AccountInfo<Buffer> => ({
    owner,
    data,
    executable,
    lamports: 1,
    rentEpoch: 0,
  });
  const program = Buffer.alloc(36);
  program.writeUInt32LE(2);
  programData.toBuffer().copy(program, 4);
  const binary = Buffer.alloc(90);
  binary.writeUInt32LE(3);
  binary[12] = 1;
  signer.publicKey.toBuffer().copy(binary, 13);
  const market = defaults(depth.idl, { defined: { name: "market" } }) as Record<
    string,
    unknown
  >;
  const protocol = defaults(depth.idl, { defined: { name: "protocol" } });
  const accounts = new Map<string, AccountInfo<Buffer>>([
    [DEPTH_PROGRAM_ID.toBase58(), info(loader, program, true)],
    [programData.toBase58(), info(loader, binary)],
    [
      marketAddress().toBase58(),
      info(
        DEPTH_PROGRAM_ID,
        await depth.coder.accounts.encode("market", market),
      ),
    ],
    [
      protocolAddress().toBase58(),
      info(
        DEPTH_PROGRAM_ID,
        await depth.coder.accounts.encode("protocol", protocol),
      ),
    ],
    [
      getMXEAccAddress(DEPTH_PROGRAM_ID).toBase58(),
      info(
        arcium.programId,
        await arcium.coder.accounts.encode("mxeAccount", {
          padding: 0,
          cluster: 456,
          keygenOffset: new anchor.BN(0),
          keyRecoveryInitOffset: new anchor.BN(0),
          mxeProgramId: DEPTH_PROGRAM_ID,
          authority: null,
          utilityPubkeys: {
            set: [
              {
                x25519Pubkey: Array(32).fill(0),
                ed25519VerifyingKey: Array(32).fill(0),
                elgamalPubkey: Array(32).fill(0),
                pubkeyValidityProof: Array(64).fill(0),
              },
            ],
          },
          lutOffsetSlot: new anchor.BN(0),
          computationDefinitions: [],
          status: { active: {} },
          bump: 0,
          currentEpochRecoveryRewards: new anchor.BN(0),
          recoveryRewardsEpoch: [new anchor.BN(0)],
        }),
      ),
    ],
  ]);
  connection.getGenesisHash = async () =>
    "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
  connection.getAccountInfo = async (key, config) => {
    const value = accounts.get(key.toBase58()) ?? null;
    const slice = typeof config === "object" ? config.dataSlice : undefined;
    return value && slice
      ? {
          ...value,
          data: value.data.subarray(slice.offset, slice.offset + slice.length),
        }
      : value;
  };
  connection.getAccountInfoAndContext = async (key) => ({
    context: { slot: 82 },
    value: await connection.getAccountInfo(key),
  });
  let binaryReads = 0;
  connection.getMultipleAccountsInfo = async (keys) => {
    if (keys.some((key) => key.equals(programData))) binaryReads++;
    return keys.map(
      (key) =>
        accounts.get(key.toBase58()) ?? info(arcium.programId, Buffer.alloc(8)),
    );
  };
  const time = Date.now();
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  const privateKey = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(signer.secretKey.subarray(0, 32)),
    ]),
    format: "der",
    type: "pkcs8",
  });
  const signed = (payload: DeploymentManifest): SignedManifest => ({
    payload,
    signer: signer.publicKey.toBase58(),
    signature: sign(null, manifestBytes(payload), privateKey).toString(
      "base64",
    ),
  });
  let manifest = signed(
    await captureDeployment({ connection }, 1, Math.floor(time / 1_000) + 120),
  );
  binaryReads = 0;
  globalThis.fetch = async () => new Response(JSON.stringify(manifest));
  try {
    Date.now = () => time;
    const options = { environment: "devnet" as const, connection };
    const [first, second] = await Promise.all([
      prepare_depth(options),
      prepare_depth(options),
    ]);
    assert.equal(first.connection, second.connection);
    assert.equal(binaryReads, 1);
    await verifyDeployment({ connection }, first.deployment);
    assert.equal(binaryReads, 1);
    manifest.payload.version = 2;
    await assert.rejects(prepare_depth(options), /could not be verified/);
    manifest = signed(manifest.payload);
    await prepare_depth(options);
    assert.equal(binaryReads, 2);
    Date.now = () => time + 31_000;
    market.revision = new anchor.BN(1);
    accounts.set(
      marketAddress().toBase58(),
      info(
        DEPTH_PROGRAM_ID,
        await depth.coder.accounts.encode("market", market),
      ),
    );
    await assert.rejects(prepare_depth(options), /does not match/);
    manifest = signed({ ...manifest.payload, revision: "1" });
    await prepare_depth(options);
    assert.equal(binaryReads, 4);
    binary[13] ^= 1;
    await assert.rejects(prepare_depth(options), /could not be verified/);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});
