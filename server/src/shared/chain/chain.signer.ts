import * as anchor from "@anchor-lang/core";
import {
  getArciumProgram,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getComputationAccAddress,
  getExecutingPoolAccAddress,
  getMempoolAccAddress,
  getMXEAccAddress,
} from "@arcium-hq/client";
import {
  DEPTH_IDL,
  DEPTH_PROGRAM_ID,
  marketAddress,
  protocolAddress,
} from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";

type MxeState = { cluster: number; mxeProgramId: PublicKey };

export class ChainSigner {
  readonly provider: anchor.AnchorProvider;
  readonly program: anchor.Program;
  readonly market = marketAddress();
  readonly protocol = protocolAddress();
  readonly clearing = PublicKey.findProgramAddressSync(
    [Buffer.from("clearing"), this.market.toBuffer()],
    DEPTH_PROGRAM_ID,
  )[0];

  constructor(readonly connection: Connection, readonly wallet: anchor.Wallet) {
    this.provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    this.program = new anchor.Program(DEPTH_IDL, this.provider);
  }

  async read<T>(name: string, address: PublicKey): Promise<T> {
    const info = await this.connection.getAccountInfo(address, "confirmed");
    if (!info || !info.owner.equals(DEPTH_PROGRAM_ID)) {
      throw new Error(`${name} account is unavailable`);
    }
    return this.program.coder.accounts.decode<T>(
      name[0].toLowerCase() + name.slice(1),
      info.data,
    );
  }

  async queue(name: string, offset: anchor.BN) {
    const mxeAddress = getMXEAccAddress(DEPTH_PROGRAM_ID);
    const arcium = getArciumProgram(this.provider) as unknown as {
      account: {
        mxeAccount: { fetch(address: PublicKey): Promise<MxeState> };
      };
    };
    const mxe = await arcium.account.mxeAccount.fetch(mxeAddress);
    if (!mxe.mxeProgramId.equals(DEPTH_PROGRAM_ID)) {
      throw new Error("MXE is registered for another program");
    }
    const definition = getCompDefAccAddress(
      DEPTH_PROGRAM_ID,
      Buffer.from(getCompDefAccOffset(name)).readUInt32LE(),
    );
    if (!(await this.connection.getAccountInfo(definition, "confirmed"))) {
      throw new Error(`${name} computation is not deployed`);
    }
    return {
      computationAccount: getComputationAccAddress(mxe.cluster, offset),
      clusterAccount: getClusterAccAddress(mxe.cluster),
      mxeAccount: mxeAddress,
      mempoolAccount: getMempoolAccAddress(mxe.cluster),
      executingPool: getExecutingPoolAccAddress(mxe.cluster),
      compDefAccount: definition,
    };
  }
}
