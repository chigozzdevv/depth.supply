import { marketAddress, SOL_USD_MARKET_ID } from "@depth/bindings";
import type { PublicRecovery, PublicWinddown } from "@depth/schema";
import { PublicKey } from "@solana/web3.js";
import type { ChainClient } from "@/chain/chain.client";
import { integer } from "@/chain/chain.format";
import type {
  RecoveryAccount,
  WinddownAccount,
} from "@/recovery/recovery.model";

export class RecoveryService {
  constructor(private readonly chain: ChainClient) {}

  async config(): Promise<PublicRecovery | undefined> {
    const market = marketAddress(this.chain.programId);
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from("recovery-config"), market.toBuffer()],
      this.chain.programId,
    );
    const account = await this.chain.read<RecoveryAccount>(
      address,
      "RecoveryConfig",
    );
    if (!account) return undefined;
    if (!account.value.market.equals(market)) {
      throw new Error("Recovery config belongs to another market");
    }
    return {
      market_id: SOL_USD_MARKET_ID,
      recovery_key: Buffer.from(account.value.recoveryKey).toString("hex"),
      signers: account.value.signers.map((signer) => signer.toBase58()),
      threshold: 3,
      account_count: account.value.accountCount,
      slot: account.slot,
    };
  }

  async winddown(): Promise<PublicWinddown | undefined> {
    const market = marketAddress(this.chain.programId);
    const [address] = PublicKey.findProgramAddressSync(
      [Buffer.from("winddown"), market.toBuffer()],
      this.chain.programId,
    );
    const account = await this.chain.read<WinddownAccount>(address, "Winddown");
    if (!account) return undefined;
    const { value, slot } = account;
    if (!value.market.equals(market)) {
      throw new Error("Winddown belongs to another market");
    }
    return {
      market_id: SOL_USD_MARKET_ID,
      price_e8: integer(value.priceE8),
      funding_index: integer(value.fundingIndex),
      expected_accounts: value.expectedAccounts,
      revealed_accounts: value.revealedAccounts,
      paid_accounts: value.paidAccounts,
      gross_positive: integer(value.grossPositive),
      payout_pool: integer(value.payoutPool),
      remaining_pool: integer(value.remainingPool),
      finalized: value.finalized,
      slot,
    };
  }
}
