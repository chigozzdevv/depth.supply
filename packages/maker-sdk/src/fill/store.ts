import { FillCursorStore } from "@/fill/cursor";

export function createCursorStore(
  genesis: string,
  maker: string,
  directory?: string,
) {
  return new FillCursorStore(genesis, maker, directory);
}
