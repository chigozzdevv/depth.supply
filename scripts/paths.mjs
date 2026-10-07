import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

export function resolvePath(value) {
  return resolve(repositoryRoot, value);
}

export function settingPath(name, fallback, env = process.env) {
  const value = env[name] || fallback;
  return value ? resolvePath(value) : undefined;
}
