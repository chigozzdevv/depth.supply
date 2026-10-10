"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import type { FlatQuoteInput } from "@depthhq/maker-sdk";
import { useDepth } from "@/shared/depth/session";
import type { MarketView } from "@/shared/depth/market";
import { decimal, nonce, units } from "@/shared/depth/format";
import { WalletButton } from "@/components/demo/wallet";

export function QuoteTicket({
  view,
  quotes,
}: {
  view: MarketView;
  quotes: { id: string; status: string }[];
}) {
  const session = useDepth();
  const [bid, setBid] = useState("");
  const [ask, setAsk] = useState("");
  const [capacity, setCapacity] = useState("");
  const [duration, setDuration] = useState("120");
  const [prior, setPrior] = useState("");
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<{
    input: FlatQuoteInput;
    prior: string;
  } | null>(null);
  let reservation: bigint | undefined;
  try {
    if (view.market && capacity)
      reservation =
        (units(capacity) * BigInt(view.market.initial_margin_bps) + 9999n) /
        10000n;
  } catch {
    /* Validation runs before review. */
  }
  const allowed = Boolean(
    view.market &&
    ["active", "draft"].includes(view.market.status) &&
    !view.stale &&
    !view.error &&
    view.market.incident === "none" &&
    (view.market.status === "draft" || !view.fundingOverdue),
  );
  function prepare() {
    try {
      if (!session.maker || !view.market || !allowed)
        throw new Error(view.error || "A fresh market oracle is required");
      const bidE8 = units(bid, 8);
      const askE8 = units(ask, 8);
      const maxCapacity = units(capacity);
      const validForSeconds = Number(duration);
      if (bidE8 <= 0n || bidE8 >= askE8)
        throw new Error("Ask must be greater than a positive bid");
      if (
        maxCapacity < BigInt(view.market.quote_tiers[0]) ||
        maxCapacity > BigInt(view.market.max_account_notional)
      )
        throw new Error(
          "Capacity is outside the published market tiers and limit",
        );
      if (
        !Number.isInteger(validForSeconds) ||
        validForSeconds < 1 ||
        validForSeconds > view.market.max_quote_lifetime_seconds
      )
        throw new Error(
          `Quote duration must be 1–${view.market.max_quote_lifetime_seconds} seconds`,
        );
      setDraft({
        input: {
          marketId: "SOL-USD",
          bidE8,
          askE8,
          maxCapacity,
          validForSeconds,
          clientNonce: nonce(),
        },
        prior,
      });
      setError("");
      setReview(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid quote");
    }
  }
  async function submit() {
    if (!session.maker || !draft) return;
    const maker = session.maker;
    const terms = draft;
    setReview(false);
    setPending(true);
    await session.run(
      terms.prior ? "Replacing encrypted quote" : "Publishing encrypted quote",
      async () => {
        const quote = terms.prior
          ? await maker.quote.replace(new PublicKey(terms.prior), terms.input)
          : await maker.quote.publish(terms.input);
        session.notice(`Quote ${quote.id.toBase58()} submitted`);
        await quote.confirm();
        setPending(false);
        setDraft(null);
        session.notice("Quote active. Maker prices remain encrypted.");
      },
    );
  }
  async function reconcile() {
    if (!session.maker || !draft) return;
    const maker = session.maker;
    const terms = draft;
    await session.run("Reconciling the original quote", async () => {
      const quote = terms.prior
        ? await maker.quote
            .replacement(new PublicKey(terms.prior), terms.input.clientNonce!)
            .resume(terms.input)
        : await maker.quote.publish(terms.input);
      const status = await quote.status();
      if (["rejected", "cancelled", "filled"].includes(status.status)) {
        setPending(false);
        setDraft(null);
        session.notice(`Quote ${status.status}`);
        return;
      }
      await quote.confirm();
      setPending(false);
      setDraft(null);
      session.notice("Quote active");
    });
  }
  return (
    <section
      className="ticket-panel"
      aria-label="Publish encrypted maker quotes"
    >
      <div className="ticket-heading">
        <h2>Quote the market</h2>
      </div>
      <label className="field-label">
        Publication
        <select
          value={prior}
          disabled={pending}
          onChange={(event) => {
            setPrior(event.target.value);
            setReview(false);
          }}
        >
          <option value="">New quote</option>
          {quotes
            .filter((quote) =>
              ["active", "waiting", "closing"].includes(quote.status),
            )
            .map((quote) => (
              <option key={quote.id} value={quote.id}>
                Replace {quote.id.slice(0, 8)}…
              </option>
            ))}
        </select>
      </label>
      <div className="quote-prices">
        <label className="field-label">
          Bid
          <div className="input-unit">
            <input
              value={bid}
              disabled={pending}
              inputMode="decimal"
              placeholder="0.00"
              onChange={(event) => {
                setBid(event.target.value);
                setReview(false);
              }}
            />
            <span>$</span>
          </div>
        </label>
        <label className="field-label">
          Ask
          <div className="input-unit">
            <input
              value={ask}
              disabled={pending}
              inputMode="decimal"
              placeholder="0.00"
              onChange={(event) => {
                setAsk(event.target.value);
                setReview(false);
              }}
            />
            <span>$</span>
          </div>
        </label>
      </div>
      <label className="field-label">
        Maximum capacity
        <div className="input-unit">
          <input
            value={capacity}
            disabled={pending}
            inputMode="decimal"
            placeholder="0.00"
            onChange={(event) => {
              setCapacity(event.target.value);
              setReview(false);
            }}
          />
          <span>USDC</span>
        </div>
      </label>
      <label className="field-label">
        Quote lifetime
        <div className="input-unit compact">
          <input
            value={duration}
            disabled={pending}
            inputMode="numeric"
            onChange={(event) => {
              setDuration(event.target.value);
              setReview(false);
            }}
          />
          <span>seconds</span>
        </div>
      </label>
      <dl className="ticket-summary">
        <div>
          <dt>Margin reservation</dt>
          <dd>{decimal(reservation)} USDC</dd>
        </div>
        <div>
          <dt>Eligible tiers</dt>
          <dd>
            {view.market && capacity
              ? view.market.quote_tiers.filter((value) => {
                  try {
                    return BigInt(value) <= units(capacity);
                  } catch {
                    return false;
                  }
                }).length
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Max lifetime</dt>
          <dd>{view.market?.max_quote_lifetime_seconds ?? "—"} seconds</dd>
        </div>
      </dl>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {review ? (
        <div className="trade-review">
          <p>
            Bid ${decimal(draft?.input.bidE8, 8, 4)} · Ask $
            {decimal(draft?.input.askE8, 8, 4)}
            <br />
            Capacity {decimal(draft?.input.maxCapacity)} USDC ·{" "}
            {draft?.input.validForSeconds}s
          </p>
          <p>
            Your allocated collateral backs both sides. Required quote
            transactions will be approved in your wallet.
          </p>
          <button
            className="terminal-button primary full"
            disabled={Boolean(session.busy)}
            onClick={() => void submit()}
          >
            Sign and publish
            <ArrowUpRight size={14} />
          </button>
          <button className="review-back" onClick={() => setReview(false)}>
            Back to quote
          </button>
        </div>
      ) : !session.maker && !session.verifying ? (
        <WalletButton
          label="Connect maker wallet"
          className="terminal-button primary full"
        />
      ) : (
        <button
          className="terminal-button primary full"
          disabled={
            Boolean(session.busy) || !session.maker || (!pending && !allowed)
          }
          onClick={() => (pending ? void reconcile() : prepare())}
          title={!pending && !allowed ? view.reason : undefined}
        >
          {pending
            ? "Resume original quote"
            : !session.maker
              ? "Connect maker wallet"
              : prior
                ? "Review replacement"
                : "Review quote"}
          <ArrowUpRight size={14} />
        </button>
      )}
    </section>
  );
}
