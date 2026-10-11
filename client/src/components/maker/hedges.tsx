"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { MakerClient, MakerHedgeView } from "@depthhq/maker-sdk";
import { useDepth } from "@/shared/depth/session";
import { AccountPrompt } from "@/components/demo/prompt";
import { decimal, short } from "@/shared/depth/format";

export function Hedges() {
  const session = useDepth();
  const [view, setView] = useState<MakerHedgeView>();
  const [authorizedFor, setAuthorizedFor] = useState<MakerClient>();
  const authorized = Boolean(session.maker && authorizedFor === session.maker);
  const [error, setError] = useState("");
  const owner = session.maker?.options.maker.toBase58();
  useEffect(() => {
    if (!session.maker || !authorized) return;
    const maker = session.maker;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const next = await maker.hedges.summary();
        if (!stopped) {
          setView(next);
          setError("");
        }
      } catch (cause) {
        if (!stopped) {
          setView(undefined);
          setError(
            cause instanceof Error
              ? cause.message
              : "Hedge history is unavailable",
          );
        }
      } finally {
        if (!stopped) timer = setTimeout(read, 5000);
      }
    }
    void read();
    return () => {
      stopped = true;
      clearTimeout(timer);
      maker.hedges.disconnect();
    };
  }, [session.maker, authorized]);
  async function authorize() {
    if (!session.maker) return;
    const maker = session.maker;
    await session.run(
      "Authorize hedge history",
      async () => {
        await maker.hedges.authorize();
        setView(await maker.hedges.summary());
        setAuthorizedFor(maker);
        setError("");
      },
      false,
    );
  }
  const current = authorized && view?.maker === owner ? view : undefined;
  const snapshot = current?.snapshot;
  const amount = (value?: string) =>
    decimal(value === undefined ? undefined : BigInt(value), 9, 4);
  return (
    <div className="operation-list">
      {!session.maker || !authorized ? (
        <div className="records-empty">
          {session.maker ? (
            <p>View your maker’s hedge activity.</p>
          ) : (
            <AccountPrompt>Connect your maker wallet.</AccountPrompt>
          )}
          {session.maker && (
            <button
              className="records-more"
              disabled={Boolean(session.busy)}
              onClick={() => void authorize()}
            >
              View hedges
            </button>
          )}
        </div>
      ) : error ? (
        <div className="records-empty">
          <p role="alert">{error}</p>
          <button
            className="records-more"
            disabled={Boolean(session.busy)}
            onClick={() => void authorize()}
          >
            Reconnect
          </button>
        </div>
      ) : current && !current.enabled ? (
        <div className="records-empty">
          <p>Automatic hedging is off.</p>
        </div>
      ) : !snapshot ? (
        <div className="records-empty">
          <p>Waiting for the maker worker.</p>
        </div>
      ) : (
        <>
          <div className="hedge-summary">
            <div>
              <span>Depth position</span>
              <strong>{amount(snapshot.depthPosition)} SOL</strong>
            </div>
            <div>
              <span>Hedge position</span>
              <strong>{amount(snapshot.externalPosition)} SOL</strong>
            </div>
            <div>
              <span>Net exposure</span>
              <strong>{amount(snapshot.unhedgedPosition)} SOL</strong>
            </div>
            <div>
              <span>Hyperliquid · {snapshot.network}</span>
              <strong className="hedge-phase">{snapshot.phase}</strong>
            </div>
          </div>
          {snapshot.reason && <p className="hedge-reason">{snapshot.reason}</p>}
          {snapshot.pending && (
            <div className="operation-row">
              <strong>
                {snapshot.pending.buy ? "Buy" : "Sell"}{" "}
                {amount(snapshot.pending.size)} SOL
              </strong>
              <span>Confirming</span>
              <span>{short(snapshot.pending.cloid)}</span>
            </div>
          )}
          {[...snapshot.history].reverse().map((order) => (
            <div key={order.cloid} className="operation-row">
              <div>
                <strong>
                  {order.buy ? "Buy" : "Sell"} {amount(order.filledSize)} SOL
                </strong>
                <span className="hedge-time">
                  {new Date(order.completedAt).toLocaleString()}
                </span>
              </div>
              <span>{order.status}</span>
              <span>
                $
                {order.averagePriceE8
                  ? decimal(BigInt(order.averagePriceE8), 8)
                  : "—"}
              </span>
              <div className="hedge-links">
                {order.hashes?.map((hash) => (
                  <a
                    key={hash}
                    href={`https://app.hyperliquid${snapshot.network === "testnet" ? "-testnet" : ""}.xyz/explorer/tx/${hash}`}
                    target="_blank"
                    rel="noreferrer"
                    title={hash}
                  >
                    {short(hash)}
                    <ArrowUpRight size={11} />
                  </a>
                ))}
              </div>
            </div>
          ))}
          {!snapshot.history.length && !snapshot.pending && (
            <div className="records-empty">
              <p>No hedge executions yet.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
