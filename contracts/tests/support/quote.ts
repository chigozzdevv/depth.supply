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
import { expect } from "chai";
import { randomBytes } from "crypto";
import * as fs from "fs";
import { Depth } from "@/target/types/depth";
import { unpackMarket } from "@/tests/support/packing";
import { recoveryPrivateKey } from "@/tests/keys";

const oracle = new PublicKey("3RW84c8AwWtLCVyETK2Xtruo9YsgFnMMt6uW2cDN4mzV");

export async function exerciseQuote(
  provider: anchor.AnchorProvider,
  program: anchor.Program<Depth>,
  protocol: PublicKey,
  market: PublicKey,
  marketAccount: PublicKey
) {
  const owner = provider.wallet.publicKey;
  const mxeAccount = getMXEAccAddress(program.programId);
  const mxe = await getArciumProgram(provider).account.mxeAccount.fetch(
    mxeAccount
  );
  const clusterOffset = getArciumEnv().arciumClusterOffset;
  const definitions = [
    {
      name: "prepare_quote",
      init: () => program.methods.initPrepareQuoteCompDef(),
    },
    {
      name: "reserve_quote",
      init: () => program.methods.initReserveQuoteCompDef(),
    },
    {
      name: "release_quote",
      init: () => program.methods.initReleaseQuoteCompDef(),
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
        payer: owner,
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

  await program.methods
    .refreshOracle()
    .accountsPartial({ market, priceUpdate: oracle })
    .rpc();
  const marked = await program.account.market.fetch(market);
  expect(marked.oraclePriceE8.toString()).to.equal("20000000000");

  const mxePublicKey = await getMXEPublicKey(provider, program.programId);
  if (!mxePublicKey) throw new Error("MXE public key unavailable");
  const inputPrivateKey = x25519.utils.randomSecretKey();
  const inputPublicKey = x25519.getPublicKey(inputPrivateKey);
  const cipher = new RescueCipher(
    x25519.getSharedSecret(inputPrivateKey, mxePublicKey)
  );
  const inputNonceBytes = randomBytes(16);
  const ciphertexts = cipher.encrypt(
    [19_900_000_000n, 0n, 0n, 0n, 20_100_000_000n, 0n, 0n, 0n],
    inputNonceBytes
  );
  const quoteNonce = new anchor.BN(77);
  const [quote] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("quote"),
      market.toBuffer(),
      owner.toBuffer(),
      quoteNonce.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );
  const expiry = Math.floor(Date.now() / 1000) + 110;
  const prepareOffset = new anchor.BN(randomBytes(8), "hex");
  await program.methods
    .submitQuote(
      prepareOffset,
      quoteNonce,
      new anchor.BN(1_000_000),
      1,
      new anchor.BN(expiry),
      ciphertexts,
      Array.from(inputPublicKey),
      new anchor.BN(inputNonceBytes, "le")
    )
    .accountsPartial({
      ...queueAccounts(prepareOffset, "prepare_quote"),
      payer: owner,
      market,
      quote,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });
  await finalize(prepareOffset);
  let quoteState = await program.account.quoteRecord.fetch(quote);
  expect(quoteState.status).to.deep.equal({ validated: {} });
  expect(
    quoteState.ciphertexts.some((word) => word.some((byte) => byte !== 0))
  ).to.equal(true);

  const reserveOffset = new anchor.BN(randomBytes(8), "hex");
  await program.methods
    .reserveQuote(reserveOffset)
    .accountsPartial({
      ...queueAccounts(reserveOffset, "reserve_quote"),
      payer: owner,
      protocol,
      market,
      marketAccount,
      quote,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });
  await finalize(reserveOffset);
  quoteState = await program.account.quoteRecord.fetch(quote);
  expect(quoteState.status).to.deep.equal({ active: {} });
  let marketState = await program.account.market.fetch(market);
  expect(marketState.activeQuoteCount).to.equal(1);
  expect(marketState.activeQuotes[0].equals(quote)).to.equal(true);
  expect(marketState.quotedNotional.toNumber()).to.equal(1_000_000);
  const recoveryCipher = new RescueCipher(
    x25519.getSharedSecret(recoveryPrivateKey, mxePublicKey)
  );
  const reservedAccount = await program.account.marketAccount.fetch(
    marketAccount
  );
  expect(
    (
      await unpackMarket(
        recoveryCipher.decrypt(
          reservedAccount.recoveryCiphertexts.map((word) => Array.from(word)),
          Uint8Array.from(reservedAccount.recoveryNonce)
        )
      )
    ).reserved
  ).to.equal(100_000n);

  await program.methods
    .stopQuote()
    .accountsPartial({ actor: owner, market, quote })
    .rpc();
  quoteState = await program.account.quoteRecord.fetch(quote);
  expect(quoteState.status).to.deep.equal({ closing: {} });
  marketState = await program.account.market.fetch(market);
  expect(marketState.activeQuoteCount).to.equal(0);

  const releaseOffset = new anchor.BN(randomBytes(8), "hex");
  await program.methods
    .releaseQuote(releaseOffset)
    .accountsPartial({
      ...queueAccounts(releaseOffset, "release_quote"),
      payer: owner,
      protocol,
      market,
      marketAccount,
      quote,
    })
    .rpc({ skipPreflight: true, commitment: "confirmed" });
  await finalize(releaseOffset);
  quoteState = await program.account.quoteRecord.fetch(quote);
  expect(quoteState.status).to.deep.equal({ cancelled: {} });
  marketState = await program.account.market.fetch(market);
  expect(marketState.quotedNotional.toNumber()).to.equal(0);
  const releasedAccount = await program.account.marketAccount.fetch(
    marketAccount
  );
  expect(
    (
      await unpackMarket(
        recoveryCipher.decrypt(
          releasedAccount.recoveryCiphertexts.map((word) => Array.from(word)),
          Uint8Array.from(releasedAccount.recoveryNonce)
        )
      )
    ).reserved
  ).to.equal(0n);
  await program.methods
    .closeQuote()
    .accountsPartial({ maker: owner, quote })
    .rpc();
  expect(await program.account.quoteRecord.fetchNullable(quote)).to.equal(null);
}
