import * as anchor from "@anchor-lang/core";
import { createPacker, RescueCipher, x25519 } from "@arcium-hq/client";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { Depth } from "@/target/types/depth";
import { Harness } from "@/tests/support/harness";
import { unpackMarket } from "@/tests/support/packing";

const feed = Buffer.from(
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "hex"
);
const oracle = new PublicKey("3RW84c8AwWtLCVyETK2Xtruo9YsgFnMMt6uW2cDN4mzV");
const secondOracle = new PublicKey(
  "Br7uuwx4Fpota9gQjs21GmY9bGXbxEgvcgMtPFVkTXKY"
);
const crashOracle = new PublicKey(
  "27X4fVvv5yP45ydHuVNHiekYuiZPC8tmEjVQAeoHxjU5"
);
const followupOracle = new PublicKey(
  "GXJhaqHTaeQfpy1Qa91j863Avb43Bzs28vnFDH6aAdnF"
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
const fillPacker = createPacker<
  {
    side: bigint;
    size: bigint;
    margin: bigint;
    execution_price: bigint;
    fee: bigint;
    insurance_fee: bigint;
    app_fee: bigint;
  },
  {
    side: bigint;
    size: bigint;
    margin: bigint;
    execution_price: bigint;
    fee: bigint;
    insurance_fee: bigint;
    app_fee: bigint;
  }
>([
  { name: "side", type: { Integer: { signed: true, width: 8 } } },
  { name: "size", type: { Integer: { signed: false, width: 64 } } },
  { name: "margin", type: { Integer: { signed: false, width: 64 } } },
  { name: "execution_price", type: { Integer: { signed: false, width: 64 } } },
  { name: "fee", type: { Integer: { signed: false, width: 64 } } },
  { name: "insurance_fee", type: { Integer: { signed: false, width: 64 } } },
  { name: "app_fee", type: { Integer: { signed: false, width: 64 } } },
] as const);

function unpackFill(words: bigint[]) {
  // Arcium packs the eighth fill field into a third 214-bit slot.
  return {
    ...fillPacker.unpack(words.slice(0, 2)),
    maker_rebate: words[2] & ((1n << 64n) - 1n),
  };
}

describe("confidential trade settlement", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.Depth as anchor.Program<Depth>;
  const payer = (provider.wallet as anchor.Wallet & { payer: Keypair }).payer;
  const authority = payer.publicKey;
  const [protocol] = PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    program.programId
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
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

  it("matches privately and atomically settles opposite positions without a public position ledger", async () => {
    const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    const [programData] = PublicKey.findProgramAddressSync(
      [program.programId.toBuffer()],
      loader
    );
    const mint = await createMint(
      provider.connection,
      payer,
      authority,
      null,
      6
    );
    await program.methods
      .initializeProtocol()
      .accountsPartial({
        authority,
        program: program.programId,
        programData,
        settlementMint: mint,
        protocol,
        vault,
      })
      .rpc();
    const config = {
      initialMarginBps: 1_000,
      maintenanceMarginBps: 500,
      liquidationFeeBps: 50,
      tradeFeeBps: 5,
      insuranceFeeBps: 1,
      maxAccountNotional: new anchor.BN(1_000_000_000),
      maxMarketNotional: new anchor.BN(10_000_000_000),
      maxOracleAgeSeconds: 300,
      maxConfidenceBps: 100,
      maxQuoteDeviationBps: 500,
      maxQuoteLifetimeSeconds: 120,
      maxOrderQueueSeconds: 300,
      fundingIntervalSeconds: 3_600,
      fundingRateCapBps: 50,
      quoteTiers: [1_000_000, 10_000_000, 100_000_000, 1_000_000_000].map(
        (value) => new anchor.BN(value)
      ) as [anchor.BN, anchor.BN, anchor.BN, anchor.BN],
      backstopMinCollateral: new anchor.BN(100_000_000),
    };
    await program.methods
      .createMarket(config)
      .accountsPartial({ authority, protocol, market })
      .rpc();
    const harness = await Harness.create(provider, program);
    type InitAccounts = Parameters<Parameters<Harness["init"]>[2]>[0];
    const options = { skipPreflight: true, commitment: "confirmed" as const };
    const definitions: Array<
      [string, (accounts: InitAccounts) => Promise<unknown>]
    > = [
      [
        "open_balance",
        (a) =>
          program.methods
            .initOpenBalanceCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "credit_balance",
        (a) =>
          program.methods
            .initCreditBalanceCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "open_market",
        (a) =>
          program.methods
            .initOpenMarketCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "debit_free",
        (a) =>
          program.methods
            .initDebitFreeCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "credit_market",
        (a) =>
          program.methods
            .initCreditMarketCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "open_clearing",
        (a) =>
          program.methods
            .initOpenClearingCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "credit_insurance",
        (a) =>
          program.methods
            .initCreditInsuranceCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "prepare_quote",
        (a) =>
          program.methods
            .initPrepareQuoteCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "reserve_quote",
        (a) =>
          program.methods
            .initReserveQuoteCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "offer_backstop",
        (a) =>
          program.methods
            .initOfferBackstopCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "release_backstop",
        (a) =>
          program.methods
            .initReleaseBackstopCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "match_order",
        (a) =>
          program.methods
            .initMatchOrderCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "settle_trade",
        (a) =>
          program.methods
            .initSettleTradeCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "claim_trade_fees",
        (a) =>
          program.methods
            .initClaimTradeFeesCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "seal_trade_fees",
        (a) =>
          program.methods
            .initSealTradeFeesCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "liquidate",
        (a) =>
          program.methods
            .initLiquidateCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "seal_market",
        (a) =>
          program.methods
            .initSealMarketCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "seal_clearing",
        (a) =>
          program.methods
            .initSealClearingCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "view_market",
        (a) =>
          program.methods
            .initViewMarketCompDef()
            .accountsPartial(a)
            .rpc(options),
      ],
      [
        "view_fill",
        (a) =>
          program.methods.initViewFillCompDef().accountsPartial(a).rpc(options),
      ],
    ];
    for (const [name, init] of definitions)
      await harness.init(name, authority, init);

    const maker = payer;
    const trader = Keypair.generate();
    const airdrop = await provider.connection.requestAirdrop(
      trader.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdrop, "confirmed");
    const [appConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("app"), trader.publicKey.toBuffer()],
      program.programId
    );
    await program.methods
      .registerApp(1)
      .accountsPartial({ app: trader.publicKey, config: appConfig })
      .signers([trader])
      .rpc();
    let excessiveFeeRejected = false;
    try {
      await program.methods
        .setAppFee(3, true)
        .accountsPartial({ app: trader.publicKey, config: appConfig })
        .signers([trader])
        .rpc();
    } catch {
      excessiveFeeRejected = true;
    }
    expect(excessiveFeeRejected).to.equal(true);
    const makerRecoveryPrivate = new Uint8Array(32).fill(7);
    const traderRecoveryPrivate = new Uint8Array(32).fill(9);
    const makerRecovery = Array.from(x25519.getPublicKey(makerRecoveryPrivate));
    const traderRecovery = Array.from(
      x25519.getPublicKey(traderRecoveryPrivate)
    );
    const receiptAddress = (owner: PublicKey, nonce: anchor.BN) =>
      PublicKey.findProgramAddressSync(
        [
          Buffer.from("deposit"),
          owner.toBuffer(),
          nonce.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      )[0];
    const balanceAddress = (owner: PublicKey) =>
      PublicKey.findProgramAddressSync(
        [Buffer.from("balance"), owner.toBuffer()],
        program.programId
      )[0];
    const accountAddress = (owner: PublicKey) =>
      PublicKey.findProgramAddressSync(
        [Buffer.from("market-account"), market.toBuffer(), owner.toBuffer()],
        program.programId
      )[0];
    const transferAddress = (owner: PublicKey, nonce: anchor.BN) =>
      PublicKey.findProgramAddressSync(
        [
          Buffer.from("margin-transfer"),
          owner.toBuffer(),
          nonce.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      )[0];
    const fundUser = async (
      wallet: Keypair,
      recoveryKey: number[],
      nonceValue: number
    ) => {
      const owner = wallet.publicKey;
      const signers = owner.equals(authority) ? [] : [wallet];
      const balance = balanceAddress(owner);
      const marketAccount = accountAddress(owner);
      const source = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        owner
      );
      const funding = owner.equals(authority) ? 110_000_000 : 2_000_000;
      await mintTo(
        provider.connection,
        payer,
        mint,
        source.address,
        payer,
        funding
      );
      let offset = harness.offset();
      await program.methods
        .openBalance(offset, recoveryKey)
        .accountsPartial({
          ...harness.queue(offset, "open_balance"),
          payer: owner,
          protocol,
          balance,
        })
        .signers(signers)
        .rpc(options);
      await harness.finalize(offset);
      const depositNonce = new anchor.BN(nonceValue);
      const receipt = receiptAddress(owner, depositNonce);
      await program.methods
        .deposit(depositNonce, new anchor.BN(funding))
        .accountsPartial({
          owner,
          protocol,
          settlementMint: mint,
          source: source.address,
          vault,
          receipt,
        })
        .signers(signers)
        .rpc();
      offset = harness.offset();
      await program.methods
        .creditDeposit(offset)
        .accountsPartial({
          ...harness.queue(offset, "credit_balance"),
          payer: owner,
          protocol,
          balance,
          receipt,
        })
        .signers(signers)
        .rpc(options);
      await harness.finalize(offset);
      offset = harness.offset();
      await program.methods
        .openMarketAccount(offset, recoveryKey)
        .accountsPartial({
          ...harness.queue(offset, "open_market"),
          payer: owner,
          protocol,
          market,
          marketAccount,
        })
        .signers(signers)
        .rpc(options);
      await harness.finalize(offset);
      const transferNonce = new anchor.BN(nonceValue);
      const transfer = transferAddress(owner, transferNonce);
      offset = harness.offset();
      await program.methods
        .beginAllocation(offset, transferNonce, new anchor.BN(funding))
        .accountsPartial({
          ...harness.queue(offset, "debit_free"),
          payer: owner,
          protocol,
          market,
          balance,
          transfer,
        })
        .signers(signers)
        .rpc(options);
      await harness.finalize(offset);
      offset = harness.offset();
      await program.methods
        .settleAllocation(offset)
        .accountsPartial({
          ...harness.queue(offset, "credit_market"),
          payer: owner,
          protocol,
          market,
          transfer,
          marketAccount,
        })
        .signers(signers)
        .rpc(options);
      await harness.finalize(offset);
      expect(
        (await program.account.marketAccount.fetch(marketAccount)).status
      ).to.deep.equal({ ready: {} });
      return { balance, marketAccount, source: source.address };
    };

    const clearingRecoveryPrivate = new Uint8Array(32).fill(11);
    const clearingRecovery = Array.from(
      x25519.getPublicKey(clearingRecoveryPrivate)
    );
    let offset = harness.offset();
    await program.methods
      .openClearing(offset, clearingRecovery)
      .accountsPartial({
        ...harness.queue(offset, "open_clearing"),
        authority,
        protocol,
        market,
        clearing,
      })
      .rpc(options);
    await harness.finalize(offset);
    const insuranceSource = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      authority
    );
    await mintTo(
      provider.connection,
      payer,
      mint,
      insuranceSource.address,
      payer,
      100_000_000
    );
    const insuranceNonce = new anchor.BN(900);
    const insuranceReceipt = receiptAddress(authority, insuranceNonce);
    await program.methods
      .deposit(insuranceNonce, new anchor.BN(100_000_000))
      .accountsPartial({
        owner: authority,
        protocol,
        settlementMint: mint,
        source: insuranceSource.address,
        vault,
        receipt: insuranceReceipt,
      })
      .rpc();
    offset = harness.offset();
    await program.methods
      .creditInsurance(offset)
      .accountsPartial({
        ...harness.queue(offset, "credit_insurance"),
        authority,
        protocol,
        market,
        receipt: insuranceReceipt,
        clearing,
      })
      .rpc(options);
    await harness.finalize(offset);
    const makerState = await fundUser(maker, makerRecovery, 1);
    const traderState = await fundUser(trader, traderRecovery, 2);
    const operator = Keypair.generate();
    const operatorAirdrop = await provider.connection.requestAirdrop(
      operator.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(operatorAirdrop, "confirmed");
    const [operatorGrant] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("operator"),
        market.toBuffer(),
        authority.toBuffer(),
        operator.publicKey.toBuffer(),
      ],
      program.programId
    );
    await program.methods
      .grantOperator(
        new anchor.BN(10_000_000),
        new anchor.BN(Math.floor(Date.now() / 1000) + 3_600),
        true
      )
      .accountsPartial({
        maker: authority,
        market,
        marketAccount: makerState.marketAccount,
        operator: operator.publicKey,
        grant: operatorGrant,
      })
      .rpc();
    const marketOperatorNonce = new anchor.BN(902);
    const [marketOperatorView] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("market-view"),
        makerState.marketAccount.toBuffer(),
        marketOperatorNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const marketOperatorPrivate = x25519.utils.randomSecretKey();
    const marketOperatorKey = Array.from(
      x25519.getPublicKey(marketOperatorPrivate)
    );
    offset = harness.offset();
    await program.methods
      .requestMarketView(offset, marketOperatorNonce, marketOperatorKey)
      .accountsPartial({
        ...harness.queue(offset, "view_market"),
        payer: operator.publicKey,
        market,
        grant: operatorGrant,
        marketAccount: makerState.marketAccount,
        view: marketOperatorView,
      })
      .signers([operator])
      .rpc(options);
    await harness.finalize(offset);
    const delegatedView = await program.account.marketView.fetch(
      marketOperatorView
    );
    expect(delegatedView.status).to.deep.equal({ ready: {} });
    expect(delegatedView.owner.equals(operator.publicKey)).to.equal(true);
    const claimFees = async (filledOrder: PublicKey) => {
      const claimOffset = harness.offset();
      await program.methods
        .claimTradeFees(claimOffset)
        .accountsPartial({
          ...harness.queue(claimOffset, "claim_trade_fees"),
          payer: authority,
          market,
          clearing,
          protocolBalance: makerState.balance,
          appBalance: traderState.balance,
          order: filledOrder,
        })
        .remainingAccounts([
          { pubkey: protocol, isSigner: false, isWritable: false },
        ])
        .rpc(options);
      await harness.finalize(claimOffset);
      const pending = await program.account.orderRecord.fetch(filledOrder);
      expect(pending.claimStage).to.deep.equal({ ready: {} });
      expect(pending.feesClaimed).to.equal(false);
      const sealOffset = harness.offset();
      await program.methods
        .sealTradeFees(sealOffset)
        .accountsPartial({
          ...harness.queue(sealOffset, "seal_trade_fees"),
          payer: authority,
          market,
          clearing,
          protocolBalance: makerState.balance,
          appBalance: traderState.balance,
          order: filledOrder,
        })
        .remainingAccounts([
          { pubkey: protocol, isSigner: false, isWritable: false },
        ])
        .rpc(options);
      await harness.finalize(sealOffset);
      expect(
        (await program.account.orderRecord.fetch(filledOrder)).feesClaimed
      ).to.equal(true);
    };
    await program.methods
      .refreshOracle()
      .accountsPartial({ protocol, market, priceUpdate: oracle })
      .rpc();

    const backstopNonce = new anchor.BN(66);
    const [backstopOffer] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("backstop"),
        market.toBuffer(),
        authority.toBuffer(),
        backstopNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    offset = harness.offset();
    await program.methods
      .offerBackstop(
        offset,
        backstopNonce,
        new anchor.BN(1_000_000_000),
        new anchor.BN(Math.floor(Date.now() / 1000) + 3_600)
      )
      .accountsPartial({
        ...harness.queue(offset, "offer_backstop"),
        maker: authority,
        market,
        marketAccount: makerState.marketAccount,
        offer: backstopOffer,
      })
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.backstopOffer.fetch(backstopOffer)).status
    ).to.deep.equal({ active: {} });

    const quoteNonce = new anchor.BN(77);
    const [quote] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("quote"),
        market.toBuffer(),
        authority.toBuffer(),
        quoteNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const prices = harness.encrypt([
      19_900_000_000n,
      0n,
      0n,
      0n,
      20_100_000_000n,
      0n,
      0n,
      0n,
    ]);
    const expiry = Math.floor(Date.now() / 1000) + 115;
    offset = harness.offset();
    const quoteSnapshot = await program.account.market.fetch(market);
    let staleQuoteRejected = false;
    try {
      await program.methods
        .submitQuote(
          offset,
          quoteNonce,
          new anchor.BN(1_100_000),
          1,
          new anchor.BN(expiry),
          quoteSnapshot.revision.add(new anchor.BN(1)),
          quoteSnapshot.oracleTimestamp,
          prices.ciphertexts,
          prices.inputKey,
          prices.inputNonce
        )
        .accountsPartial({
          ...harness.queue(offset, "prepare_quote"),
          payer: operator.publicKey,
          market,
          marketAccount: makerState.marketAccount,
          grant: operatorGrant,
          quote,
        })
        .signers([operator])
        .rpc(options);
    } catch {
      staleQuoteRejected = true;
    }
    expect(staleQuoteRejected).to.equal(true);
    expect(await program.account.quoteRecord.fetchNullable(quote)).to.equal(
      null
    );
    await program.methods
      .submitQuote(
        offset,
        quoteNonce,
        new anchor.BN(1_100_000),
        1,
        new anchor.BN(expiry),
        (
          await program.account.market.fetch(market)
        ).revision,
        (
          await program.account.market.fetch(market)
        ).oracleTimestamp,
        prices.ciphertexts,
        prices.inputKey,
        prices.inputNonce
      )
      .accountsPartial({
        ...harness.queue(offset, "prepare_quote"),
        payer: operator.publicKey,
        market,
        marketAccount: makerState.marketAccount,
        grant: operatorGrant,
        quote,
      })
      .signers([operator])
      .rpc(options);
    await harness.finalize(offset);
    offset = harness.offset();
    await program.methods
      .reserveQuote(offset)
      .accountsPartial({
        ...harness.queue(offset, "reserve_quote"),
        payer: operator.publicKey,
        protocol,
        market,
        marketAccount: makerState.marketAccount,
        grant: operatorGrant,
        quote,
      })
      .signers([operator])
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.quoteRecord.fetch(quote)).status
    ).to.deep.equal({ active: {} });

    const clearingState = await program.account.clearingAccount.fetch(clearing);
    const clearingCipher = new RescueCipher(
      x25519.getSharedSecret(clearingRecoveryPrivate, harness.mxePublicKey)
    );
    const insurance = clearingPacker.unpack(
      clearingCipher.decrypt(
        clearingState.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(clearingState.recoveryNonce)
      )
    );
    expect(insurance.insurance).to.equal(100_000_000n);
    await program.methods
      .activateMarket(
        new anchor.BN(insurance.insurance.toString()),
        new anchor.BN(insurance.salt.toString())
      )
      .accountsPartial({
        authority,
        protocol,
        market,
        clearing,
        backstopOffer,
        vault,
      })
      .rpc();
    expect((await program.account.market.fetch(market)).status).to.deep.equal({
      active: {},
    });

    const orderNonce = new anchor.BN(501);
    const [order] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        market.toBuffer(),
        trader.publicKey.toBuffer(),
        orderNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const input = harness.encrypt([
      1n,
      5_000_000n,
      200_000n,
      20_100_000_000n,
      1_000n,
    ]);
    const deadline = Math.floor(Date.now() / 1000) + 260;
    offset = harness.offset();
    const orderSnapshot = await program.account.market.fetch(market);
    let staleOrderRejected = false;
    try {
      await program.methods
        .submitOrder(
          offset,
          orderNonce,
          trader.publicKey,
          1,
          new anchor.BN(1),
          new anchor.BN(deadline),
          orderSnapshot.revision,
          orderSnapshot.oracleTimestamp.sub(new anchor.BN(1)),
          input.ciphertexts,
          input.inputKey,
          input.inputNonce
        )
        .accountsPartial({
          ...harness.queue(offset, "match_order"),
          trader: trader.publicKey,
          protocol,
          appConfig,
          market,
          marketAccount: traderState.marketAccount,
          order,
        })
        .remainingAccounts([
          { pubkey: backstopOffer, isSigner: false, isWritable: false },
          { pubkey: quote, isSigner: false, isWritable: false },
        ])
        .signers([trader])
        .rpc(options);
    } catch {
      staleOrderRejected = true;
    }
    expect(staleOrderRejected).to.equal(true);
    expect(await program.account.orderRecord.fetchNullable(order)).to.equal(
      null
    );
    await program.methods
      .submitOrder(
        offset,
        orderNonce,
        trader.publicKey,
        1,
        new anchor.BN(1),
        new anchor.BN(deadline),
        (
          await program.account.market.fetch(market)
        ).revision,
        (
          await program.account.market.fetch(market)
        ).oracleTimestamp,
        input.ciphertexts,
        input.inputKey,
        input.inputNonce
      )
      .accountsPartial({
        ...harness.queue(offset, "match_order"),
        trader: trader.publicKey,
        protocol,
        appConfig,
        market,
        marketAccount: traderState.marketAccount,
        order,
      })
      .remainingAccounts([
        { pubkey: backstopOffer, isSigner: false, isWritable: false },
        { pubkey: quote, isSigner: false, isWritable: false },
      ])
      .signers([trader])
      .rpc(options);
    await harness.finalize(offset);
    let orderState = await program.account.orderRecord.fetch(order);
    expect(orderState.status).to.deep.equal({ matched: {} });
    expect(orderState.selectedQuote.equals(quote)).to.equal(true);
    expect(orderState.appFeeBps).to.equal(1);
    expect(orderState.appFeeVersion.toNumber()).to.equal(1);
    await program.methods
      .setAppFee(2, true)
      .accountsPartial({ app: trader.publicKey, config: appConfig })
      .signers([trader])
      .rpc();
    expect((await program.account.market.fetch(market)).pendingOrders).to.equal(
      1
    );
    expect(
      (await program.account.market.fetch(market)).pendingOrder.equals(order)
    ).to.equal(true);
    const before = await program.account.marketAccount.fetch(
      traderState.marketAccount
    );
    const traderCipher = new RescueCipher(
      x25519.getSharedSecret(traderRecoveryPrivate, harness.mxePublicKey)
    );
    expect(
      (
        await unpackMarket(
          traderCipher.decrypt(
            before.recoveryCiphertexts.map((word) => Array.from(word)),
            Uint8Array.from(before.recoveryNonce)
          )
        )
      ).position
    ).to.equal(0n);

    offset = harness.offset();
    await program.methods
      .settleTrade(offset)
      .accountsPartial({
        ...harness.queue(offset, "settle_trade"),
        payer: authority,
        market,
        clearing,
        traderAccount: traderState.marketAccount,
        makerAccount: makerState.marketAccount,
        order,
      })
      .remainingAccounts([
        { pubkey: quote, isSigner: false, isWritable: false },
      ])
      .rpc(options);
    orderState = await program.account.orderRecord.fetch(order);
    expect(orderState.status).to.deep.equal({ settling: {} });
    await harness.finalize(offset);
    orderState = await program.account.orderRecord.fetch(order);
    expect(orderState.status).to.deep.equal({ riskApproved: {} });
    offset = harness.offset();
    await program.methods
      .sealMarket(offset)
      .accountsPartial({
        ...harness.queue(offset, "seal_market"),
        payer: authority,
        market,
        clearing,
        traderAccount: traderState.marketAccount,
        makerAccount: makerState.marketAccount,
        order,
      })
      .rpc(options);
    orderState = await program.account.orderRecord.fetch(order);
    expect(orderState.status).to.deep.equal({ sealingTrader: {} });
    await harness.finalize(offset);
    orderState = await program.account.orderRecord.fetch(order);
    expect(orderState.status).to.deep.equal({ traderSealed: {} });
    offset = harness.offset();
    await program.methods
      .sealMarket(offset)
      .accountsPartial({
        ...harness.queue(offset, "seal_market"),
        payer: authority,
        market,
        clearing,
        traderAccount: traderState.marketAccount,
        makerAccount: makerState.marketAccount,
        order,
      })
      .rpc(options);
    await harness.finalize(offset);
    orderState = await program.account.orderRecord.fetch(order);
    expect(orderState.status).to.deep.equal({ makerSealed: {} });
    offset = harness.offset();
    await program.methods
      .sealClearing(offset)
      .accountsPartial({
        ...harness.queue(offset, "seal_clearing"),
        payer: authority,
        market,
        clearing,
        traderAccount: traderState.marketAccount,
        makerAccount: makerState.marketAccount,
        order,
      })
      .remainingAccounts([
        { pubkey: quote, isSigner: false, isWritable: false },
      ])
      .rpc(options);
    await harness.finalize(offset);
    orderState = await program.account.orderRecord.fetch(order);
    expect(orderState.status).to.deep.equal({ filled: {} });
    const marketState = await program.account.market.fetch(market);
    expect(marketState.pendingOrders).to.equal(0);
    expect(marketState.pendingOrder.equals(PublicKey.default)).to.equal(true);
    expect(marketState.activeQuoteCount).to.equal(0);
    expect(
      (await program.account.quoteRecord.fetch(quote)).status
    ).to.deep.equal({ filled: {} });

    const traderAccount = await program.account.marketAccount.fetch(
      traderState.marketAccount
    );
    const makerAccount = await program.account.marketAccount.fetch(
      makerState.marketAccount
    );
    const makerCipher = new RescueCipher(
      x25519.getSharedSecret(makerRecoveryPrivate, harness.mxePublicKey)
    );
    const traderValues = await unpackMarket(
      traderCipher.decrypt(
        traderAccount.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(traderAccount.recoveryNonce)
      )
    );
    const makerValues = await unpackMarket(
      makerCipher.decrypt(
        makerAccount.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(makerAccount.recoveryNonce)
      )
    );
    const finalClearing = await program.account.clearingAccount.fetch(clearing);
    const clearingValues = clearingPacker.unpack(
      clearingCipher.decrypt(
        finalClearing.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(finalClearing.recoveryNonce)
      )
    );
    expect(traderValues.position).to.equal(5_000_000n);
    expect(makerValues.position).to.equal(-5_000_000n);
    expect(traderValues.entry_price).to.equal(20_100_000_000n);
    expect(makerValues.entry_price).to.equal(20_100_000_000n);
    expect(traderValues.collateral).to.equal(1_999_397n);
    expect(makerValues.collateral).to.equal(110_000_100n);
    expect(clearingValues.insurance).to.equal(100_000_100n);
    expect(clearingValues.open_interest).to.equal(5_000_000n);
    expect(clearingValues.protocol_fees).to.equal(303n);
    expect(clearingValues.app_fees).to.equal(100n);
    const protocolBefore = await program.account.balanceAccount.fetch(
      makerState.balance
    );
    const appBefore = await program.account.balanceAccount.fetch(
      traderState.balance
    );
    expect(
      makerCipher.decrypt(
        protocolBefore.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(protocolBefore.recoveryNonce)
      )[0]
    ).to.equal(0n);
    expect(
      traderCipher.decrypt(
        appBefore.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(appBefore.recoveryNonce)
      )[0]
    ).to.equal(0n);

    await claimFees(order);
    const claimedClearing = await program.account.clearingAccount.fetch(
      clearing
    );
    const claimedValues = clearingPacker.unpack(
      clearingCipher.decrypt(
        claimedClearing.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(claimedClearing.recoveryNonce)
      )
    );
    expect(claimedValues.protocol_fees).to.equal(0n);
    expect(claimedValues.app_fees).to.equal(0n);
    const protocolBalance = await program.account.balanceAccount.fetch(
      makerState.balance
    );
    const appBalance = await program.account.balanceAccount.fetch(
      traderState.balance
    );
    let protocolFees = makerCipher.decrypt(
      protocolBalance.recoveryCiphertexts.map((word) => Array.from(word)),
      Uint8Array.from(protocolBalance.recoveryNonce)
    )[0];
    let appFees = traderCipher.decrypt(
      appBalance.recoveryCiphertexts.map((word) => Array.from(word)),
      Uint8Array.from(appBalance.recoveryNonce)
    )[0];
    expect(protocolFees).to.equal(303n);
    expect(appFees).to.equal(100n);
    let duplicateClaimRejected = false;
    offset = harness.offset();
    try {
      await program.methods
        .claimTradeFees(offset)
        .accountsPartial({
          ...harness.queue(offset, "claim_trade_fees"),
          payer: authority,
          market,
          clearing,
          protocolBalance: makerState.balance,
          appBalance: traderState.balance,
          order,
        })
        .remainingAccounts([
          { pubkey: protocol, isSigner: false, isWritable: false },
        ])
        .rpc(options);
    } catch {
      duplicateClaimRejected = true;
    }
    expect(duplicateClaimRejected).to.equal(true);
    await program.methods
      .setAppFee(1, true)
      .accountsPartial({ app: trader.publicKey, config: appConfig })
      .signers([trader])
      .rpc();
    expect(
      traderValues.collateral +
        makerValues.collateral +
        clearingValues.insurance +
        protocolFees +
        appFees
    ).to.equal(212_000_000n);
    expect((await getAccount(provider.connection, vault)).amount).to.equal(
      212_000_000n
    );
    expect(
      (await program.account.protocol.fetch(protocol)).creditedTotal.toNumber()
    ).to.equal(212_000_000);

    const viewPrivate = new Uint8Array(32).fill(13);
    const viewKey = Array.from(x25519.getPublicKey(viewPrivate));
    const viewCipher = new RescueCipher(
      x25519.getSharedSecret(viewPrivate, harness.mxePublicKey)
    );
    const marketViewNonce = new anchor.BN(601);
    const [marketView] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("market-view"),
        traderState.marketAccount.toBuffer(),
        marketViewNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    offset = harness.offset();
    await program.methods
      .requestMarketView(offset, marketViewNonce, viewKey)
      .accountsPartial({
        ...harness.queue(offset, "view_market"),
        payer: trader.publicKey,
        market,
        marketAccount: traderState.marketAccount,
        view: marketView,
      })
      .signers([trader])
      .rpc(options);
    await harness.finalize(offset);
    const sealedMarket = await program.account.marketView.fetch(marketView);
    expect(sealedMarket.status).to.deep.equal({ ready: {} });
    expect(
      (
        await unpackMarket(
          viewCipher.decrypt(
            sealedMarket.ciphertexts.map((word) => Array.from(word)),
            Uint8Array.from(sealedMarket.outputNonce)
          )
        )
      ).position
    ).to.equal(5_000_000n);

    await program.methods
      .closeQuote()
      .accountsPartial({ maker: authority, quote })
      .rpc();

    const fillViewNonce = new anchor.BN(602);
    const [fillView] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("fill-view"),
        order.toBuffer(),
        trader.publicKey.toBuffer(),
        fillViewNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    offset = harness.offset();
    await program.methods
      .requestFillView(offset, fillViewNonce, viewKey)
      .accountsPartial({
        ...harness.queue(offset, "view_fill"),
        payer: trader.publicKey,
        order,
        view: fillView,
      })
      .signers([trader])
      .rpc(options);
    await harness.finalize(offset);
    const sealedFill = await program.account.fillView.fetch(fillView);
    expect(sealedFill.status).to.deep.equal({ ready: {} });
    const fill = unpackFill(
      viewCipher.decrypt(
        sealedFill.ciphertexts.map((word) => Array.from(word)),
        Uint8Array.from(sealedFill.outputNonce)
      )
    );
    expect(fill.side).to.equal(1n);
    expect(fill.size).to.equal(5_000_000n);
    expect(fill.execution_price).to.equal(20_100_000_000n);
    expect(fill.fee).to.equal(603n);
    expect(fill.insurance_fee).to.equal(100n);
    expect(fill.app_fee).to.equal(100n);
    expect(fill.maker_rebate).to.equal(100n);

    const makerFillNonce = new anchor.BN(603);
    const [makerFillView] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("fill-view"),
        order.toBuffer(),
        authority.toBuffer(),
        makerFillNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    offset = harness.offset();
    await program.methods
      .requestFillView(offset, makerFillNonce, viewKey)
      .accountsPartial({
        ...harness.queue(offset, "view_fill"),
        payer: authority,
        order,
        view: makerFillView,
      })
      .rpc(options);
    await harness.finalize(offset);
    const sealedMakerFill = await program.account.fillView.fetch(makerFillView);
    expect(sealedMakerFill.status).to.deep.equal({ ready: {} });
    const makerFill = unpackFill(
      viewCipher.decrypt(
        sealedMakerFill.ciphertexts.map((word) => Array.from(word)),
        Uint8Array.from(sealedMakerFill.outputNonce)
      )
    );
    expect(makerFill.side).to.equal(1n);
    expect(makerFill.size).to.equal(5_000_000n);

    const operatorViewNonce = new anchor.BN(604);
    const [operatorView] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("fill-view"),
        order.toBuffer(),
        operator.publicKey.toBuffer(),
        operatorViewNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    offset = harness.offset();
    await program.methods
      .requestFillView(offset, operatorViewNonce, viewKey)
      .accountsPartial({
        ...harness.queue(offset, "view_fill"),
        payer: operator.publicKey,
        order,
        grant: operatorGrant,
        view: operatorView,
      })
      .signers([operator])
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.fillView.fetch(operatorView)).status
    ).to.deep.equal({
      ready: {},
    });
    await program.methods
      .revokeOperator()
      .accountsPartial({ maker: authority, grant: operatorGrant })
      .rpc();
    const revokedNonce = new anchor.BN(605);
    const [revokedView] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("fill-view"),
        order.toBuffer(),
        operator.publicKey.toBuffer(),
        revokedNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    let revokedViewRejected = false;
    try {
      offset = harness.offset();
      await program.methods
        .requestFillView(offset, revokedNonce, viewKey)
        .accountsPartial({
          ...harness.queue(offset, "view_fill"),
          payer: operator.publicKey,
          order,
          grant: operatorGrant,
          view: revokedView,
        })
        .signers([operator])
        .rpc(options);
    } catch {
      revokedViewRejected = true;
    }
    expect(revokedViewRejected).to.equal(true);

    const exitQuoteNonce = new anchor.BN(78);
    const [exitQuote] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("quote"),
        market.toBuffer(),
        authority.toBuffer(),
        exitQuoteNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const exitPrices = harness.encrypt([
      19_900_000_000n,
      0n,
      0n,
      0n,
      20_100_000_000n,
      0n,
      0n,
      0n,
    ]);
    offset = harness.offset();
    await program.methods
      .submitQuote(
        offset,
        exitQuoteNonce,
        new anchor.BN(1_100_000),
        1,
        new anchor.BN(Math.floor(Date.now() / 1000) + 115),
        (
          await program.account.market.fetch(market)
        ).revision,
        (
          await program.account.market.fetch(market)
        ).oracleTimestamp,
        exitPrices.ciphertexts,
        exitPrices.inputKey,
        exitPrices.inputNonce
      )
      .accountsPartial({
        ...harness.queue(offset, "prepare_quote"),
        payer: authority,
        market,
        marketAccount: makerState.marketAccount,
        quote: exitQuote,
      })
      .rpc(options);
    await harness.finalize(offset);
    offset = harness.offset();
    await program.methods
      .reserveQuote(offset)
      .accountsPartial({
        ...harness.queue(offset, "reserve_quote"),
        payer: authority,
        protocol,
        market,
        marketAccount: makerState.marketAccount,
        quote: exitQuote,
      })
      .rpc(options);
    await harness.finalize(offset);

    const rejectedNonce = new anchor.BN(503);
    const [rejectedOrder] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        market.toBuffer(),
        trader.publicKey.toBuffer(),
        rejectedNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const rejectedInput = harness.encrypt([
      255n,
      5_000_000n,
      200_000n,
      19_900_000_000n,
      1n,
    ]);
    offset = harness.offset();
    await program.methods
      .submitOrder(
        offset,
        rejectedNonce,
        trader.publicKey,
        1,
        new anchor.BN(3),
        new anchor.BN(Math.floor(Date.now() / 1000) + 260),
        (
          await program.account.market.fetch(market)
        ).revision,
        (
          await program.account.market.fetch(market)
        ).oracleTimestamp,
        rejectedInput.ciphertexts,
        rejectedInput.inputKey,
        rejectedInput.inputNonce
      )
      .accountsPartial({
        ...harness.queue(offset, "match_order"),
        trader: trader.publicKey,
        protocol,
        appConfig,
        market,
        marketAccount: traderState.marketAccount,
        order: rejectedOrder,
      })
      .remainingAccounts([
        { pubkey: backstopOffer, isSigner: false, isWritable: false },
        { pubkey: exitQuote, isSigner: false, isWritable: false },
      ])
      .signers([trader])
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.orderRecord.fetch(rejectedOrder)).status
    ).to.deep.equal({ rejected: {} });
    expect((await program.account.market.fetch(market)).pendingOrders).to.equal(
      0
    );

    const exitNonce = new anchor.BN(502);
    const [exitOrder] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        market.toBuffer(),
        trader.publicKey.toBuffer(),
        exitNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const exitInput = harness.encrypt([
      255n,
      5_000_000n,
      200_000n,
      19_900_000_000n,
      1_000n,
    ]);
    offset = harness.offset();
    await program.methods
      .submitOrder(
        offset,
        exitNonce,
        trader.publicKey,
        1,
        new anchor.BN(3),
        new anchor.BN(Math.floor(Date.now() / 1000) + 260),
        (
          await program.account.market.fetch(market)
        ).revision,
        (
          await program.account.market.fetch(market)
        ).oracleTimestamp,
        exitInput.ciphertexts,
        exitInput.inputKey,
        exitInput.inputNonce
      )
      .accountsPartial({
        ...harness.queue(offset, "match_order"),
        trader: trader.publicKey,
        protocol,
        appConfig,
        market,
        marketAccount: traderState.marketAccount,
        order: exitOrder,
      })
      .remainingAccounts([
        { pubkey: backstopOffer, isSigner: false, isWritable: false },
        { pubkey: exitQuote, isSigner: false, isWritable: false },
      ])
      .signers([trader])
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.orderRecord.fetch(exitOrder)).status
    ).to.deep.equal({ matched: {} });
    offset = harness.offset();
    await program.methods
      .settleTrade(offset)
      .accountsPartial({
        ...harness.queue(offset, "settle_trade"),
        payer: authority,
        market,
        clearing,
        traderAccount: traderState.marketAccount,
        makerAccount: makerState.marketAccount,
        order: exitOrder,
      })
      .remainingAccounts([
        { pubkey: exitQuote, isSigner: false, isWritable: false },
      ])
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.orderRecord.fetch(exitOrder)).status
    ).to.deep.equal({ riskApproved: {} });
    for (let i = 0; i < 2; i++) {
      offset = harness.offset();
      await program.methods
        .sealMarket(offset)
        .accountsPartial({
          ...harness.queue(offset, "seal_market"),
          payer: authority,
          market,
          clearing,
          traderAccount: traderState.marketAccount,
          makerAccount: makerState.marketAccount,
          order: exitOrder,
        })
        .rpc(options);
      await harness.finalize(offset);
    }
    offset = harness.offset();
    await program.methods
      .sealClearing(offset)
      .accountsPartial({
        ...harness.queue(offset, "seal_clearing"),
        payer: authority,
        market,
        clearing,
        traderAccount: traderState.marketAccount,
        makerAccount: makerState.marketAccount,
        order: exitOrder,
      })
      .remainingAccounts([
        { pubkey: exitQuote, isSigner: false, isWritable: false },
      ])
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.orderRecord.fetch(exitOrder)).status
    ).to.deep.equal({ filled: {} });
    const exitTrader = await program.account.marketAccount.fetch(
      traderState.marketAccount
    );
    const exitMaker = await program.account.marketAccount.fetch(
      makerState.marketAccount
    );
    const exitClearing = await program.account.clearingAccount.fetch(clearing);
    const traderAfter = await unpackMarket(
      traderCipher.decrypt(
        exitTrader.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(exitTrader.recoveryNonce)
      )
    );
    const makerAfter = await unpackMarket(
      makerCipher.decrypt(
        exitMaker.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(exitMaker.recoveryNonce)
      )
    );
    const clearingAfter = clearingPacker.unpack(
      clearingCipher.decrypt(
        exitClearing.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(exitClearing.recoveryNonce)
      )
    );
    expect(traderAfter.position).to.equal(0n);
    expect(makerAfter.position).to.equal(0n);
    expect(traderAfter.collateral).to.equal(1_988_800n);
    expect(makerAfter.collateral).to.equal(110_010_199n);
    expect(clearingAfter.insurance).to.equal(100_000_199n);
    expect(clearingAfter.open_interest).to.equal(0n);
    expect(clearingAfter.protocol_fees).to.equal(300n);
    expect(clearingAfter.app_fees).to.equal(99n);
    expect(
      traderAfter.collateral +
        makerAfter.collateral +
        clearingAfter.insurance +
        clearingAfter.protocol_fees +
        clearingAfter.app_fees +
        protocolFees +
        appFees
    ).to.equal(212_000_000n);

    await claimFees(exitOrder);
    const exitClaimedClearing = await program.account.clearingAccount.fetch(
      clearing
    );
    const exitClaimedValues = clearingPacker.unpack(
      clearingCipher.decrypt(
        exitClaimedClearing.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(exitClaimedClearing.recoveryNonce)
      )
    );
    expect(exitClaimedValues.protocol_fees).to.equal(0n);
    expect(exitClaimedValues.app_fees).to.equal(0n);
    const protocolAfterClaim = await program.account.balanceAccount.fetch(
      makerState.balance
    );
    const appAfterClaim = await program.account.balanceAccount.fetch(
      traderState.balance
    );
    protocolFees = makerCipher.decrypt(
      protocolAfterClaim.recoveryCiphertexts.map((word) => Array.from(word)),
      Uint8Array.from(protocolAfterClaim.recoveryNonce)
    )[0];
    appFees = traderCipher.decrypt(
      appAfterClaim.recoveryCiphertexts.map((word) => Array.from(word)),
      Uint8Array.from(appAfterClaim.recoveryNonce)
    )[0];
    expect(protocolFees).to.equal(603n);
    expect(appFees).to.equal(199n);

    await program.methods
      .pauseMarket()
      .accountsPartial({ actor: authority, protocol, market })
      .rpc();
    expect((await program.account.market.fetch(market)).status).to.deep.equal({
      paused: {},
    });
    expect(
      (await program.account.protocol.fetch(protocol)).tradingEnabled
    ).to.equal(false);
    await program.methods
      .resumeMarket()
      .accountsPartial({
        authority,
        protocol,
        market,
        clearing,
        backstopOffer,
        vault,
      })
      .rpc();
    expect((await program.account.market.fetch(market)).status).to.deep.equal({
      active: {},
    });

    await program.methods
      .refreshOracle()
      .accountsPartial({ protocol, market, priceUpdate: secondOracle })
      .rpc();
    const riskQuoteNonce = new anchor.BN(79);
    const [riskQuote] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("quote"),
        market.toBuffer(),
        authority.toBuffer(),
        riskQuoteNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const riskPrices = harness.encrypt([
      19_900_000_000n,
      19_900_000_000n,
      0n,
      0n,
      20_100_000_000n,
      20_100_000_000n,
      0n,
      0n,
    ]);
    offset = harness.offset();
    await program.methods
      .submitQuote(
        offset,
        riskQuoteNonce,
        new anchor.BN(10_000_000),
        2,
        new anchor.BN(Math.floor(Date.now() / 1000) + 115),
        (
          await program.account.market.fetch(market)
        ).revision,
        (
          await program.account.market.fetch(market)
        ).oracleTimestamp,
        riskPrices.ciphertexts,
        riskPrices.inputKey,
        riskPrices.inputNonce
      )
      .accountsPartial({
        ...harness.queue(offset, "prepare_quote"),
        payer: authority,
        market,
        marketAccount: makerState.marketAccount,
        quote: riskQuote,
      })
      .rpc(options);
    await harness.finalize(offset);
    offset = harness.offset();
    await program.methods
      .reserveQuote(offset)
      .accountsPartial({
        ...harness.queue(offset, "reserve_quote"),
        payer: authority,
        protocol,
        market,
        marketAccount: makerState.marketAccount,
        quote: riskQuote,
      })
      .rpc(options);
    await harness.finalize(offset);

    const riskNonce = new anchor.BN(504);
    const [riskOrder] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        market.toBuffer(),
        trader.publicKey.toBuffer(),
        riskNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const riskInput = harness.encrypt([
      1n,
      12_000_000n,
      1_700_000n,
      20_100_000_000n,
      2_000n,
    ]);
    offset = harness.offset();
    await program.methods
      .submitOrder(
        offset,
        riskNonce,
        trader.publicKey,
        1,
        new anchor.BN(3),
        new anchor.BN(Math.floor(Date.now() / 1000) + 260),
        (
          await program.account.market.fetch(market)
        ).revision,
        (
          await program.account.market.fetch(market)
        ).oracleTimestamp,
        riskInput.ciphertexts,
        riskInput.inputKey,
        riskInput.inputNonce
      )
      .accountsPartial({
        ...harness.queue(offset, "match_order"),
        trader: trader.publicKey,
        protocol,
        appConfig,
        market,
        marketAccount: traderState.marketAccount,
        order: riskOrder,
      })
      .remainingAccounts([
        { pubkey: backstopOffer, isSigner: false, isWritable: false },
        { pubkey: riskQuote, isSigner: false, isWritable: false },
      ])
      .signers([trader])
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.orderRecord.fetch(riskOrder)).status
    ).to.deep.equal({ matched: {} });
    offset = harness.offset();
    await program.methods
      .settleTrade(offset)
      .accountsPartial({
        ...harness.queue(offset, "settle_trade"),
        payer: authority,
        market,
        clearing,
        traderAccount: traderState.marketAccount,
        makerAccount: makerState.marketAccount,
        order: riskOrder,
      })
      .remainingAccounts([
        { pubkey: riskQuote, isSigner: false, isWritable: false },
      ])
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.orderRecord.fetch(riskOrder)).status
    ).to.deep.equal({ riskApproved: {} });
    for (let i = 0; i < 2; i++) {
      offset = harness.offset();
      await program.methods
        .sealMarket(offset)
        .accountsPartial({
          ...harness.queue(offset, "seal_market"),
          payer: authority,
          market,
          clearing,
          traderAccount: traderState.marketAccount,
          makerAccount: makerState.marketAccount,
          order: riskOrder,
        })
        .rpc(options);
      await harness.finalize(offset);
    }
    offset = harness.offset();
    await program.methods
      .sealClearing(offset)
      .accountsPartial({
        ...harness.queue(offset, "seal_clearing"),
        payer: authority,
        market,
        clearing,
        traderAccount: traderState.marketAccount,
        makerAccount: makerState.marketAccount,
        order: riskOrder,
      })
      .remainingAccounts([
        { pubkey: riskQuote, isSigner: false, isWritable: false },
      ])
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.orderRecord.fetch(riskOrder)).status
    ).to.deep.equal({ filled: {} });

    await program.methods
      .refreshOracle()
      .accountsPartial({ protocol, market, priceUpdate: crashOracle })
      .rpc();
    const liquidationNonce = new anchor.BN(505);
    const [liquidation] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        market.toBuffer(),
        trader.publicKey.toBuffer(),
        liquidationNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    offset = harness.offset();
    await program.methods
      .liquidate(
        offset,
        trader.publicKey,
        liquidationNonce,
        new anchor.BN(Math.floor(Date.now() / 1000) + 260)
      )
      .accountsPartial({
        ...harness.queue(offset, "liquidate"),
        payer: authority,
        market,
        clearing,
        targetAccount: traderState.marketAccount,
        backstopAccount: makerState.marketAccount,
        offer: backstopOffer,
        order: liquidation,
      })
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.orderRecord.fetch(liquidation)).status
    ).to.deep.equal({ riskApproved: {} });
    for (let i = 0; i < 2; i++) {
      offset = harness.offset();
      await program.methods
        .sealMarket(offset)
        .accountsPartial({
          ...harness.queue(offset, "seal_market"),
          payer: authority,
          market,
          clearing,
          traderAccount: traderState.marketAccount,
          makerAccount: makerState.marketAccount,
          order: liquidation,
        })
        .rpc(options);
      await harness.finalize(offset);
    }
    offset = harness.offset();
    await program.methods
      .sealClearing(offset)
      .accountsPartial({
        ...harness.queue(offset, "seal_clearing"),
        payer: authority,
        market,
        clearing,
        traderAccount: traderState.marketAccount,
        makerAccount: makerState.marketAccount,
        order: liquidation,
      })
      .remainingAccounts([
        { pubkey: backstopOffer, isSigner: false, isWritable: false },
      ])
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.orderRecord.fetch(liquidation)).status
    ).to.deep.equal({ filled: {} });
    expect(
      (await program.account.backstopOffer.fetch(backstopOffer)).status
    ).to.deep.equal({ consumed: {} });
    expect((await program.account.market.fetch(market)).status).to.deep.equal({
      paused: {},
    });
    expect(
      (await program.account.protocol.fetch(protocol)).tradingEnabled
    ).to.equal(false);
    const liquidatedTrader = await program.account.marketAccount.fetch(
      traderState.marketAccount
    );
    const liquidatedMaker = await program.account.marketAccount.fetch(
      makerState.marketAccount
    );
    const liquidatedClearing = await program.account.clearingAccount.fetch(
      clearing
    );
    const traderFinal = await unpackMarket(
      traderCipher.decrypt(
        liquidatedTrader.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(liquidatedTrader.recoveryNonce)
      )
    );
    const makerFinal = await unpackMarket(
      makerCipher.decrypt(
        liquidatedMaker.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(liquidatedMaker.recoveryNonce)
      )
    );
    const clearingFinal = clearingPacker.unpack(
      clearingCipher.decrypt(
        liquidatedClearing.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(liquidatedClearing.recoveryNonce)
      )
    );
    expect(traderFinal.position).to.equal(0n);
    expect(makerFinal.position).to.equal(0n);
    expect(clearingFinal.open_interest).to.equal(0n);
    expect(
      traderFinal.collateral +
        makerFinal.collateral +
        clearingFinal.insurance +
        clearingFinal.protocol_fees +
        clearingFinal.app_fees +
        protocolFees +
        appFees
    ).to.equal(212_000_000n);

    const replacementNonce = new anchor.BN(67);
    const [replacementOffer] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("backstop"),
        market.toBuffer(),
        authority.toBuffer(),
        replacementNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    offset = harness.offset();
    await program.methods
      .offerBackstop(
        offset,
        replacementNonce,
        new anchor.BN(1_000_000_000),
        new anchor.BN(Math.floor(Date.now() / 1000) + 3_600)
      )
      .accountsPartial({
        ...harness.queue(offset, "offer_backstop"),
        maker: authority,
        market,
        marketAccount: makerState.marketAccount,
        offer: replacementOffer,
      })
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.backstopOffer.fetch(replacementOffer)).status
    ).to.deep.equal({ active: {} });

    await program.methods
      .refreshOracle()
      .accountsPartial({ protocol, market, priceUpdate: followupOracle })
      .rpc();
    const healthyNonce = new anchor.BN(506);
    const [healthyCheck] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("order"),
        market.toBuffer(),
        trader.publicKey.toBuffer(),
        healthyNonce.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    offset = harness.offset();
    await program.methods
      .liquidate(
        offset,
        trader.publicKey,
        healthyNonce,
        new anchor.BN(Math.floor(Date.now() / 1000) + 115)
      )
      .accountsPartial({
        ...harness.queue(offset, "liquidate"),
        payer: authority,
        market,
        clearing,
        targetAccount: traderState.marketAccount,
        backstopAccount: makerState.marketAccount,
        offer: replacementOffer,
        order: healthyCheck,
      })
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.orderRecord.fetch(healthyCheck)).status
    ).to.deep.equal({ rejected: {} });
    expect(
      (await program.account.backstopOffer.fetch(replacementOffer)).status
    ).to.deep.equal({ active: {} });
    expect((await program.account.market.fetch(market)).pendingOrders).to.equal(
      0
    );

    offset = harness.offset();
    await program.methods
      .releaseBackstop(offset)
      .accountsPartial({
        ...harness.queue(offset, "release_backstop"),
        actor: authority,
        protocol,
        market,
        marketAccount: makerState.marketAccount,
        offer: replacementOffer,
      })
      .rpc(options);
    await harness.finalize(offset);
    expect(
      (await program.account.backstopOffer.fetch(replacementOffer)).status
    ).to.deep.equal({ cancelled: {} });
    expect(
      (await program.account.market.fetch(market)).backstopOffer
    ).to.deep.equal(PublicKey.default);
    const releasedMaker = await program.account.marketAccount.fetch(
      makerState.marketAccount
    );
    const releasedState = await unpackMarket(
      makerCipher.decrypt(
        releasedMaker.recoveryCiphertexts.map((word) => Array.from(word)),
        Uint8Array.from(releasedMaker.recoveryNonce)
      )
    );
    expect(releasedState.reserved).to.equal(0n);
    expect(releasedState.collateral).to.equal(makerFinal.collateral);
    await program.methods
      .closeBackstop()
      .accountsPartial({ maker: authority, offer: replacementOffer })
      .rpc();
    expect(
      await program.account.backstopOffer.fetchNullable(replacementOffer)
    ).to.equal(null);
  });
});
