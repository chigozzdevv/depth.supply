import { appAddress } from "@depth/bindings";
import type { PublicApp } from "@depth/schema";
import { PublicKey } from "@solana/web3.js";
import type { ChainClient } from "@/chain/chain.client";
import { integer } from "@/chain/chain.format";
import type { AppAccount } from "@/app/app.model";

export class AppService {
  constructor(private readonly chain: ChainClient) {}

  async get(app: PublicKey): Promise<PublicApp | undefined> {
    const account = await this.chain.read<AppAccount>(
      appAddress(app, this.chain.programId),
      "AppConfig",
    );
    if (!account) return undefined;
    const { value, slot } = account;
    if (!value.app.equals(app)) throw new Error("App identity mismatch");
    return {
      id: app.toBase58(),
      fee_bps: value.feeBps,
      version: integer(value.version),
      active: value.active,
      slot,
    };
  }
}
