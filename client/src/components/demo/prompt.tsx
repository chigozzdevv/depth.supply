"use client";

import type { ReactNode } from "react";
import { useDepth } from "@/shared/depth/session";

export function AccountPrompt({ children }: { children: ReactNode }) {
  const session = useDepth();
  return (
    <p>
      {!session.connected
        ? children
        : session.verifying
          ? "Loading account…"
          : "Account unavailable"}
    </p>
  );
}
