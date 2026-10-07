import {
  BorshAccountsCoder,
  convertIdlToCamelCase,
  type Idl,
} from "@anchor-lang/core";
import { DEPTH_IDL, DEPTH_PROGRAM_ID } from "@depth/bindings";
import { Connection, PublicKey } from "@solana/web3.js";

export type ChainAccount<T> = { value: T; slot: number };

export class ChainClient {
  private readonly coder = new BorshAccountsCoder(
    convertIdlToCamelCase(DEPTH_IDL as Idl),
  );

  constructor(
    private readonly connection: Connection,
    readonly programId = DEPTH_PROGRAM_ID,
  ) {}

  async read<T>(
    address: PublicKey,
    name: string,
  ): Promise<ChainAccount<T> | undefined> {
    const result = await this.connection.getAccountInfoAndContext(
      address,
      "confirmed",
    );
    if (!result.value) return undefined;
    if (!result.value.owner.equals(this.programId)) {
      throw new Error("Account is not owned by Depth");
    }
    return {
      value: this.coder.decode<T>(
        name[0].toLowerCase() + name.slice(1),
        result.value.data,
      ),
      slot: result.context.slot,
    };
  }

  async identify(
    address: PublicKey,
    names: readonly string[],
  ): Promise<(ChainAccount<unknown> & { name: string }) | undefined> {
    const result = await this.connection.getAccountInfoAndContext(
      address,
      "confirmed",
    );
    if (!result.value) return undefined;
    if (!result.value.owner.equals(this.programId)) {
      throw new Error("Account is not owned by Depth");
    }
    const name = names.find((candidate) =>
      result
        .value!.data.subarray(0, 8)
        .equals(
          this.coder.accountDiscriminator(
            candidate[0].toLowerCase() + candidate.slice(1),
          ),
        ),
    );
    if (!name) return undefined;
    return {
      name,
      value: this.coder.decode(
        name[0].toLowerCase() + name.slice(1),
        result.value.data,
      ),
      slot: result.context.slot,
    };
  }
}
