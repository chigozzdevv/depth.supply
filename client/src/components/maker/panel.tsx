"use client";

import { useCallback, useState } from "react";
import type { AutomationView, QuoteSnapshot } from "@depthhq/maker-sdk";
import { Automation } from "@/components/maker/automation";
import { QuoteTicket } from "@/components/maker/ticket";
import { manualQuoteAllowed, readAutomation } from "@/shared/depth/automation";
import type { MarketView } from "@/shared/depth/market";
import { useDepth } from "@/shared/depth/session";

export type QuoteMode = "manual" | "automatic";
export function MakerPanel({
  view,
  quotes,
  mode,
  onMode,
}: {
  view: MarketView;
  quotes: QuoteSnapshot[];
  mode: QuoteMode;
  onMode: (mode: QuoteMode) => void;
}) {
  const session = useDepth();
  const [profile, setProfile] = useState<AutomationView | null>();
  const update = useCallback((value: AutomationView | null | undefined) => {
    setProfile((previous) => {
      if (previous && value === null) return previous;
      if (
        previous &&
        value &&
        (previous.revision > value.revision ||
          (previous.revision === value.revision &&
            previous.updatedAt > value.updatedAt))
      )
        return previous;
      return value;
    });
  }, []);
  const read = useCallback(
    async (authorize = false) => {
      if (!session.maker) throw new Error("Connect your maker wallet");
      return readAutomation(session.maker, authorize);
    },
    [session.maker],
  );
  async function checkManual() {
    const value = await read(true);
    update(value);
    if (!manualQuoteAllowed(value))
      throw new Error("Pause automation before publishing a manual quote");
  }
  return (
    <section className="maker-panel" aria-label="Maker quoting">
      <div className="maker-modes" role="tablist" aria-label="Quote mode">
        {(["manual", "automatic"] as const).map((value) => (
          <button
            key={value}
            id={`maker-${value}-tab`}
            type="button"
            role="tab"
            aria-selected={mode === value}
            aria-controls={`maker-${value}-panel`}
            tabIndex={mode === value ? 0 : -1}
            disabled={Boolean(session.busy)}
            onClick={() => onMode(value)}
            onKeyDown={(event) => {
              if (session.busy) return;
              const next =
                event.key === "Home"
                  ? "manual"
                  : event.key === "End"
                    ? "automatic"
                    : ["ArrowLeft", "ArrowRight"].includes(event.key)
                      ? mode === "manual"
                        ? "automatic"
                        : "manual"
                      : undefined;
              if (!next) return;
              event.preventDefault();
              onMode(next);
              document.getElementById(`maker-${next}-tab`)?.focus();
            }}
          >
            {value === "manual" ? "Manual" : "Automatic"}
          </button>
        ))}
      </div>
      <div
        id="maker-manual-panel"
        role="tabpanel"
        aria-labelledby="maker-manual-tab"
        hidden={mode !== "manual"}
      >
        <QuoteTicket
          view={view}
          quotes={quotes}
          blocked={profile !== undefined && !manualQuoteAllowed(profile)}
          checkManual={checkManual}
          onAutomatic={() => onMode("automatic")}
        />
      </div>
      <div
        id="maker-automatic-panel"
        role="tabpanel"
        aria-labelledby="maker-automatic-tab"
        hidden={mode !== "automatic"}
      >
        <Automation profile={profile} onProfile={update} read={read} />
      </div>
    </section>
  );
}
