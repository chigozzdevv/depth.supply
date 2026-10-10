import { Buffer } from "buffer";
import * as anchor from "@anchor-lang/core";
import { getMXEPublicKey, RescueCipher, x25519 } from "@arcium-hq/client";
import {
  circuits,
  DEPTH_PROGRAM_ID,
  marketAccountAddress,
  marketAddress,
  recoveryConfigAddress,
} from "@depthhq/bindings";
import { PublicKey } from "@solana/web3.js";
import { createHash, timingSafeEqual } from "node:crypto";
import type {
  ClearingWitness,
  FeeWitness,
  MarketWitness,
} from "@/recovery/winddown";

type RecoveryRecord = {
  recoveryCiphertexts: number[][];
  recoveryNonce: number[];
  commitment: number[];
  version: anchor.BN;
};

function bytes(value: bigint, length: number): Buffer {
  const encoded = Buffer.alloc(length);
  let remaining = BigInt.asUintN(length * 8, value);
  for (let index = 0; index < length; index++) {
    encoded[index] = Number(remaining & 255n);
    remaining >>= 8n;
  }
  return encoded;
}

function verify(preimage: Buffer, commitment: number[]): void {
  const expected = createHash("sha3-256").update(preimage).digest();
  if (
    commitment.length !== 32 ||
    !timingSafeEqual(expected, Buffer.from(commitment))
  )
    throw new Error("Recovery witness does not match its onchain commitment");
}

export class RecoveryWitnessReader {
  private readonly secret: Uint8Array;
  private readonly cipher: RescueCipher;

  private constructor(
    private readonly program: anchor.Program,
    secret: Uint8Array,
    mxePublicKey: Uint8Array,
  ) {
    this.secret = Uint8Array.from(secret);
    this.cipher = new RescueCipher(
      x25519.getSharedSecret(this.secret, mxePublicKey),
    );
  }

  static async create(
    program: anchor.Program,
    secret: Uint8Array,
  ): Promise<RecoveryWitnessReader> {
    if (secret.length !== 32 || !program.programId.equals(DEPTH_PROGRAM_ID))
      throw new RangeError("Recovery key or Depth program is invalid");
    const provider = program.provider as anchor.AnchorProvider;
    const configAddress = recoveryConfigAddress(program.programId);
    const info = await provider.connection.getAccountInfo(
      configAddress,
      "confirmed",
    );
    if (!info?.owner.equals(program.programId))
      throw new Error("Recovery configuration is unavailable");
    const config = program.coder.accounts.decode<{
      market: PublicKey;
      recoveryKey: number[];
    }>("recoveryConfig", info.data);
    if (
      !config.market.equals(marketAddress(program.programId)) ||
      !timingSafeEqual(
        Buffer.from(config.recoveryKey),
        Buffer.from(x25519.getPublicKey(secret)),
      )
    )
      throw new Error("Reconstructed key does not belong to this market");
    const mxePublicKey = await getMXEPublicKey(provider, program.programId);
    if (!mxePublicKey) throw new Error("Depth MXE public key is unavailable");
    return new RecoveryWitnessReader(program, secret, mxePublicKey);
  }

  private async read<T>(name: string, address: PublicKey): Promise<T> {
    const provider = this.program.provider as anchor.AnchorProvider;
    const info = await provider.connection.getAccountInfo(address, "confirmed");
    if (!info?.owner.equals(this.program.programId))
      throw new Error(`${name} is unavailable`);
    return this.program.coder.accounts.decode<T>(
      name[0].toLowerCase() + name.slice(1),
      info.data,
    );
  }

  private decrypt(record: RecoveryRecord): bigint[] {
    return this.cipher.decrypt(
      record.recoveryCiphertexts.map((word) => Array.from(word)),
      Uint8Array.from(record.recoveryNonce),
    );
  }

