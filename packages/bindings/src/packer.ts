export type CircuitPacker<Input, Output> = {
  pack(data: Input): bigint[];
  unpack(packed: bigint[]): Output;
};
