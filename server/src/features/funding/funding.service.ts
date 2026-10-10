import * as anchor from "@anchor-lang/core";
import {
  accountOffsets,
  balanceAddress,
  depositAddress,
  enumValues,
  marketAccountAddress,
  transferAddress,
} from "@depthhq/bindings";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "node:crypto";
import { ChainScan } from "@/shared/chain/chain.scan";
import type { ChainSigner } from "@/shared/chain/chain.signer";

type Status = Record<string, unknown>;
type Deposit = {
  owner: PublicKey;
  nonce: anchor.BN;
  status: Status;
};
type Transfer = {
  owner: PublicKey;
  market: PublicKey;
  nonce: anchor.BN;
  toMarket: boolean;
  status: Status;
};
type Account = { owner: PublicKey; status: Status };

function statusFilter(offset: number, value: number) {
  return {
    offset,
    bytes: anchor.utils.bytes.bs58.encode(Buffer.from([value])),
  };
}

export class FundingService {
  private readonly deposits: ChainScan;
  private readonly transfers: ChainScan;
  private depositQueue: Array<{ address: PublicKey; state: Deposit }> = [];
  private transferQueue: Array<{ address: PublicKey; state: Transfer }> = [];
  private depositFirst = true;

  constructor(private readonly chain: ChainSigner) {
    this.deposits = new ChainScan(chain, "DepositReceipt", [
      statusFilter(accountOffsets.DepositReceipt.status, enumValues.DepositStatus.Pending),
    ]);
    this.transfers = new ChainScan(chain, "MarginTransfer", [
      {
        offset: accountOffsets.MarginTransfer.market,
        bytes: chain.market.toBase58(),
      },
      statusFilter(
        accountOffsets.MarginTransfer.status,
        enumValues.MarginTransferStatus.Escrow,
      ),
    ]);
  }

  async advance(): Promise<{ stage: string; signature: string } | undefined> {
    const depositFirst = this.depositFirst;
    this.depositFirst = !depositFirst;
    return depositFirst
      ? (await this.credit()) ?? (await this.settle())
      : (await this.settle()) ?? (await this.credit());
  }

  private async ready(
    name: "BalanceAccount" | "MarketAccount",
    address: PublicKey,
    owner: PublicKey,
  ): Promise<boolean> {
    const info = await this.chain.connection.getAccountInfo(address, "confirmed");
    if (!info) return false;
    const state = await this.chain.read<Account>(name, address);
    return state.owner.equals(owner) && "ready" in state.status;
  }

  private async credit(): Promise<{ stage: string; signature: string } | undefined> {
    if (!this.depositQueue.length)
      this.depositQueue = await this.deposits.next<Deposit>();
    while (this.depositQueue.length) {
      const candidate = this.depositQueue.shift()!;
      const receipt = await this.chain.read<Deposit>(
        "DepositReceipt",
        candidate.address,
      );
      if (
        !("pending" in receipt.status) ||
        !candidate.address.equals(
          depositAddress(receipt.owner, BigInt(receipt.nonce.toString())),
        )
      )
        continue;
      const balance = balanceAddress(receipt.owner);
      if (!(await this.ready("BalanceAccount", balance, receipt.owner))) continue;
      const offset = new anchor.BN(randomBytes(8), "le");
      const signature = await this.chain.program.methods
        .creditDeposit(offset)
        .accountsPartial({
          ...(await this.chain.queue("credit_balance", offset)),
          payer: this.chain.wallet.publicKey,
          protocol: this.chain.protocol,
          receipt: candidate.address,
          balance,
        })
        .rpc({ commitment: "confirmed" });
      return { stage: "credit_deposit", signature };
    }
  }

  private async settle(): Promise<{ stage: string; signature: string } | undefined> {
    if (!this.transferQueue.length)
      this.transferQueue = await this.transfers.next<Transfer>();
    while (this.transferQueue.length) {
      const candidate = this.transferQueue.shift()!;
      const transfer = await this.chain.read<Transfer>(
        "MarginTransfer",
        candidate.address,
      );
      if (
        !("escrow" in transfer.status) ||
        !transfer.market.equals(this.chain.market) ||
        !candidate.address.equals(
          transferAddress(transfer.owner, BigInt(transfer.nonce.toString())),
        )
      )
        continue;
      if (transfer.toMarket) {
        const market = await this.chain.read<{ status: Status }>(
          "Market",
          this.chain.market,
        );
        if ("settling" in market.status) continue;
      }
      const destination = transfer.toMarket
        ? marketAccountAddress(transfer.owner)
        : balanceAddress(transfer.owner);
      const name = transfer.toMarket ? "MarketAccount" : "BalanceAccount";
      if (!(await this.ready(name, destination, transfer.owner))) continue;
      const offset = new anchor.BN(randomBytes(8), "le");
      const computation = transfer.toMarket ? "credit_market" : "credit_free";
      const method = transfer.toMarket
        ? this.chain.program.methods.settleAllocation
        : this.chain.program.methods.settleRelease;
      const signature = await method(offset)
        .accountsPartial({
          ...(await this.chain.queue(computation, offset)),
          payer: this.chain.wallet.publicKey,
          protocol: this.chain.protocol,
          market: this.chain.market,
          transfer: candidate.address,
          ...(transfer.toMarket
            ? { marketAccount: destination }
            : { balance: destination }),
        })
        .rpc({ commitment: "confirmed" });
      return {
        stage: transfer.toMarket ? "settle_allocation" : "settle_release",
        signature,
      };
    }
  }
}
