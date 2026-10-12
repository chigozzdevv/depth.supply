import type { Depth as GeneratedDepth } from "@/generated";
import type { AnchorProvider, BN } from "@anchor-lang/core";
import { getArciumProgram } from "@arcium-hq/client";
import { PublicKey } from "@solana/web3.js";

type NamedType<T> = T extends { defined: { name: infer N } }
  ? N
  : T extends { array: [infer V, number] }
  ? NamedType<V>
  : T extends { vec: infer V } | { option: infer V }
  ? NamedType<V>
  : never;
type Filter<
  T extends unknown[],
  Match,
  Result extends unknown[] = []
> = T extends [infer Head, ...infer Tail]
  ? Filter<Tail, Match, Head extends Match ? [...Result, Head] : Result>
  : Result;
type Instruction = Exclude<
  GeneratedDepth["instructions"][number],
  { name: `${string}Callback` }
>;
type AccountName = GeneratedDepth["accounts"][number]["name"];
type Account = Extract<GeneratedDepth["types"][number], { name: AccountName }>;
type FieldType = Account["type"] extends { fields: infer F }
  ? F extends { type: infer T }[]
    ? T
    : never
  : never;

// Arcium dispatches callbacks, so test clients only type callable instructions.
export type Depth = Omit<GeneratedDepth, "instructions" | "types"> & {
  instructions: Filter<GeneratedDepth["instructions"], Instruction>;
  types: Filter<
    GeneratedDepth["types"],
    {
      name:
        | AccountName
        | NamedType<FieldType>
        | NamedType<Instruction["args"][number]["type"]>;
    }
  >;
};

export function readMxe(provider: AnchorProvider, address: PublicKey) {
  const arcium = getArciumProgram(provider) as unknown as {
    account: {
      mxeAccount: { fetch(address: PublicKey): Promise<{ lutOffsetSlot: BN }> };
    };
  };
  return arcium.account.mxeAccount.fetch(address);
}
