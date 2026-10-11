"use client";

import { useEffect, useMemo, useState } from "react";
import type { PendingItem, PendingPage } from "@depthhq/sdk";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useDepth } from "@/shared/depth/session";
import { AccountPrompt } from "@/components/demo/prompt";
import type { AccountView } from "@/shared/depth/account";
import type { MarketView } from "@/shared/depth/market";
import { Positions } from "@/components/trade/positions";
import { Execution } from "@/components/trade/execution";
import { decimal, short, transactionUrl } from "@/shared/depth/format";
import { useTransactions, transactionKey } from "@/shared/depth/transactions";

const terminal = new Set([
  "credited",
  "settled",
  "paid",
  "refunded",
  "rejected",
  "cancelled",
  "filled",
]);
export function Records({
  account,
  view,
}: {
  account: AccountView;
  view: MarketView;
}) {
  const session = useDepth();
  const [tab, setTab] = useState("positions");
  const [state, setState] = useState<{
    owner: string;
    kind: string;
    page: PendingPage;
  }>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const owner = session.trader?.options.wallet.publicKey.toBase58();
  useEffect(() => {
    if (!session.trader || !owner || tab === "positions") return;
    const sdk = session.trader;
    let stopped = false;
    const discovery =
      tab === "pending" ? sdk.account().pending : sdk.account().history;
    void discovery({ limit: 20 })
      .then((page) => {
        if (!stopped) {
          setState({ owner, kind: tab, page });
          setError("");
        }
      })
      .catch(() => {
        if (!stopped)
          setError(
            "Operation discovery is unavailable. Retry to recover your receipts.",
          );
      });
    return () => {
      stopped = true;
    };
  }, [session.trader, session.version, revision, owner, tab]);
  const page =
    state && state.owner === owner && state.kind === tab
      ? state.page
      : undefined;
  const pending = useMemo(
    () => page?.items.filter((item) => !terminal.has(item.status)),
    [page],
  );
  const items = tab === "pending" ? pending : page?.items;
  const transactions = useTransactions(tab === "positions" ? undefined : items);
  async function more() {
    if (!session.trader || !owner || !page?.nextCursor) return;
    try {
      const account = session.trader.account();
      const discovery = tab === "pending" ? account.pending : account.history;
      const next = await discovery({ cursor: page.nextCursor, limit: 20 });
      setState({
        owner,
        kind: tab,
        page: {
          items: [...page.items, ...next.items],
          nextCursor: next.nextCursor,
        },
      });
    } catch {
      setError("More operations could not be loaded");
    }
  }
  async function resume(item: PendingItem, cancel = false) {
    const sdk = session.trader;
    if (!sdk) return;
    await session.run(
      cancel ? "Cancelling pending operation" : "Resuming existing receipt",
      async () => {
        if (item.kind === "deposit") {
          const handle = sdk.account().depositHandle(item.nonce);
          if (cancel) await handle.cancel();
          else await handle.confirm();
        } else if (item.kind === "withdrawal") {
          const handle = sdk.account().withdrawalHandle(item.nonce);
          if (cancel) await handle.cancel();
          else await handle.confirm();
        } else if (item.kind === "allocation" || item.kind === "release") {
          const handle = sdk.account().transferHandle(item.nonce);
          if (cancel) await handle.cancel();
          else await handle.confirm();
        } else if (item.kind === "trade") {
          const handle = sdk.trade.operation(item.nonce);
          if (cancel) await handle.cancel();
          else await handle.confirm();
        } else
          throw new Error("The settlement keeper progresses risk operations");
        session.notice("Receipt reconciled with the chain");
      },
    );
  }
  return (
    <section className="records-panel">
      <div className="records-heading">
        <div role="tablist" aria-label="Account records">
          {["positions", "pending", "activity"].map((value) => (
            <button
              role="tab"
              aria-selected={tab === value}
              key={value}
              onClick={() => setTab(value)}
            >
              {value === "positions"
                ? "Positions"
                : value === "pending"
                  ? "Pending"
                  : "Activity"}
              {value === "pending" && pending && <span>{pending.length}</span>}
            </button>
          ))}
        </div>
        <button
          aria-label="Refresh operation records"
          onClick={() => setRevision((value) => value + 1)}
          disabled={!session.trader}
        >
          <RefreshCw size={13} />
        </button>
      </div>
      <div hidden={tab !== "positions"}>
        <Positions key={owner} account={account} view={view} />
      </div>
      {tab !== "positions" && (
        <div className="operation-list">
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {!session.trader ? (
            <div className="records-empty">
              <AccountPrompt>
                {tab === "pending"
                  ? "Connect wallet to view pending operations."
                  : "Connect wallet to view activity."}
              </AccountPrompt>
            </div>
          ) : !page && !error ? (
            <div className="records-empty">
              <p>
                {tab === "pending"
                  ? "Loading pending operations…"
                  : "Loading activity…"}
              </p>
            </div>
          ) : items?.length === 0 ? (
            <div className="records-empty">
              <p>
                {tab === "pending"
                  ? "No pending operations."
                  : "No activity on this page."}
              </p>
            </div>
          ) : (
            items?.map((item) => {
              const tx = transactions.values?.[transactionKey(item)];
              return (
                <div
                  className="operation-row"
                  key={`${owner}:${item.id.toBase58()}`}
                >
                  <div>
                    <strong>{item.kind}</strong>
                    {tx?.transaction ? (
                      <a
                        href={transactionUrl(
                          tx.transaction.signature,
                          session.config.environment,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        title={tx.transaction.signature}
                        aria-label={`View ${item.kind} transaction ${tx.transaction.signature}`}
                      >
                        {short(tx.transaction.signature)}
                        <ArrowUpRight size={11} />
                      </a>
                    ) : tx?.error ? (
                      <button
                        className="receipt-transaction"
                        title={tx.error}
                        onClick={() => void transactions.retry(item)}
                      >
                        Retry tx <ArrowUpRight size={11} />
                      </button>
                    ) : (
                      <span
                        className="receipt-transaction"
                        aria-label="Loading transaction"
                      >
                        … <ArrowUpRight size={11} />
                      </span>
                    )}
                  </div>
                  <span className="receipt-state">{item.status}</span>
                  {tx?.transaction && (
                    <div className="receipt-detail">
                      {tx.transaction.amount !== undefined && (
                        <span>{decimal(tx.transaction.amount)} USDC</span>
                      )}
                      {tx.transaction.timestamp !== undefined && (
                        <time
                          dateTime={new Date(
                            tx.transaction.timestamp * 1000,
                          ).toISOString()}
                        >
                          {new Date(
                            tx.transaction.timestamp * 1000,
                          ).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      )}
                    </div>
                  )}
                  {tab === "activity" &&
                    item.kind === "trade" &&
                    item.status === "filled" && <Execution item={item} />}
                  {!terminal.has(item.status) && item.kind !== "risk" && (
                    <div className="operation-actions">
                      <button
                        disabled={Boolean(session.busy)}
                        onClick={() => void resume(item)}
                        title="Continue this receipt without submitting a new operation"
                      >
                        Resume
                      </button>
                      <button
                        disabled={Boolean(session.busy)}
                        onClick={() => void resume(item, true)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {page?.nextCursor && (
            <button className="records-more" onClick={() => void more()}>
              Load more receipts
            </button>
          )}
        </div>
      )}
    </section>
  );
}
