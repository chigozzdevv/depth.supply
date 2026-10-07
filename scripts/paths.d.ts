export const repositoryRoot: string;
export function resolvePath(value: string): string;
export function settingPath(
  name: string,
  fallback: string,
  env?: NodeJS.ProcessEnv
): string;
export function settingPath(
  name: string,
  fallback?: string,
  env?: NodeJS.ProcessEnv
): string | undefined;
