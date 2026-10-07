import * as anchor from "@anchor-lang/core";
import {
  awaitComputationFinalization,
  getArciumAccountBaseSeed,
  getArciumEnv,
  getArciumProgram,
  getArciumProgramId,
  getClusterAccAddress,
  getCompDefAccOffset,
  getCompDefAccAddress,
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
import {
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";
import { createHash, randomBytes } from "crypto";
import * as fs from "fs";
import { Depth } from "@/target/types/depth";
import { unpackMarket } from "@/tests/support/packing";
import { recoveryKey, recoveryPrivateKey } from "@/tests/keys";
import { exerciseQuote } from "@/tests/support/quote";

describe("private balances", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.Depth as anchor.Program<Depth>;
  const owner = provider.wallet.publicKey;
  const payer = (
    provider.wallet as anchor.Wallet & { payer: anchor.web3.Keypair }
  ).payer;
  const keeper = anchor.web3.Keypair.generate();
  const arciumEnv = getArciumEnv();
  const [protocol] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    program.programId
  );
  const [balance] = PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), owner.toBuffer()],
    program.programId
  );

  it("opens a ciphertext-only account with an independently decryptable recovery copy", async () => {
    const keeperAirdrop = await provider.connection.requestAirdrop(
      keeper.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(keeperAirdrop, "confirmed");
    const compDefOffset = getCompDefAccOffset("open_balance");
    const compDefAccount = PublicKey.findProgramAddressSync(
      [
        getArciumAccountBaseSeed("ComputationDefinitionAccount"),
        program.programId.toBuffer(),
        compDefOffset,
      ],
      getArciumProgramId()
    )[0];
    const mxeAccount = getMXEAccAddress(program.programId);
    const mxe = await getArciumProgram(provider).account.mxeAccount.fetch(
      mxeAccount
    );
    await program.methods
      .initOpenBalanceCompDef()
      .accountsPartial({
        payer: owner,
        mxeAccount,
        compDefAccount,
        addressLookupTable: getLookupTableAddress(
          program.programId,
          mxe.lutOffsetSlot
        ),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await uploadCircuit(
      provider,
      "open_balance",
      program.programId,
      fs.readFileSync("build/open_balance.arcis"),
      true,
      500,
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        commitment: "confirmed",
      }
    );

    const offset = new anchor.BN(randomBytes(8), "hex");
    const computationAccount = getComputationAccAddress(
      arciumEnv.arciumClusterOffset,
      offset
    );
    const accounts = {
      payer: owner,
      protocol,
      balance,
      computationAccount,
      clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
      mxeAccount,
      mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
      executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
      compDefAccount: getCompDefAccAddress(
        program.programId,
        Buffer.from(compDefOffset).readUInt32LE()
      ),
    };
    await program.methods
      .openBalance(offset, Array.from(recoveryKey))
      .accountsPartial(accounts)
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(
      provider,
      offset,
      program.programId,
      "confirmed"
    );

    const state = await program.account.balanceAccount.fetch(balance);
    expect(state.status).to.deep.equal({ ready: {} });
    expect(state.version.toNumber()).to.equal(0);
    expect(state.owner.equals(owner)).to.equal(true);
    expect(state.commitment).not.to.deep.equal(Array(32).fill(0));
    expect(state.recoveryKey).to.deep.equal(Array.from(recoveryKey));

    const mxePublicKey = await getMXEPublicKey(provider, program.programId);
    if (!mxePublicKey) throw new Error("MXE public key unavailable");
    const cipher = new RescueCipher(
      x25519.getSharedSecret(recoveryPrivateKey, mxePublicKey)
    );
    const [amount, salt] = cipher.decrypt(
      state.recoveryCiphertexts.map((item) => Array.from(item)),
      Uint8Array.from(state.recoveryNonce)
    );
    expect(amount).to.equal(0n);

    const preimage = Buffer.alloc(80);
    Buffer.from("depth.balance.v1").copy(preimage, 0);
    owner.toBuffer().copy(preimage, 16);
    preimage.writeBigUInt64LE(0n, 48);
    preimage.writeBigUInt64LE(amount, 56);
    for (let i = 0; i < 16; i++) {
      preimage[64 + i] = Number((salt >> BigInt(i * 8)) & 255n);
    }
    expect(
      Buffer.from(state.commitment).equals(
        createHash("sha3-256").update(preimage).digest()
      )
    ).to.equal(true);

    try {
      await program.methods
        .openBalance(
          new anchor.BN(randomBytes(8), "hex"),
          Array.from(recoveryKey)
        )
        .accountsPartial(accounts)
        .rpc();
      expect.fail("opened the same balance twice");
    } catch (error) {
      if (String(error).includes("opened the same balance twice")) throw error;
    }

    const protocolState = await program.account.protocol.fetch(protocol);
    const source = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      protocolState.settlementMint,
      owner
    );
    const sourceBefore = (await getAccount(provider.connection, source.address))
      .amount;
    await mintTo(
      provider.connection,
      payer,
      protocolState.settlementMint,
      source.address,
      payer,
      400_000
    );
    const depositNonce = new anchor.BN(99);
    const [receipt] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("deposit"),
        owner.toBuffer(),
        depositNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    await program.methods
      .deposit(depositNonce, new anchor.BN(400_000))
      .accountsPartial({
        owner,
        protocol,
        settlementMint: protocolState.settlementMint,
        source: source.address,
        vault: protocolState.vault,
        receipt,
      })
      .rpc();

    const creditCompDefOffset = getCompDefAccOffset("credit_balance");
    const creditCompDefAccount = getCompDefAccAddress(
      program.programId,
      Buffer.from(creditCompDefOffset).readUInt32LE()
    );
    await program.methods
      .initCreditBalanceCompDef()
      .accountsPartial({
        payer: owner,
        mxeAccount,
        compDefAccount: creditCompDefAccount,
        addressLookupTable: getLookupTableAddress(
          program.programId,
          mxe.lutOffsetSlot
        ),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await uploadCircuit(
      provider,
      "credit_balance",
      program.programId,
      fs.readFileSync("build/credit_balance.arcis"),
      true,
      500,
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        commitment: "confirmed",
      }
    );

    const creditOffset = new anchor.BN(randomBytes(8), "hex");
    await program.methods
      .creditDeposit(creditOffset)
      .accountsPartial({
        payer: keeper.publicKey,
        protocol,
        receipt,
        balance,
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          creditOffset
        ),
        clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
        mxeAccount,
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(
          arciumEnv.arciumClusterOffset
        ),
        compDefAccount: creditCompDefAccount,
      })
      .signers([keeper])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(
      provider,
      creditOffset,
      program.programId,
      "confirmed"
    );

    const credited = await program.account.balanceAccount.fetch(balance);
    const creditedReceipt = await program.account.depositReceipt.fetch(receipt);
    const creditedProtocol = await program.account.protocol.fetch(protocol);
    expect(credited.status).to.deep.equal({ ready: {} });
    expect(credited.version.toNumber()).to.equal(1);
    expect(creditedReceipt.status).to.deep.equal({ credited: {} });
    expect(creditedProtocol.pendingTotal.toNumber()).to.equal(0);
    expect(creditedProtocol.creditedTotal.toNumber()).to.equal(400_000);
    expect(
      (await getAccount(provider.connection, protocolState.vault)).amount
    ).to.equal(400_000n);
    const [creditedAmount, creditedSalt] = cipher.decrypt(
      credited.recoveryCiphertexts.map((item) => Array.from(item)),
      Uint8Array.from(credited.recoveryNonce)
    );
    expect(creditedAmount).to.equal(400_000n);
    preimage.writeBigUInt64LE(1n, 48);
    preimage.writeBigUInt64LE(creditedAmount, 56);
    for (let i = 0; i < 16; i++) {
      preimage[64 + i] = Number((creditedSalt >> BigInt(i * 8)) & 255n);
    }
    expect(
      Buffer.from(credited.commitment).equals(
        createHash("sha3-256").update(preimage).digest()
      )
    ).to.equal(true);

    try {
      await program.methods
        .refundDeposit()
        .accountsPartial({
          owner,
          protocol,
          settlementMint: protocolState.settlementMint,
          vault: protocolState.vault,
          destination: source.address,
          receipt,
        })
        .rpc();
      expect.fail("refunded an already credited deposit");
    } catch (error) {
      if (String(error).includes("refunded an already credited deposit"))
        throw error;
    }

    const debitCompDefOffset = getCompDefAccOffset("debit_balance");
    const debitCompDefAccount = getCompDefAccAddress(
      program.programId,
      Buffer.from(debitCompDefOffset).readUInt32LE()
    );
    await program.methods
      .initDebitBalanceCompDef()
      .accountsPartial({
        payer: owner,
        mxeAccount,
        compDefAccount: debitCompDefAccount,
        addressLookupTable: getLookupTableAddress(
          program.programId,
          mxe.lutOffsetSlot
        ),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await uploadCircuit(
      provider,
      "debit_balance",
      program.programId,
      fs.readFileSync("build/debit_balance.arcis"),
      true,
      500,
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        commitment: "confirmed",
      }
    );

    const debitOffset = new anchor.BN(randomBytes(8), "hex");
    const withdrawalNonce = new anchor.BN(751);
    const [withdrawal] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("withdrawal"),
        balance.toBuffer(),
        withdrawalNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    await program.methods
      .requestWithdrawal(debitOffset, withdrawalNonce, new anchor.BN(125_000))
      .accountsPartial({
        receipt: withdrawal,
        payer: owner,
        protocol,
        destination: source.address,
        balance,
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          debitOffset
        ),
        clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
        mxeAccount,
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(
          arciumEnv.arciumClusterOffset
        ),
        compDefAccount: debitCompDefAccount,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(
      provider,
      debitOffset,
      program.programId,
      "confirmed"
    );

    const withdrawalReceipt = await program.account.withdrawalReceipt.fetch(
      withdrawal
    );
    expect(withdrawalReceipt.status).to.deep.equal({ paid: {} });
    expect(withdrawalReceipt.amount.toNumber()).to.equal(125_000);
    expect(withdrawalReceipt.nonce.toNumber()).to.equal(751);
    expect(
      withdrawalReceipt.computation.equals(
        getComputationAccAddress(arciumEnv.arciumClusterOffset, debitOffset)
      )
    ).to.equal(true);
    expect(withdrawalReceipt.destination.equals(source.address)).to.equal(true);
    const withdrawn = await program.account.balanceAccount.fetch(balance);
    expect(withdrawn.status).to.deep.equal({ ready: {} });
    expect(withdrawn.version.toNumber()).to.equal(2);
    expect(
      (await program.account.protocol.fetch(protocol)).creditedTotal.toNumber()
    ).to.equal(275_000);

    expect(
      (await getAccount(provider.connection, source.address)).amount
    ).to.equal(sourceBefore + 125_000n);
    expect(
      (await getAccount(provider.connection, protocolState.vault)).amount
    ).to.equal(275_000n);
    let [remaining, remainingSalt] = cipher.decrypt(
      withdrawn.recoveryCiphertexts.map((item) => Array.from(item)),
      Uint8Array.from(withdrawn.recoveryNonce)
    );
    expect(remaining).to.equal(275_000n);

    const viewCompDefOffset = getCompDefAccOffset("view_balance");
    const viewCompDefAccount = getCompDefAccAddress(
      program.programId,
      Buffer.from(viewCompDefOffset).readUInt32LE()
    );
    await program.methods
      .initViewBalanceCompDef()
      .accountsPartial({
        payer: owner,
        mxeAccount,
        compDefAccount: viewCompDefAccount,
        addressLookupTable: getLookupTableAddress(
          program.programId,
          mxe.lutOffsetSlot
        ),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await uploadCircuit(
      provider,
      "view_balance",
      program.programId,
      fs.readFileSync("build/view_balance.arcis"),
      true,
      500,
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        commitment: "confirmed",
      }
    );

    const viewPrivateKey = x25519.utils.randomSecretKey();
    const viewKey = x25519.getPublicKey(viewPrivateKey);
    const viewNonce = new anchor.BN(100);
    const [view] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("view"),
        owner.toBuffer(),
        viewNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const viewOffset = new anchor.BN(randomBytes(8), "hex");
    await program.methods
      .requestBalanceView(viewOffset, viewNonce, Array.from(viewKey))
      .accountsPartial({
        payer: owner,
        balance,
        view,
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          viewOffset
        ),
        clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
        mxeAccount,
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(
          arciumEnv.arciumClusterOffset
        ),
        compDefAccount: viewCompDefAccount,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(
      provider,
      viewOffset,
      program.programId,
      "confirmed"
    );
    const viewState = await program.account.balanceView.fetch(view);
    expect(viewState.status).to.deep.equal({ ready: {} });
    expect(viewState.version.toNumber()).to.equal(2);
    const viewCipher = new RescueCipher(
      x25519.getSharedSecret(viewPrivateKey, mxePublicKey)
    );
    expect(
      viewCipher.decrypt(
        [Array.from(viewState.ciphertext)],
        Uint8Array.from(viewState.outputNonce)
      )[0]
    ).to.equal(275_000n);
    await program.methods
      .closeBalanceView()
      .accountsPartial({ owner, view })
      .rpc();
    expect(await program.account.balanceView.fetchNullable(view)).to.equal(
      null
    );

    const marketId = Buffer.from(
      "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
      "hex"
    );
    const [market] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketId],
      program.programId
    );
    const [marketAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("market-account"), market.toBuffer(), owner.toBuffer()],
      program.programId
    );
    const openMarketOffset = getCompDefAccOffset("open_market");
    const openMarketCompDef = getCompDefAccAddress(
      program.programId,
      Buffer.from(openMarketOffset).readUInt32LE()
    );
    await program.methods
      .initOpenMarketCompDef()
      .accountsPartial({
        payer: owner,
        mxeAccount,
        compDefAccount: openMarketCompDef,
        addressLookupTable: getLookupTableAddress(
          program.programId,
          mxe.lutOffsetSlot
        ),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await uploadCircuit(
      provider,
      "open_market",
      program.programId,
      fs.readFileSync("build/open_market.arcis"),
      true,
      500,
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        commitment: "confirmed",
      }
    );
    const openMarketComputation = new anchor.BN(randomBytes(8), "hex");
    await program.methods
      .openMarketAccount(openMarketComputation, Array.from(recoveryKey))
      .accountsPartial({
        payer: owner,
        protocol,
        market,
        marketAccount,
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          openMarketComputation
        ),
        clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
        mxeAccount,
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(
          arciumEnv.arciumClusterOffset
        ),
        compDefAccount: openMarketCompDef,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(
      provider,
      openMarketComputation,
      program.programId,
      "confirmed"
    );
    let marginState = await program.account.marketAccount.fetch(marketAccount);
    expect(marginState.status).to.deep.equal({ ready: {} });
    expect(marginState.version.toNumber()).to.equal(0);
    expect(
      (
        await unpackMarket(
          cipher.decrypt(
            marginState.recoveryCiphertexts.map((item) => Array.from(item)),
            Uint8Array.from(marginState.recoveryNonce)
          )
        )
      ).collateral
    ).to.equal(0n);

    const initAccounts = (compDefAccount: PublicKey) => ({
      payer: owner,
      mxeAccount,
      compDefAccount,
      addressLookupTable: getLookupTableAddress(
        program.programId,
        mxe.lutOffsetSlot
      ),
    });
    const definitions = [
      {
        name: "debit_free",
        init: (address: PublicKey) =>
          program.methods
            .initDebitFreeCompDef()
            .accountsPartial(initAccounts(address))
            .rpc({ skipPreflight: true, commitment: "confirmed" }),
      },
      {
        name: "credit_market",
        init: (address: PublicKey) =>
          program.methods
            .initCreditMarketCompDef()
            .accountsPartial(initAccounts(address))
            .rpc({ skipPreflight: true, commitment: "confirmed" }),
      },
      {
        name: "debit_market_v2",
        init: (address: PublicKey) =>
          program.methods
            .initDebitMarketCompDef()
            .accountsPartial(initAccounts(address))
            .rpc({ skipPreflight: true, commitment: "confirmed" }),
      },
      {
        name: "credit_free",
        init: (address: PublicKey) =>
          program.methods
            .initCreditFreeCompDef()
            .accountsPartial(initAccounts(address))
            .rpc({ skipPreflight: true, commitment: "confirmed" }),
      },
    ];
    const compDefs = new Map<string, PublicKey>();
    for (const definition of definitions) {
      const offset = getCompDefAccOffset(definition.name);
      const address = getCompDefAccAddress(
        program.programId,
        Buffer.from(offset).readUInt32LE()
      );
      compDefs.set(definition.name, address);
      await definition.init(address);
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
      computationAccount: getComputationAccAddress(
        arciumEnv.arciumClusterOffset,
        offset
      ),
      clusterAccount: getClusterAccAddress(arciumEnv.arciumClusterOffset),
      mxeAccount,
      mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
      executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
      compDefAccount: compDefs.get(name)!,
    });
    const transferAddress = (nonce: number) =>
      PublicKey.findProgramAddressSync(
        [
          Buffer.from("margin-transfer"),
          owner.toBuffer(),
          new anchor.BN(nonce).toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      )[0];
    const allocation = transferAddress(101);
    const allocateOffset = new anchor.BN(randomBytes(8), "hex");
    await program.methods
      .beginAllocation(
        allocateOffset,
        new anchor.BN(101),
        new anchor.BN(100_000)
      )
      .accountsPartial({
        ...queueAccounts(allocateOffset, "debit_free"),
        payer: owner,
        protocol,
        market,
        balance,
        transfer: allocation,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(
      provider,
      allocateOffset,
      program.programId,
      "confirmed"
    );
    const allocated = await program.account.balanceAccount.fetch(balance);
    marginState = await program.account.marketAccount.fetch(marketAccount);
    expect(allocated.status).to.deep.equal({ ready: {} });
    expect(marginState.status).to.deep.equal({ ready: {} });
    expect(
      (await program.account.marginTransfer.fetch(allocation)).status
    ).to.deep.equal({ escrow: {} });
    expect(
      (await program.account.protocol.fetch(protocol)).escrowTotal.toNumber()
    ).to.equal(100_000);
    expect(
      cipher.decrypt(
        allocated.recoveryCiphertexts.map((item) => Array.from(item)),
        Uint8Array.from(allocated.recoveryNonce)
      )[0]
    ).to.equal(175_000n);
    const settleAllocationOffset = new anchor.BN(randomBytes(8), "hex");
    await program.methods
      .settleAllocation(settleAllocationOffset)
      .accountsPartial({
        ...queueAccounts(settleAllocationOffset, "credit_market"),
        payer: keeper.publicKey,
        protocol,
        market,
        transfer: allocation,
        marketAccount,
      })
      .signers([keeper])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(
      provider,
      settleAllocationOffset,
      program.programId,
      "confirmed"
    );
    marginState = await program.account.marketAccount.fetch(marketAccount);
    expect(
      (
        await unpackMarket(
          cipher.decrypt(
            marginState.recoveryCiphertexts.map((item) => Array.from(item)),
            Uint8Array.from(marginState.recoveryNonce)
          )
        )
      ).collateral
    ).to.equal(100_000n);
    expect(
      (await program.account.marginTransfer.fetch(allocation)).status
    ).to.deep.equal({ settled: {} });
    expect(
      (await program.account.protocol.fetch(protocol)).escrowTotal.toNumber()
    ).to.equal(0);
    expect(
      (await program.account.protocol.fetch(protocol)).creditedTotal.toNumber()
    ).to.equal(275_000);

    await exerciseQuote(provider, program, protocol, market, marketAccount);

    const release = transferAddress(102);
    const releaseOffset = new anchor.BN(randomBytes(8), "hex");
    await program.methods
      .beginRelease(releaseOffset, new anchor.BN(102), new anchor.BN(40_000))
      .accountsPartial({
        ...queueAccounts(releaseOffset, "debit_market_v2"),
        payer: owner,
        protocol,
        market,
        marketAccount,
        transfer: release,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(
      provider,
      releaseOffset,
      program.programId,
      "confirmed"
    );
    expect(
      (await program.account.marginTransfer.fetch(release)).status
    ).to.deep.equal({ escrow: {} });
    const settleReleaseOffset = new anchor.BN(randomBytes(8), "hex");
    await program.methods
      .settleRelease(settleReleaseOffset)
      .accountsPartial({
        ...queueAccounts(settleReleaseOffset, "credit_free"),
        payer: keeper.publicKey,
        protocol,
        transfer: release,
        balance,
      })
      .signers([keeper])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(
      provider,
      settleReleaseOffset,
      program.programId,
      "confirmed"
    );
    expect(
      (await program.account.marginTransfer.fetch(release)).status
    ).to.deep.equal({ settled: {} });
    expect(
      (await program.account.protocol.fetch(protocol)).escrowTotal.toNumber()
    ).to.equal(0);
    marginState = await program.account.marketAccount.fetch(marketAccount);
    const marginValues = await unpackMarket(
      cipher.decrypt(
        marginState.recoveryCiphertexts.map((item) => Array.from(item)),
        Uint8Array.from(marginState.recoveryNonce)
      )
    );
    expect(marginValues.collateral).to.equal(60_000n);
    expect(marginValues.reserved).to.equal(0n);
    expect(marginValues.position).to.equal(0n);
    expect(marginValues.entry_price).to.equal(0n);
    expect(marginValues.funding_checkpoint).to.equal(0n);
    expect(marginState.version.toNumber()).to.equal(4);

    const refundTransfer = transferAddress(103);
    const refundOffset = new anchor.BN(randomBytes(8), "hex");
    await program.methods
      .beginAllocation(refundOffset, new anchor.BN(103), new anchor.BN(10_000))
      .accountsPartial({
        ...queueAccounts(refundOffset, "debit_free"),
        payer: owner,
        protocol,
        market,
        balance,
        transfer: refundTransfer,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(
      provider,
      refundOffset,
      program.programId,
      "confirmed"
    );
    expect(
      (await program.account.marginTransfer.fetch(refundTransfer)).status
    ).to.deep.equal({ escrow: {} });
    await program.methods
      .refundEscrow()
      .accountsPartial({
        owner,
        protocol,
        settlementMint: protocolState.settlementMint,
        vault: protocolState.vault,
        destination: source.address,
        transfer: refundTransfer,
      })
      .rpc();
    expect(
      (await program.account.marginTransfer.fetch(refundTransfer)).status
    ).to.deep.equal({ refunded: {} });
    expect(
      (await program.account.protocol.fetch(protocol)).escrowTotal.toNumber()
    ).to.equal(0);
    expect(
      (await program.account.protocol.fetch(protocol)).creditedTotal.toNumber()
    ).to.equal(265_000);
    const marketRecoveryAccounts = {
      owner,
      protocol,
      settlementMint: protocolState.settlementMint,
      vault: protocolState.vault,
      destination: source.address,
      marketAccount,
    };
    const marketWitness = (
      salt: bigint
    ): [anchor.BN, anchor.BN, anchor.BN, anchor.BN, anchor.BN, anchor.BN] =>
      [
        marginValues.collateral,
        marginValues.reserved,
        marginValues.position,
        marginValues.entry_price,
        marginValues.funding_checkpoint,
        salt,
      ].map((value) => new anchor.BN(value.toString())) as [
        anchor.BN,
        anchor.BN,
        anchor.BN,
        anchor.BN,
        anchor.BN,
        anchor.BN
      ];
    try {
      await program.methods
        .recoverMarket(...marketWitness(marginValues.salt + 1n))
        .accountsPartial(marketRecoveryAccounts)
        .rpc();
      expect.fail("accepted the wrong market witness");
    } catch (error) {
      if (String(error).includes("accepted the wrong market witness"))
        throw error;
    }
    await program.methods
      .recoverMarket(...marketWitness(marginValues.salt))
      .accountsPartial(marketRecoveryAccounts)
      .rpc();
    expect(
      await program.account.marketAccount.fetchNullable(marketAccount)
    ).to.equal(null);
    expect(
      (await program.account.protocol.fetch(protocol)).creditedTotal.toNumber()
    ).to.equal(205_000);
    [remaining, remainingSalt] = cipher.decrypt(
      (
        await program.account.balanceAccount.fetch(balance)
      ).recoveryCiphertexts.map((item) => Array.from(item)),
      Uint8Array.from(
        (await program.account.balanceAccount.fetch(balance)).recoveryNonce
      )
    );
    expect(remaining).to.equal(205_000n);

    const recoveryAccounts = {
      owner,
      protocol,
      settlementMint: protocolState.settlementMint,
      vault: protocolState.vault,
      destination: source.address,
      balance,
    };
    try {
      await program.methods
        .recoverBalance(
          new anchor.BN(remaining.toString()),
          new anchor.BN((remainingSalt + 1n).toString())
        )
        .accountsPartial(recoveryAccounts)
        .rpc();
      expect.fail("accepted the wrong recovery witness");
    } catch (error) {
      if (String(error).includes("accepted the wrong recovery witness"))
        throw error;
    }
    expect(
      await program.account.balanceAccount.fetchNullable(balance)
    ).not.to.equal(null);
    await program.methods
      .recoverBalance(
        new anchor.BN(remaining.toString()),
        new anchor.BN(remainingSalt.toString())
      )
      .accountsPartial(recoveryAccounts)
      .rpc();
    expect(
      await program.account.balanceAccount.fetchNullable(balance)
    ).to.equal(null);
    expect(
      (await program.account.protocol.fetch(protocol)).creditedTotal.toNumber()
    ).to.equal(0);
    expect(
      (await getAccount(provider.connection, protocolState.vault)).amount
    ).to.equal(0n);
    expect(
      (await getAccount(provider.connection, source.address)).amount
    ).to.equal(sourceBefore + 400_000n);
  });
});
