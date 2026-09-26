import * as anchor from "@anchor-lang/core";
import {
  awaitComputationFinalization,
  createPacker,
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
import {
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { createHash, randomBytes } from "crypto";
import * as fs from "fs";
import { Depth } from "@/target/types/depth";
import { recoveryKey, recoveryPrivateKey } from "@/tests/keys";

const feed = Buffer.from(
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "hex"
);
const clearingPacker = createPacker<
  {
    insurance: bigint;
    open_interest: bigint;
    protocol_fees: bigint;
    app_fees: bigint;
    salt: bigint;
  },
  {
    insurance: bigint;
    open_interest: bigint;
    protocol_fees: bigint;
    app_fees: bigint;
    salt: bigint;
  }
>([
  { name: "insurance", type: { Integer: { signed: false, width: 64 } } },
  { name: "open_interest", type: { Integer: { signed: false, width: 64 } } },
  { name: "protocol_fees", type: { Integer: { signed: false, width: 64 } } },
  { name: "app_fees", type: { Integer: { signed: false, width: 64 } } },
  { name: "salt", type: { Integer: { signed: false, width: 128 } } },
] as const);

describe("encrypted market clearing", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.Depth as anchor.Program<Depth>;
  const authority = provider.wallet.publicKey;
  const payer = (
    provider.wallet as anchor.Wallet & { payer: anchor.web3.Keypair }
  ).payer;
  const [protocol] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    program.programId
  );
  const [market] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), feed],
    program.programId
  );
  const [clearing] = PublicKey.findProgramAddressSync(
    [Buffer.from("clearing"), market.toBuffer()],
    program.programId
  );

  it("credits real USDC to the encrypted insurance ledger and recovers the draft fund", async () => {
    const mxeAccount = getMXEAccAddress(program.programId);
    const mxe = await getArciumProgram(provider).account.mxeAccount.fetch(
      mxeAccount
    );
    const clusterOffset = getArciumEnv().arciumClusterOffset;
    const definitions = [
      {
        name: "open_clearing",
        init: () => program.methods.initOpenClearingCompDef(),
      },
      {
        name: "credit_insurance",
        init: () => program.methods.initCreditInsuranceCompDef(),
      },
    ];
    const compDefs = new Map<string, PublicKey>();
    for (const definition of definitions) {
      const compDef = getCompDefAccAddress(
        program.programId,
        Buffer.from(getCompDefAccOffset(definition.name)).readUInt32LE()
      );
      compDefs.set(definition.name, compDef);
      await definition
        .init()
        .accountsPartial({
          payer: authority,
          mxeAccount,
          compDefAccount: compDef,
          addressLookupTable: getLookupTableAddress(
            program.programId,
            mxe.lutOffsetSlot
          ),
        })
        .rpc({ skipPreflight: true, commitment: "confirmed" });
      await uploadCircuit(
        provider,
        definition.name,
        program.programId,
        fs.readFileSync(`build/${definition.name}.arcis`),
        true,
        500,
        {
          skipPreflight: true,
          preflightCommitment: "confirmed",
          commitment: "confirmed",
        }
      );
    }
    const queueAccounts = (offset: anchor.BN, name: string) => ({
      computationAccount: getComputationAccAddress(clusterOffset, offset),
      clusterAccount: getClusterAccAddress(clusterOffset),
      mxeAccount,
      mempoolAccount: getMempoolAccAddress(clusterOffset),
      executingPool: getExecutingPoolAccAddress(clusterOffset),
      compDefAccount: compDefs.get(name)!,
    });
    const finalize = (offset: anchor.BN) =>
      awaitComputationFinalization(
        provider,
        offset,
        program.programId,
        "confirmed"
      );
    const openOffset = new anchor.BN(randomBytes(8), "hex");
    await program.methods
      .openClearing(openOffset, Array.from(recoveryKey))
      .accountsPartial({
        ...queueAccounts(openOffset, "open_clearing"),
        authority,
        protocol,
        market,
        clearing,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await finalize(openOffset);
    let state = await program.account.clearingAccount.fetch(clearing);
    expect(state.status).to.deep.equal({ ready: {} });
    expect(state.recoveryKey).to.deep.equal(Array.from(recoveryKey));
    const mxePublicKey = await getMXEPublicKey(provider, program.programId);
    if (!mxePublicKey) throw new Error("MXE public key unavailable");
    const cipher = new RescueCipher(
      x25519.getSharedSecret(recoveryPrivateKey, mxePublicKey)
    );
    const decode = (account: typeof state) =>
      clearingPacker.unpack(
        cipher.decrypt(
          account.recoveryCiphertexts.map((word) => Array.from(word)),
          Uint8Array.from(account.recoveryNonce)
        )
      );
    expect(decode(state).insurance).to.equal(0n);
    expect(decode(state).open_interest).to.equal(0n);

    const protocolState = await program.account.protocol.fetch(protocol);
    const creditedBefore = protocolState.creditedTotal.toNumber();
    const vaultBefore = (
      await getAccount(provider.connection, protocolState.vault)
    ).amount;
    const source = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      protocolState.settlementMint,
      authority
    );
    await mintTo(
      provider.connection,
      payer,
      protocolState.settlementMint,
      source.address,
      payer,
      100_000_000
    );
    const nonce = new anchor.BN(1_000);
    const [receipt] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("deposit"),
        authority.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    await program.methods
      .deposit(nonce, new anchor.BN(100_000_000))
      .accountsPartial({
        owner: authority,
        protocol,
        settlementMint: protocolState.settlementMint,
        source: source.address,
        vault: protocolState.vault,
        receipt,
      })
      .rpc();
    expect(
      (await program.account.protocol.fetch(protocol)).pendingTotal.toNumber()
    ).to.equal(100_000_000);
    const creditOffset = new anchor.BN(randomBytes(8), "hex");
    await program.methods
      .creditInsurance(creditOffset)
      .accountsPartial({
        ...queueAccounts(creditOffset, "credit_insurance"),
        authority,
        protocol,
        market,
        receipt,
        clearing,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await finalize(creditOffset);
    state = await program.account.clearingAccount.fetch(clearing);
    expect(state.status).to.deep.equal({ ready: {} });
    expect(state.version.toNumber()).to.equal(1);
    const values = decode(state);
    expect(values.insurance).to.equal(100_000_000n);
    expect(values.open_interest).to.equal(0n);
    expect(
      (await program.account.depositReceipt.fetch(receipt)).status
    ).to.deep.equal({ credited: {} });
    expect(
      (await program.account.protocol.fetch(protocol)).pendingTotal.toNumber()
    ).to.equal(0);
    expect(
      (await program.account.protocol.fetch(protocol)).creditedTotal.toNumber()
    ).to.equal(creditedBefore + 100_000_000);
    expect(
      (await getAccount(provider.connection, protocolState.vault)).amount
    ).to.equal(vaultBefore + 100_000_000n);

    const preimage = Buffer.alloc(104);
    Buffer.from("depth.clear.v2\0\0").copy(preimage, 0);
    market.toBuffer().copy(preimage, 16);
    preimage.writeBigUInt64LE(1n, 48);
    preimage.writeBigUInt64LE(values.insurance, 56);
    preimage.writeBigUInt64LE(values.open_interest, 64);
    preimage.writeBigUInt64LE(values.protocol_fees, 72);
    preimage.writeBigUInt64LE(values.app_fees, 80);
    for (let index = 0; index < 16; index++) {
      preimage[88 + index] = Number((values.salt >> BigInt(index * 8)) & 255n);
    }
    expect(
      createHash("sha3-256")
        .update(preimage)
        .digest()
        .equals(Buffer.from(state.commitment))
    ).to.equal(true);
    const recoveryAccounts = {
      authority,
      protocol,
      market,
      settlementMint: protocolState.settlementMint,
      vault: protocolState.vault,
      destination: source.address,
      clearing,
    };
    try {
      await program.methods
        .recoverClearing(
          new anchor.BN(100_000_000),
          new anchor.BN((values.salt + 1n).toString())
        )
        .accountsPartial(recoveryAccounts)
        .rpc();
      expect.fail("accepted a false insurance witness");
    } catch (error) {
      if (String(error).includes("accepted a false insurance witness"))
        throw error;
    }
    await program.methods
      .recoverClearing(
        new anchor.BN(100_000_000),
        new anchor.BN(values.salt.toString())
      )
      .accountsPartial(recoveryAccounts)
      .rpc();
    expect(
      await program.account.clearingAccount.fetchNullable(clearing)
    ).to.equal(null);
    expect(
      (await program.account.protocol.fetch(protocol)).creditedTotal.toNumber()
    ).to.equal(creditedBefore);
    expect(
      (await getAccount(provider.connection, protocolState.vault)).amount
    ).to.equal(vaultBefore);
  });
});
