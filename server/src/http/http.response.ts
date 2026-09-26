import type { FastifyReply } from "fastify";
import { PublicKey } from "@solana/web3.js";

export function address(value: string): PublicKey | undefined {
  try {
    const key = new PublicKey(value);
    return key.toBase58() === value ? key : undefined;
  } catch {
    return undefined;
  }
}

export function found<T>(
  reply: FastifyReply,
  value: T | undefined,
): T | FastifyReply {
  return value === undefined
    ? reply.code(404).send({ error: "not_found" })
    : value;
}
