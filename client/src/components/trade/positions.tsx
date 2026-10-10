"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { useDepth } from "@/shared/depth/session";
import type { AccountView } from "@/shared/depth/account";
import type { MarketView } from "@/shared/depth/market";
import { decimal, units } from "@/shared/depth/format";
import { positionPnl, type AmountSelector } from "@depthhq/sdk";
import { tradeFeeBps } from "@/shared/depth/terms";
import { Pnl, type PnlCard } from "@/components/trade/pnl";

export function Positions({
  account,
  view,
}: {
  account: AccountView;
  view: MarketView;
}) {
  const session = useDepth();
  const [card, setCard] = useState<PnlCard>();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{
    read: () => Promise<PnlCard>;
    error: string;
  }>();
  function show(value: PnlCard) {
    setCard(value);
    setPending(undefined);
    setOpen(false);
  }
  return (
    <>
      <Details
        account={account}
        view={view}
        onPnl={show}
        onShare={(value) => {
          setCard(value);
          setOpen(true);
        }}
        onPending={setPending}
      />
      {pending && (
        <div className="position-pnl pending">
          <p role="alert" className="form-error">
            Trade confirmed. {pending.error}
          </p>
          <button
            className="terminal-button quiet"
            disabled={Boolean(session.busy)}
            onClick={() =>
              void session.run(
                "Reading private PnL",
                async () => {
                  show(await pending.read());
                },
                false,
              )
            }
          >
            Retry PnL
          </button>
        </div>
      )}
      {card && card.result.state !== "open" && (
        <div className="position-pnl">
          <span>Execution PnL</span>
          <strong data-loss={card.result.net < 0n}>
            {card.result.net > 0n ? "+" : ""}
            {decimal(card.result.net)} USDC
          </strong>
          <button
            aria-label="Share execution PnL"
            onClick={() => setOpen(true)}
          >
            <Share2 size={15} />
          </button>
        </div>
      )}
      <Pnl card={card} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function Details({
  account,
  view,
  onPnl,
  onShare,
  onPending,
}: {
  account: AccountView;
  view: MarketView;
  onPnl: (card: PnlCard) => void;
  onShare: (card: PnlCard) => void;
  onPending: (pending: { read: () => Promise<PnlCard>; error: string }) => void;
}) {
  const session = useDepth();
  const [action, setAction] = useState("reduce");
  const [amount, setAmount] = useState("25%");
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const position = account.position;
  const ready =
    account.loaded && !account.outdated && position?.status === "ready";
  const hasPosition =
    ready && position?.position !== undefined && position.position !== 0n;
  const valuation =
    hasPosition && position && view.market && !view.stale
      ? positionPnl(
          position,
          BigInt(view.market.oracle_price_e8),
          BigInt(view.market.funding_index),
        )
      : undefined;
  const notional =
    position?.position !== undefined && view.market
      ? ((position.position < 0n ? -position.position : position.position) *
          BigInt(view.market.oracle_price_e8)) /
        100_000_000_000n
      : 0n;
  const fee =
    view.market && view.app
      ? (notional *
          (action === "reverse" ? 2n : 1n) *
          BigInt(10000 + view.market.max_quote_deviation_bps) *
          BigInt(tradeFeeBps(view.market, view.app)) +
          99_999_999n) /
        100_000_000n
      : 0n;
  async function execute() {
    const sdk = session.trader;
    if (!sdk || !position || !view.market || !view.app) return;
    let value: AmountSelector;
    try {
      value =
        amount === "all" || /^(?:10|25|50|100)%$/.test(amount)
          ? (amount as AmountSelector)
          : units(amount, action === "reduce" ? 9 : 6);
    } catch (cause) {
      setError(String(cause));
      return;
    }
    const terms = {
      marketId: "SOL-USD" as const,
      slippageBps: 50,
      maxFee: fee > 0n ? fee : 1n,
      validForSeconds: view.market.max_order_queue_seconds,
    };
    setReview(false);
    await session.run("Updating position", async () => {
      const handle = sdk.position();
      if (action === "add" || action === "remove") {
        const transfer =
          action === "add"
            ? await handle.addMargin(value)
            : await handle.removeMargin(value);
        await transfer.confirm();
      } else {
        const operation =
          action === "close"
            ? await sdk.trade.close(terms)
            : action === "reverse"
              ? await sdk.trade.reverse({
                  ...terms,
                  direction: position.position! > 0n ? "short" : "long",
                  notional,
                  margin: 0n,
                })
              : await sdk.trade.reduce({ ...terms, amount: value });
        await operation.confirm();
        session.notice("Trade confirmed. Reading private PnL.");
        const read = async (): Promise<PnlCard> => ({
          result: await operation.pnl(),
          environment: session.config.environment,
          transaction: () => operation.transaction(),
        });
        try {
          onPnl(await read());
        } catch (cause) {
          onPending({
            read,
            error:
              cause instanceof Error
                ? cause.message
                : "Private PnL could not be read",
          });
        }
      }
      session.notice(
        "Position operation confirmed. Refresh your private view.",
      );
    });
  }
  if (!session.trader)
    return (
      <div className="records-empty">
        <p>Connect wallet to view positions.</p>
      </div>
    );
  if (
    !account.loaded ||
    account.outdated ||
    position?.status === "pending" ||
    position?.status === "stale"
  )
    return (
      <div className="records-empty">
        <button
          className="terminal-button quiet"
          disabled={Boolean(session.busy)}
          onClick={() => void account.read()}
        >
          {account.outdated ? "Refresh positions" : "View positions"}
        </button>
      </div>
    );
  if (!position)
    return (
      <div className="records-empty">
        <h3>No market account yet.</h3>
        <p>Deposit USDC and submit your first trade to get started.</p>
      </div>
    );
  return (
    <div className="position-details">
      <div className="position-stats">
        <div>
          <span>Market</span>
          <strong>SOL / USDC</strong>
        </div>
        <div>
          <span>Position</span>
          <strong>
            {hasPosition
              ? `${position.position! > 0n ? "Long" : "Short"} ${decimal(position.position! < 0n ? -position.position! : position.position!, 9, 4)} SOL`
              : "No open exposure"}
          </strong>
        </div>
        <div>
          <span>Entry price</span>
          <strong>
            {hasPosition ? `$${decimal(position.entryPriceE8, 8)}` : "—"}
          </strong>
        </div>
        <div>
          <span>Collateral</span>
          <strong>{decimal(position.collateral)} USDC</strong>
        </div>
        <div>
          <span>Reserved</span>
          <strong>{decimal(position.reserved)} USDC</strong>
        </div>
        {hasPosition && (
          <div className="position-value">
            <span>PnL</span>
            <div>
              <strong data-loss={valuation ? valuation.net < 0n : undefined}>
                {valuation
                  ? `${valuation.net > 0n ? "+" : ""}${decimal(valuation.net)} USDC`
                  : "—"}
              </strong>
              <button
                aria-label="Share position PnL"
                disabled={!valuation || Boolean(session.busy)}
                onClick={() =>
                  valuation &&
                  onShare({
                    result: valuation,
                    environment: session.config.environment,
                    transaction: () => session.trader!.position().transaction(),
                  })
                }
              >
                <Share2 size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="position-controls">
        <select
          aria-label="Position operation"
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setReview(false);
          }}
        >
          <option value="reduce">Reduce position</option>
          <option value="close">Close position</option>
          <option value="reverse">Reverse same exposure</option>
          <option value="add">Add margin</option>
          <option value="remove">Remove margin</option>
        </select>
        {action !== "close" && action !== "reverse" && (
          <input
            aria-label="Position amount"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setReview(false);
            }}
            placeholder="25%, all, or exact amount"
          />
        )}
        <button
          className="terminal-button"
          disabled={
            Boolean(session.busy) ||
            ((action === "close" ||
              action === "reduce" ||
              action === "reverse") &&
              (!hasPosition || !view.ready))
          }
          onClick={() => (review ? void execute() : setReview(true))}
        >
          {review ? "Approve in wallet" : "Review operation"}
        </button>
      </div>
      {review && (
        <p className="position-review">
          {action === "reverse"
            ? "Close the current position and open the same exposure on the opposite side."
            : action === "close"
              ? "Close the full position."
              : `${action === "reduce" ? "Reduce exposure by" : action === "add" ? "Add margin of" : "Remove margin of"} ${amount}${/^(?:all|\d+%)$/.test(amount) ? "" : action === "reduce" ? " SOL" : " USDC"}.`}{" "}
          {["reduce", "close", "reverse"].includes(action) &&
            `Slippage limit 0.5%. Fee cap ${decimal(fee > 0n ? fee : 1n, 6, 6)} USDC.`}
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
