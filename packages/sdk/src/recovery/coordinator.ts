import * as anchor from "@anchor-lang/core";
import {
  accountOffsets,
  marketAccountAddress,
  marketAddress,
} from "@depth/bindings";
import { PublicKey } from "@solana/web3.js";
import type { GetProgramAccountsFilter } from "@solana/web3.js";
import { RecoveryWitnessReader } from "@/recovery/witness";
import { WinddownOperator } from "@/recovery/winddown";

type Order = {
  market: PublicKey;
  kind: Record<string, unknown>;
  status: Record<string, unknown>;
  feesClaimed: boolean;
};
type Winddown = {
  market: PublicKey;
  finalized: boolean;
  expectedAccounts: number;
  revealedAccounts: number;
};

export class RecoveryCoordinator {
  private readonly operator: WinddownOperator;
  private readonly market: PublicKey;

  constructor(
    private readonly program: anchor.Program,
    private readonly reader: RecoveryWitnessReader
  ) {
    this.operator = new WinddownOperator(program);
    this.market = marketAddress(program.programId);
  }

  private async scan(
    name: string,
    offset: number,
    length: number,
    filters: GetProgramAccountsFilter[] = []
  ): Promise<
    {
      id: PublicKey;
      data: Buffer;
    }[]
  > {
    const accounts = await this.program.provider.connection.getProgramAccounts(
      this.program.programId,
      {
        commitment: "confirmed",
        dataSlice: { offset, length },
        filters: [
          { memcmp: this.program.coder.accounts.memcmp(name) },
          ...filters,
        ],
      }
    );
    return accounts.map(({ pubkey, account }) => {
      if (!account.owner.equals(this.program.programId))
        throw new Error(`${name} changed owner during recovery scan`);
      return { id: pubkey, data: account.data };
    });
  }

  private async participants(expected: number): Promise<PublicKey[]> {
    const accounts = await this.scan("marketAccount", 8, 64, [
      {
        memcmp: {
          offset: accountOffsets.MarketAccount.market,
          bytes: this.market.toBase58(),
        },
      },
    ]);
    if (accounts.length !== expected)
      throw new Error(
        `Recovery scan found ${accounts.length} of ${expected} market accounts`
      );
    const owners = accounts.map(({ id, data }) => {
      if (data.length !== 64)
        throw new Error("Market account identity is truncated");
      const owner = new PublicKey(data.subarray(0, 32));
      const accountMarket = new PublicKey(data.subarray(32, 64));
      if (
        !accountMarket.equals(this.market) ||
        !marketAccountAddress(owner, this.program.programId).equals(id)
      )
        throw new Error(
          `Market account ${id.toBase58()} belongs to another market`
        );
      return owner;
    });
    if (new Set(owners.map((owner) => owner.toBase58())).size !== owners.length)
      throw new Error("Market account owners are duplicated");
    return owners.sort((a, b) => a.toBase58().localeCompare(b.toBase58()));
  }

  private async unclaimedFees(): Promise<PublicKey[]> {
    const records = await this.scan("feeRecoveryRecord", 8, 32);
    const orders = records.map(({ id, data }) => {
      if (data.length !== 32)
        throw new Error("Fee recovery identity is truncated");
      const order = new PublicKey(data);
      const canonical = PublicKey.findProgramAddressSync(
        [Buffer.from("fee-recovery"), order.toBuffer()],
        this.program.programId
      )[0];
      if (!id.equals(canonical))
        throw new Error("Fee recovery address is not canonical");
      return order;
    });
    if (orders.length === 0) return [];
    const eligible: PublicKey[] = [];
    for (let start = 0; start < orders.length; start += 100) {
      const batch = orders.slice(start, start + 100);
      const infos =
        await this.program.provider.connection.getMultipleAccountsInfo(
          batch,
          "confirmed"
        );
      infos.forEach((info, index) => {
        if (!info?.owner.equals(this.program.programId))
          throw new Error(
            `Fee order ${batch[index].toBase58()} is unavailable`
          );
        const order = this.program.coder.accounts.decode<Order>(
          "orderRecord",
          info.data
        );
        if (
          order.market.equals(this.market) &&
          "trade" in order.kind &&
          "filled" in order.status &&
          !order.feesClaimed
        )
          eligible.push(batch[index]);
      });
    }
    return eligible.sort((a, b) => a.toBase58().localeCompare(b.toBase58()));
  }

  async revealAll(): Promise<{
    accounts: number;
    fees: number;
    signature: string;
  }> {
    const address = this.operator.winddown;
    const info = await this.program.provider.connection.getAccountInfo(
      address,
      "confirmed"
    );
    if (!info?.owner.equals(this.program.programId))
      throw new Error("Committee winddown has not started");
    const winddown = this.program.coder.accounts.decode<Winddown>(
      "winddown",
      info.data
    );
    if (!winddown.market.equals(this.market) || winddown.finalized)
      throw new Error("Winddown is not accepting market-wide recovery");
    const [owners, fees] = await Promise.all([
      this.participants(winddown.expectedAccounts),
      this.unclaimedFees(),
    ]);
    for (const owner of owners)
      await this.operator.reveal(owner, await this.reader.market(owner));
    for (const order of fees)
      await this.operator.revealFee(order, await this.reader.fee(order));
    const signature = await this.operator.finalize();
    return { accounts: owners.length, fees: fees.length, signature };
  }
}
