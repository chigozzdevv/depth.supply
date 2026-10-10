"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { FillPage } from "@depthhq/maker-sdk";
import type { FillSnapshot } from "@depthhq/sdk";
import { useDepth } from "@/shared/depth/session";
import { ArrowUpRight } from "lucide-react";
import { decimal, transactionUrl, short } from "@/shared/depth/format";

export function Fills() {
  const session = useDepth();
  const [state, setState] = useState<{ owner: string; page: FillPage }>();
  const [privateFill, setPrivateFill] = useState<{
    owner: string;
    fill: FillSnapshot;
  }>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const owner = session.maker?.options.maker.toBase58();
  useEffect(() => {
    if (!session.maker || !owner) return;
    let stopped = false;
    void session.maker.fills
      .list({ limit: 20 })
      .then((page) => {
        if (!stopped) {
          setState({ owner, page });
          setError("");
        }
      })
      .catch(() => {
        if (!stopped)
          setError(
            "Finalized fill history is unavailable. Retry with the same wallet.",
          );
      });
    return () => {
      stopped = true;
    };
  }, [session.maker, session.version, owner, refresh]);
  const page = state && state.owner === owner ? state.page : undefined;
  async function more() {
    if (!session.maker || !owner || !page?.cursor) return;
    try {
      const next = await session.maker.fills.list({
        before: page.cursor,
        limit: 20,
      });
      setState({
        owner,
        page: { ...next, fills: [...page.fills, ...next.fills] },
      });
    } catch {
      setError("More fill history is unavailable");
    }
  }
  async function read(id: string) {
    if (!session.maker || !owner) return;
    const maker = session.maker;
    await session.run(
      "Reading authorized maker fill",
      async () => {
        const fill = await maker.fills.get(new PublicKey(id));
        setPrivateFill({ owner, fill });
      },
      false,
    );
  }
  return (
    <div className="operation-list">
      {error && (
        <p role="alert" className="form-error">
          {error}
          <button onClick={() => setRefresh((value) => value + 1)}>
            Retry
          </button>
        </p>
      )}
      {!session.maker ? (
        <div className="records-empty">
          <p>Connect your maker wallet to discover fills.</p>
        </div>
      ) : !page && !error ? (
        <div className="records-empty">
          <p>Loading finalized fill receipts…</p>
        </div>
      ) : page?.fills.length === 0 ? (
        <div className="records-empty">
          <p>No finalized fills found in this history page.</p>
        </div>
      ) : (
        page?.fills.map((fill) => (
          <div key={fill.id} className="operation-row">
            <div>
              <strong>Finalized fill</strong>
              <a
                href={transactionUrl(
                  fill.signature,
                  session.config.environment,
                )}
                target="_blank"
                rel="noreferrer"
                title={fill.signature}
                aria-label={`View fill settlement transaction ${fill.signature}`}
              >
                {short(fill.signature)}
                <ArrowUpRight size={11} />
              </a>
            </div>
            <span>Slot {fill.slot}</span>
            <button
              disabled={Boolean(session.busy)}
              onClick={() => void read(fill.id)}
            >
              Read execution privately
            </button>
          </div>
        ))
      )}
      {page?.cursor && (
        <button className="records-more" onClick={() => void more()}>
          Load more fill receipts
        </button>
      )}
      {privateFill && privateFill.owner === owner && (
        <div className="private-fill">
          <h3>Private execution · {privateFill.fill.status}</h3>
          <p>
            {privateFill.fill.status === "ready"
              ? `${decimal(privateFill.fill.size, 9, 4)} SOL at $${decimal(privateFill.fill.executionPriceE8, 8)} · fee ${decimal(privateFill.fill.fee, 6, 4)} USDC · rebate ${decimal(privateFill.fill.makerRebate, 6, 4)} USDC`
              : "The encrypted view is not ready. Request a fresh view."}
          </p>
        </div>
      )}
    </div>
  );
}