  async clearing(): Promise<ClearingWitness> {
    const market = marketAddress(this.program.programId);
    const address = PublicKey.findProgramAddressSync(
      [Buffer.from("clearing"), market.toBuffer()],
      this.program.programId,
    )[0];
    const record = await this.read<RecoveryRecord & { market: PublicKey }>(
      "ClearingAccount",
      address,
    );
    if (!record.market.equals(market)) throw new Error("Wrong clearing market");
    const state = circuits.ClearingState.unpack(this.decrypt(record));
    const preimage = Buffer.concat([
      Buffer.from("depth.clear.v2\0\0"),
      market.toBuffer(),
      bytes(BigInt(record.version.toString()), 8),
      bytes(state.insurance, 8),
      bytes(state.open_interest, 8),
      bytes(state.protocol_fees, 8),
      bytes(state.app_fees, 8),
      bytes(state.salt, 16),
    ]);
    verify(preimage, record.commitment);
    return {
      insurance: state.insurance,
      openInterest: state.open_interest,
      protocolFees: state.protocol_fees,
      appFees: state.app_fees,
      salt: state.salt,
    };
  }

  async market(owner: PublicKey): Promise<MarketWitness> {
    const address = marketAccountAddress(owner, this.program.programId);
    const record = await this.read<
      RecoveryRecord & {
        owner: PublicKey;
        market: PublicKey;
      }
    >("MarketAccount", address);
    if (
      !record.owner.equals(owner) ||
      !record.market.equals(marketAddress(this.program.programId))
    )
      throw new Error("Wrong market account owner");
    const words = this.decrypt(record);
    if (words.length !== 3)
      throw new Error("Invalid market recovery ciphertext");
    const mask64 = (1n << 64n) - 1n;
    const mask128 = (1n << 128n) - 1n;
    const witness: MarketWitness = {
      collateral: (words[0] >> 128n) & mask64,
      reserved: (words[1] >> 128n) & mask64,
      position: (words[2] & mask64) - (1n << 63n),
      entryPrice: (words[2] >> 64n) & mask64,
      fundingCheckpoint: (words[0] & mask128) - (1n << 127n),
      salt: words[1] & mask128,
    };
    const preimage = Buffer.concat([
      Buffer.from("depth.market.v1\0"),
      address.toBuffer(),
      bytes(BigInt(record.version.toString()), 8),
      bytes(witness.collateral, 8),
      bytes(witness.reserved, 8),
      bytes(witness.position, 8),
      bytes(witness.entryPrice, 8),
      bytes(witness.fundingCheckpoint, 16),
      bytes(witness.salt, 16),
    ]);
    verify(preimage, record.commitment);
    return witness;
  }

  async fee(order: PublicKey): Promise<FeeWitness> {
    const address = PublicKey.findProgramAddressSync(
      [Buffer.from("fee-recovery"), order.toBuffer()],
      this.program.programId,
    )[0];
    const record = await this.read<{
      order: PublicKey;
      recoveryKey: number[];
      ciphertexts: number[][];
      nonce: number[];
      commitment: number[];
    }>("FeeRecoveryRecord", address);
    if (!record.order.equals(order))
      throw new Error("Wrong fee recovery order");
    if (
      !timingSafeEqual(
        Buffer.from(record.recoveryKey),
        Buffer.from(x25519.getPublicKey(this.secret)),
      )
    )
      throw new Error("Fee receipt has another recovery key");
    const values = this.cipher.decrypt(
      record.ciphertexts.map((word) => Array.from(word)),
      Uint8Array.from(record.nonce),
    );
    if (values.length !== 3) throw new Error("Invalid fee recovery ciphertext");
    const [protocolFee, appFee, salt] = values;
    verify(
      Buffer.concat([
        Buffer.from("depth.fees.v1\0\0\0"),
        order.toBuffer(),
        bytes(protocolFee, 8),
        bytes(appFee, 8),
        bytes(salt, 16),
      ]),
      record.commitment,
    );
    return { protocolFee, appFee, salt };
  }

  destroy(): void {
    this.secret.fill(0);
  }
}
