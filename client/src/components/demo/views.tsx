"use client";

import { useEffect, useState } from "react";
import { useDepth } from "@/shared/depth/session";
import { errorMessage } from "@/shared/depth/error";

export function PrivateViews() {
  const session = useDepth();
  const [active, setActive] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const views = session.trader?.views;
  useEffect(() => {
    let cancelled = false;
    if (views)
      void views
        .status()
        .then((status) => {
          if (!cancelled) setActive(status.active);
        })
        .catch((cause) => {
          if (!cancelled) setError(errorMessage(cause));
        });
    return () => {
      cancelled = true;
    };
  }, [views]);
  if (!views) return null;
  return (
    <>
      <div className="wallet-views">
        <span>Private reads</span>
        <button
          className="terminal-button secondary"
          disabled={busy || active === undefined || !!session.busy}
          onClick={() => {
            setBusy(true);
            setError("");
            void (active ? views.revoke() : views.authorize())
              .then(() => setActive(!active))
              .catch((cause) => setError(errorMessage(cause)))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Confirming…" : active ? "Revoke" : "Enable"}
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </>
  );
}
