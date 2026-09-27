import { PublicKey } from "@solana/web3.js";
import type { ChainSigner } from "@/shared/chain/chain.signer";

export class ChainScan {
  private keys: PublicKey[] = [];
  private cursor = 0;
  private refreshed = 0;

  constructor(
    private readonly chain: ChainSigner,
    private readonly name: string,
    private readonly filters: { offset: number; bytes: string }[],
  ) {}

  async next<T>(): Promise<Array<{ address: PublicKey; state: T }>> {
    if (Date.now() - this.refreshed >= 30_000 && this.cursor === 0) {
      const accounts = await this.chain.connection.getProgramAccounts(
        this.chain.program.programId,
        {
          commitment: "confirmed",
          dataSlice: { offset: 0, length: 0 },
          filters: [
            this.chain.program.coder.accounts.memcmp(
              this.name[0].toLowerCase() + this.name.slice(1),
            ),
            ...this.filters,
          ].map((memcmp) => ({ memcmp })),
        },
      );
      this.keys = accounts
        .map((account) => account.pubkey)
        .sort((a, b) => a.toBase58().localeCompare(b.toBase58()));
      this.refreshed = Date.now();
    }
    const keys = this.keys.slice(this.cursor, this.cursor + 32);
    this.cursor =
      this.cursor + keys.length >= this.keys.length
        ? 0
        : this.cursor + keys.length;
    if (!keys.length) return [];
    const accounts = await this.chain.connection.getMultipleAccountsInfo(
      keys,
      "confirmed",
    );
    return accounts.flatMap((account, index) => {
      if (!account || !account.owner.equals(this.chain.program.programId))
        return [];
      return [
        {
          address: keys[index],
          state: this.chain.program.coder.accounts.decode<T>(
            this.name[0].toLowerCase() + this.name.slice(1),
            account.data,
          ),
        },
      ];
    });
  }
}
