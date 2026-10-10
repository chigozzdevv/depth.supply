"use client";

import { PublicKey } from "@solana/web3.js";
import type { QuoteSnapshot } from "@depthhq/maker-sdk";
import { useDepth } from "@/shared/depth/session";
import { decimal, explorer, short } from "@/shared/depth/format";
import { useState } from "react";

export function Quotes({
  items,
  error,
  more,
}: {
  items?: QuoteSnapshot[];
  error: string;
  more?: () => Promise<void>;
}) {
  const session = useDepth();
  const [capacity, setCapacity] = useState<
    Record<string, { owner: string; version: number; amount: bigint }>
  >({});
  async function action(id: string, kind: "resume" | "cancel" | "capacity") {
    if (!session.maker) return;
    const quote = session.maker.quote.get(new PublicKey(id));
    await session.run(
      kind === "capacity"
        ? "Reading private quote capacity"
        : kind === "cancel"
          ? "Stopping quote"
          : "Resuming quote activation",
      async () => {
        if (kind === "capacity") {
          const remaining = await quote.capacity();
          setCapacity((previous) => ({
            ...previous,
            [id]: {
              owner: session.maker!.options.maker.toBase58(),
              version: session.version,
              amount: remaining,
            },
          }));
        } else if (kind === "cancel") {
          const snapshot = await quote.cancel();
          session.notice(
            `Quote ${snapshot.status}${snapshot.attachedOrders ? "; attached orders must settle before margin releases" : ""}`,
          );
        } else {
          await quote.confirm();
          session.notice("Quote active");
        }
      },
      kind !== "capacity",
    );
  }
  if (!session.maker)
    return (
      <div className="records-empty">
        <p>Connect wallet to view quotes.</p>
      </div>
    );
  return (
    <div className="quote-list">
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!items && !error ? (
        <div className="records-empty">
          <p>Loading canonical quotes…</p>
        </div>
      ) : items?.length === 0 ? (
        <div className="records-empty">
          <h3>No quotes published yet.</h3>
          <p>
            Allocate collateral, then publish your first encrypted bid and ask.
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Quote</th>
                <th>Status</th>
                <th>Max capacity</th>
                <th>Attached orders</th>
                <th>Remaining capacity</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items?.map((quote) => (
                <tr key={quote.id}>
                  <td>
                    <a
                      href={explorer(quote.id, session.config.environment)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(quote.id)}
                    </a>
                  </td>
                  <td>{quote.status}</td>
                  <td>{decimal(quote.maxCapacity)} USDC</td>
                  <td>{quote.attachedOrders}</td>
                  <td>
                    {capacity[quote.id]?.owner !==
                      session.maker?.options.maker.toBase58() ||
                    capacity[quote.id]?.version !== session.version ? (
                      <button
                        disabled={
                          Boolean(session.busy) ||
                          !["active", "closing"].includes(quote.status)
                        }
                        onClick={() => void action(quote.id, "capacity")}
                      >
                        Read privately
                      </button>
                    ) : (
                      <>
                        <span>
                          {decimal(capacity[quote.id].amount)} USDC · snapshot
                        </span>
                        <button
                          disabled={Boolean(session.busy)}
                          onClick={() => void action(quote.id, "capacity")}
                        >
                          Refresh
                        </button>
                      </>
                    )}
                  </td>
                  <td className="quote-actions">
                    {["validating", "validated", "waiting"].includes(
                      quote.status,
                    ) && (
                      <button
                        disabled={Boolean(session.busy)}
                        onClick={() => void action(quote.id, "resume")}
                      >
                        Resume
                      </button>
                    )}
                    {[
                      "validating",
                      "validated",
                      "active",
                      "waiting",
                      "closing",
                    ].includes(quote.status) && (
                      <button
                        disabled={Boolean(session.busy)}
                        onClick={() => void action(quote.id, "cancel")}
                      >
                        Stop
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {more && (
        <button className="records-more" onClick={() => void more()}>
          Load more quotes
        </button>
      )}
    </div>
  );
}
