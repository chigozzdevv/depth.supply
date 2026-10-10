import type { Keypair, PublicKey } from "@solana/web3.js";

export type SignerRole =
  | "deployer"
  | "program"
  | "buffer"
  | "app"
  | "trader"
  | "maker"
  | "localnet"
  | "keeper";
export type SignerOptions = {
  env?: NodeJS.ProcessEnv;
  expectedPublicKey?: PublicKey | string;
};
export function signerPath(role: SignerRole, env?: NodeJS.ProcessEnv): string;
export function readSigner(
  path: string,
  options?: { label?: string; expectedPublicKey?: PublicKey | string },
): Keypair;
export function loadSigner(role: SignerRole, options?: SignerOptions): Keypair;
export function createSigner(
  role: SignerRole,
  options?: SignerOptions,
): Keypair;
