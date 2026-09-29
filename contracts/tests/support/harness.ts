import * as anchor from "@anchor-lang/core";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getArciumProgram,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getLookupTableAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
  getMXEPublicKey,
  RescueCipher,
  uploadCircuit,
  x25519,
} from "@arcium-hq/client";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "crypto";
import * as fs from "fs";
import { Depth } from "@/target/types/depth";

export class Harness {
  readonly mxeAccount: PublicKey;
  readonly clusterOffset: number;
  readonly definitions = new Map<string, PublicKey>();

  private constructor(
    readonly provider: anchor.AnchorProvider,
    readonly program: anchor.Program<Depth>,
    readonly lookupTable: PublicKey,
    readonly mxePublicKey: Uint8Array
  ) {
    this.mxeAccount = getMXEAccAddress(program.programId);
    this.clusterOffset = getArciumEnv().arciumClusterOffset;
  }

  static async create(
    provider: anchor.AnchorProvider,
    program: anchor.Program<Depth>
  ) {
    const mxeAccount = getMXEAccAddress(program.programId);
    const mxe = await getArciumProgram(provider).account.mxeAccount.fetch(
      mxeAccount
    );
    let publicKey = await getMXEPublicKey(provider, program.programId);
    for (let attempt = 0; !publicKey && attempt < 60; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      publicKey = await getMXEPublicKey(provider, program.programId);
    }
    if (!publicKey) throw new Error("MXE public key unavailable");
    return new Harness(
      provider,
      program,
      getLookupTableAddress(program.programId, mxe.lutOffsetSlot),
      publicKey
    );
  }

  async init(
    name: string,
    payer: PublicKey,
    call: (accounts: {
      payer: PublicKey;
      mxeAccount: PublicKey;
      compDefAccount: PublicKey;
      addressLookupTable: PublicKey;
    }) => Promise<unknown>
  ) {
    const address = getCompDefAccAddress(
      this.program.programId,
      Buffer.from(getCompDefAccOffset(name)).readUInt32LE()
    );
    try {
      await call({
        payer,
        mxeAccount: this.mxeAccount,
        compDefAccount: address,
        addressLookupTable: this.lookupTable,
      });
    } catch (error) {
      console.error(error);
      if (
        error instanceof Error &&
        "getLogs" in error &&
        typeof error.getLogs === "function"
      ) {
        try {
          console.error(await error.getLogs(this.provider.connection));
        } catch {}
      }
      throw new Error(`Failed to initialize ${name}: ${String(error)}`);
    }
    await uploadCircuit(
      this.provider,
      name,
      this.program.programId,
      fs.readFileSync(`build/${name}.arcis`),
      true,
      500,
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        commitment: "confirmed",
      }
    );
    this.definitions.set(name, address);
  }

  offset() {
    return new anchor.BN(randomBytes(8), "hex");
  }

  queue(offset: anchor.BN, name: string) {
    const compDefAccount = this.definitions.get(name);
    if (!compDefAccount) throw new Error(`Circuit ${name} is not initialized`);
    return {
      computationAccount: getComputationAccAddress(this.clusterOffset, offset),
      clusterAccount: getClusterAccAddress(this.clusterOffset),
      mxeAccount: this.mxeAccount,
      mempoolAccount: getMempoolAccAddress(this.clusterOffset),
      executingPool: getExecutingPoolAccAddress(this.clusterOffset),
      compDefAccount,
    };
  }

  finalize(offset: anchor.BN) {
    return awaitComputationFinalization(
      this.provider,
      offset,
      this.program.programId,
      "confirmed"
    );
  }

  encrypt(values: bigint[]) {
    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    const nonce = randomBytes(16);
    const cipher = new RescueCipher(
      x25519.getSharedSecret(privateKey, this.mxePublicKey)
    );
    return {
      ciphertexts: cipher.encrypt(values, nonce),
      inputKey: Array.from(publicKey),
      inputNonce: new anchor.BN(nonce, "le"),
    };
  }
}
