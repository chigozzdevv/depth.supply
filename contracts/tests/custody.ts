import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";
import { Depth } from "@/target/types/depth";

describe("pending deposits", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.Depth as Program<Depth>;
  const payer = (
    provider.wallet as anchor.Wallet & { payer: anchor.web3.Keypair }
  ).payer;
  const owner = payer.publicKey;
  const [protocol] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    program.programId
  );
  const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId
  );
  const loader = new anchor.web3.PublicKey(
    "BPFLoaderUpgradeab1e11111111111111111111111"
  );
  const [programData] = anchor.web3.PublicKey.findProgramAddressSync(
    [program.programId.toBuffer()],
    loader
  );

  const receiptAddress = (nonce: number) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("deposit"),
        owner.toBuffer(),
        new anchor.BN(nonce).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

  it("records real token deposits and refunds each pending claim once", async () => {
    const mint = await createMint(provider.connection, payer, owner, null, 6);
    const source = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      owner
    );
    await mintTo(
      provider.connection,
      payer,
      mint,
      source.address,
      payer,
      1_000_000
    );

    const stranger = anchor.web3.Keypair.generate();
    const airdrop = await provider.connection.requestAirdrop(
      stranger.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdrop, "confirmed");
    await expectRejected(
      program.methods
        .initializeProtocol()
        .accountsPartial({
          authority: stranger.publicKey,
          program: program.programId,
          programData,
          settlementMint: mint,
          protocol,
          vault,
        })
        .signers([stranger])
        .rpc()
    );
    expect(await program.account.protocol.fetchNullable(protocol)).to.equal(
      null
    );

    const wrongDecimals = await createMint(
      provider.connection,
      payer,
      owner,
      null,
      9
    );
    await expectRejected(
      program.methods
        .initializeProtocol()
        .accountsPartial({
          authority: owner,
          program: program.programId,
          programData,
          settlementMint: wrongDecimals,
          protocol,
          vault,
        })
        .rpc()
    );
    expect(await program.account.protocol.fetchNullable(protocol)).to.equal(
      null
    );

    await program.methods
      .initializeProtocol()
      .accountsPartial({
        authority: owner,
        program: program.programId,
        programData,
        settlementMint: mint,
        protocol,
        vault,
      })
      .rpc();

    expect(
      (await program.account.protocol.fetch(protocol)).settlementMint.equals(
        mint
      )
    ).to.equal(true);

    const first = receiptAddress(1);
    await program.methods
      .deposit(new anchor.BN(1), new anchor.BN(400_000))
      .accountsPartial({
        owner,
        protocol,
        settlementMint: mint,
        source: source.address,
        vault,
        receipt: first,
      })
      .rpc();

    const second = receiptAddress(2);
    await program.methods
      .deposit(new anchor.BN(2), new anchor.BN(150_000))
      .accountsPartial({
        owner,
        protocol,
        settlementMint: mint,
        source: source.address,
        vault,
        receipt: second,
      })
      .rpc();

    expect((await getAccount(provider.connection, vault)).amount).to.equal(
      550_000n
    );
    expect(
      (await program.account.protocol.fetch(protocol)).pendingTotal.toNumber()
    ).to.equal(550_000);
    expect(
      (await program.account.depositReceipt.fetch(first)).status
    ).to.deep.equal({ pending: {} });

    const strangerAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      stranger.publicKey
    );
    await expectRejected(
      program.methods
        .refundDeposit()
        .accountsPartial({
          owner: stranger.publicKey,
          protocol,
          settlementMint: mint,
          vault,
          destination: strangerAccount.address,
          receipt: first,
        })
        .signers([stranger])
        .rpc()
    );

    const otherMint = await createMint(
      provider.connection,
      payer,
      owner,
      null,
      6
    );
    const otherSource = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      otherMint,
      owner
    );
    const wrongMintReceipt = receiptAddress(4);
    await expectRejected(
      program.methods
        .deposit(new anchor.BN(4), new anchor.BN(1))
        .accountsPartial({
          owner,
          protocol,
          settlementMint: mint,
          source: otherSource.address,
          vault,
          receipt: wrongMintReceipt,
        })
        .rpc()
    );
    expect(await provider.connection.getAccountInfo(wrongMintReceipt)).to.equal(
      null
    );

    const failedTransferReceipt = receiptAddress(5);
    await expectRejected(
      program.methods
        .deposit(new anchor.BN(5), new anchor.BN(500_000))
        .accountsPartial({
          owner,
          protocol,
          settlementMint: mint,
          source: source.address,
          vault,
          receipt: failedTransferReceipt,
        })
        .rpc()
    );
    expect(
      await provider.connection.getAccountInfo(failedTransferReceipt)
    ).to.equal(null);

    await expectRejected(
      program.methods
        .deposit(new anchor.BN(1), new anchor.BN(1))
        .accountsPartial({
          owner,
          protocol,
          settlementMint: mint,
          source: source.address,
          vault,
          receipt: first,
        })
        .rpc()
    );

    await program.methods
      .refundDeposit()
      .accountsPartial({
        owner,
        protocol,
        settlementMint: mint,
        vault,
        destination: source.address,
        receipt: first,
      })
      .rpc();

    expect((await getAccount(provider.connection, vault)).amount).to.equal(
      150_000n
    );
    expect(
      (await program.account.protocol.fetch(protocol)).pendingTotal.toNumber()
    ).to.equal(150_000);
    expect(
      (await program.account.depositReceipt.fetch(first)).status
    ).to.deep.equal({ refunded: {} });

    await expectRejected(
      program.methods
        .refundDeposit()
        .accountsPartial({
          owner,
          protocol,
          settlementMint: mint,
          vault,
          destination: source.address,
          receipt: first,
        })
        .rpc()
    );

    const third = receiptAddress(3);
    await expectRejected(
      program.methods
        .deposit(new anchor.BN(3), new anchor.BN(0))
        .accountsPartial({
          owner,
          protocol,
          settlementMint: mint,
          source: source.address,
          vault,
          receipt: third,
        })
        .rpc()
    );
    expect(await provider.connection.getAccountInfo(third)).to.equal(null);

    await program.methods
      .refundDeposit()
      .accountsPartial({
        owner,
        protocol,
        settlementMint: mint,
        vault,
        destination: source.address,
        receipt: second,
      })
      .rpc();

    expect((await getAccount(provider.connection, vault)).amount).to.equal(0n);
    expect(
      (await getAccount(provider.connection, source.address)).amount
    ).to.equal(1_000_000n);
    expect(
      (await program.account.protocol.fetch(protocol)).pendingTotal.toNumber()
    ).to.equal(0);
  });
});

async function expectRejected(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
    expect.fail("operation unexpectedly succeeded");
  } catch (error) {
    if (String(error).includes("operation unexpectedly succeeded")) throw error;
  }
}
