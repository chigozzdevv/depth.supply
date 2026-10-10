"use client";

import dynamic from "next/dynamic";
import type { DemoConfig } from "@/shared/config/runtime";

const Trading = dynamic(
  () => import("@/components/trade/screen").then((module) => module.Trading),
  {
    ssr: false,
    loading: () => (
      <div className="terminal-loading">Loading trading interface…</div>
    ),
  },
);
const Making = dynamic(
  () => import("@/components/maker/screen").then((module) => module.Making),
  {
    ssr: false,
    loading: () => (
      <div className="terminal-loading">Loading maker interface…</div>
    ),
  },
);
export function Demo({
  config,
  role,
}: {
  config: DemoConfig;
  role: "trade" | "maker";
}) {
  return role === "trade" ? (
    <Trading config={config} />
  ) : (
    <Making config={config} />
  );
}
