import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { expect } from "chai";
import { Depth } from "@/target/types/depth";

const SOL_USD_FEED_ID = Buffer.from(
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "hex"
);

describe("SOL perpetual market", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Depth as Program<Depth>;
  const authority = (anchor.getProvider() as anchor.AnchorProvider).wallet
    .publicKey;
  const [protocol] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    program.programId
  );
  const [market] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("market"), SOL_USD_FEED_ID],
    program.programId
  );
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
    maxOrderQueueSeconds: 30,
    fundingIntervalSeconds: 3_600,
    fundingRateCapBps: 50,
    quoteTiers: [1_000_000, 10_000_000, 100_000_000, 1_000_000_000].map(
      (value) => new anchor.BN(value)
    ) as [anchor.BN, anchor.BN, anchor.BN, anchor.BN],
    backstopMinCollateral: new anchor.BN(100_000_000),
  };

  it("stores bounded market economics and permits draft revisions by the authority", async () => {
    await program.methods
      .createMarket(config)
      .accountsPartial({ authority, protocol, market })
      .rpc();

    const stored = await program.account.market.fetch(market);
    const protocolState = await program.account.protocol.fetch(protocol);
    expect(Buffer.from(stored.marketId).equals(SOL_USD_FEED_ID)).to.equal(true);
    expect(stored.settlementMint.equals(protocolState.settlementMint)).to.equal(
      true
    );
    expect(stored.vault.equals(protocolState.vault)).to.equal(true);
    expect(stored.status).to.deep.equal({ draft: {} });
    expect(stored.revision.toNumber()).to.equal(1);
    expect(stored.config.initialMarginBps).to.equal(1_000);

    const stranger = anchor.web3.Keypair.generate();
    await expectRejected(
      program.methods
        .reviseMarket({ ...config, maxOracleAgeSeconds: 250 })
        .accountsPartial({ market, protocol, authority: stranger.publicKey })
        .signers([stranger])
        .rpc()
    );
    await expectRejected(
      program.methods
        .reviseMarket({ ...config, initialMarginBps: 400 })
        .accountsPartial({ market, protocol, authority })
        .rpc()
    );
    await expectRejected(
      program.methods
        .reviseMarket({ ...config, tradeFeeBps: 6 })
        .accountsPartial({ market, protocol, authority })
        .rpc()
    );

    await program.methods
      .reviseMarket({ ...config, maxOracleAgeSeconds: 250 })
      .accountsPartial({ market, protocol, authority })
      .rpc();

    const revised = await program.account.market.fetch(market);
    expect(revised.revision.toNumber()).to.equal(2);
    expect(revised.config.maxOracleAgeSeconds).to.equal(250);
  });
});

async function expectRejected(promise: Promise<unknown>) {
  try {
    await promise;
    expect.fail("the transaction should have failed");
  } catch (error) {
    expect(String(error)).not.to.include("the transaction should have failed");
  }
}
