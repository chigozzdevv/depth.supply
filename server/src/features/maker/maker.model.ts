import type { MakerHedgeView } from "@depthhq/maker-sdk";
import type { HedgeSnapshot } from "@depthhq/maker-sdk/node";

export const makerView = (
  maker: string,
  enabled: boolean,
  snapshot?: HedgeSnapshot,
): MakerHedgeView =>
  JSON.parse(
    JSON.stringify(
      { maker, enabled, snapshot: snapshot ?? null },
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    ),
  );
