import * as anchor from "@anchor-lang/core";
import {
  getArciumProgram,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getMXEAccAddress,
} from "@arcium-hq/client";
import {
  DEPTH_IDL,
  DEPTH_PROGRAM_ID,
  marketAddress,
  protocolAddress,
  computations,
} from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";
import { createHash, createPublicKey, verify } from "node:crypto";

export type DeploymentManifest = {
  version: number;
  expiresAt: number;
  genesisHash: string;
  program: string;
  programHash: string;
  idlHash: string;
  mxe: string;
  cluster: number;
  settlementMint: string;
  configHash: string;
  revision: string;
  definitions: { name: string; address: string; hash: string }[];
};
export type SignedManifest = {
  payload: DeploymentManifest;
  signer: string;
  signature: string;
};
export type DeploymentPolicy =
  | { manifest: SignedManifest; trustedSigner: PublicKey }
  | { localnet: true };

function normalized(value: unknown): unknown {
  if (anchor.BN.isBN(value)) return value.toString();
  if (value instanceof PublicKey) return value.toBase58();
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalized(item)]),
    );
  return value;
}

export function manifestBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(normalized(value)));
}

function hash(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function authenticateManifest(
  signed: SignedManifest,
  trusted: PublicKey,
): void {
  if (signed.signer !== trusted.toBase58())
    throw new Error("Manifest signer is not trusted");
  const publicKey = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      trusted.toBuffer(),
    ]),
    format: "der",
    type: "spki",
  });
  const payload = signed.payload;
  if (
    !Number.isSafeInteger(payload.version) ||
    payload.version < 1 ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt <= Math.floor(Date.now() / 1000) ||
    !verify(
      null,
      manifestBytes(payload),
      publicKey,
      Buffer.from(signed.signature, "base64"),
    )
  ) {
    throw new Error("Manifest signature, version, or expiry is invalid");
  }
}

export async function captureDeployment(
  provider: anchor.AnchorProvider,
  version: number,
  expiresAt: number,
): Promise<DeploymentManifest> {
  const connection = provider.connection;
  const coder = new anchor.BorshAccountsCoder(DEPTH_IDL);
  const programInfo = await connection.getAccountInfo(
    DEPTH_PROGRAM_ID,
    "confirmed",
  );
  if (
    !programInfo?.executable ||
    !programInfo.owner.equals(
      new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
    ) ||
    programInfo.data.length !== 36 ||
    programInfo.data.readUInt32LE(0) !== 2
  ) {
    throw new Error("Depth executable is not a valid upgradeable deployment");
  }
  const programData = new PublicKey(programInfo.data.subarray(4));
  const [binary, marketInfo, protocolInfo] =
    await connection.getMultipleAccountsInfo(
      [programData, marketAddress(), protocolAddress()],
      "confirmed",
    );
  if (
    !binary?.owner.equals(programInfo.owner) ||
    !marketInfo?.owner.equals(DEPTH_PROGRAM_ID) ||
    !protocolInfo?.owner.equals(DEPTH_PROGRAM_ID)
  )
    throw new Error(
      "Deployment accounts are unavailable or have the wrong owner",
    );
  const market = coder.decode<{
    config: unknown;
    revision: anchor.BN;
    settlementMint: PublicKey;
  }>("Market", marketInfo.data);
  const protocol = coder.decode<{ settlementMint: PublicKey }>(
    "Protocol",
    protocolInfo.data,
  );
  if (!market.settlementMint.equals(protocol.settlementMint))
    throw new Error("Deployment settlement mints disagree");
  const arcium = getArciumProgram(provider);
  const mxeAddress = getMXEAccAddress(DEPTH_PROGRAM_ID);
  const mxe = await arcium.account.mxeAccount.fetch(mxeAddress);
  if (!mxe.mxeProgramId.equals(DEPTH_PROGRAM_ID))
    throw new Error("MXE belongs to another program");
  const addresses = computations.map((name) =>
    getCompDefAccAddress(
      DEPTH_PROGRAM_ID,
      Buffer.from(getCompDefAccOffset(name)).readUInt32LE(),
    ),
  );
  const definitions = await connection.getMultipleAccountsInfo(
    addresses,
    "confirmed",
  );
  return {
    version,
    expiresAt,
    genesisHash: await connection.getGenesisHash(),
    program: DEPTH_PROGRAM_ID.toBase58(),
    programHash: hash(binary.data),
    idlHash: hash(manifestBytes(DEPTH_IDL)),
    mxe: mxeAddress.toBase58(),
    cluster: mxe.cluster,
    settlementMint: market.settlementMint.toBase58(),
    configHash: hash(manifestBytes(market.config)),
    revision: market.revision.toString(),
    definitions: definitions.map((info, index) => {
      if (!info?.owner.equals(arcium.programId))
        throw new Error(`Missing Arcium definition: ${computations[index]}`);
      return {
        name: computations[index],
        address: addresses[index].toBase58(),
        hash: hash(info.data),
      };
    }),
  };
}

export async function verifyDeployment(
  provider: anchor.AnchorProvider,
  policy: DeploymentPolicy,
): Promise<void> {
  if ("localnet" in policy) {
    const url = new URL(provider.connection.rpcEndpoint);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw new Error("Unsigned deployment is restricted to a local RPC");
    return;
  }
  authenticateManifest(policy.manifest, policy.trustedSigner);
  const expected = policy.manifest.payload;
  const actual = await captureDeployment(
    provider,
    expected.version,
    expected.expiresAt,
  );
  if (!manifestBytes(actual).equals(manifestBytes(expected)))
    throw new Error("Signed deployment does not match the connected chain");
}
