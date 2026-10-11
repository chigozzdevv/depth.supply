"use client";

import { useState, type CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
import type { TradeInput } from "@depthhq/sdk";
import { useDepth } from "@/shared/depth/session";
import type { MarketView } from "@/shared/depth/market";
import { decimal, nonce, units } from "@/shared/depth/format";
import { WalletButton } from "@/components/demo/wallet";
import { tradeFeeBps } from "@/shared/depth/terms";

export function Ticket({ view }: { view: MarketView }) {
  const session = useDepth();
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [margin, setMargin] = useState("");
  const [leverage, setLeverage] = useState(3);
  const [slippage, setSlippage] = useState("0.5");
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [unresolved, setUnresolved] = useState(false);
  const [draft, setDraft] = useState<TradeInput | null>(null);
  const maxLeverage = view.market?.initial_margin_bps
    ? Math.floor(10000 / view.market.initial_margin_bps)
    : 1;
  const selectedLeverage = Math.min(leverage, maxLeverage);
  const leverageProgress =
    maxLeverage > 1 ? ((selectedLeverage - 1) / (maxLeverage - 1)) * 100 : 0;
  let collateral = 0n;
  try {
    if (margin) collateral = units(margin);
  } catch {
    /* Validation runs before review. */
  }
  const exposure = collateral * BigInt(Math.min(leverage, maxLeverage));
  const feeBps =
    view.market && view.app ? tradeFeeBps(view.market, view.app) : undefined;
  const maxFee =
    feeBps === undefined
      ? undefined
      : (exposure * BigInt(feeBps) + 9999n) / 10000n;
  function prepare() {
    try {
      if (!view.ready || !session.trader || maxFee === undefined)
        throw new Error(view.reason || "Connect your wallet first");
      const amount = units(margin);
      const slippageBps = Number(units(slippage, 2));
      if (amount <= 0n || maxFee <= 0n)
        throw new Error("Enter a positive USDC margin");
      if (slippageBps < 1 || slippageBps > 500)
        throw new Error("Slippage must be between 0.01% and 5%");
      if (exposure > BigInt(view.market!.max_account_notional))
        throw new Error("Exposure exceeds the market account limit");
      setDraft({
        marketId: "SOL-USD",
        direction,
        notional: exposure,
        margin: amount,
        slippageBps,
        maxFee,
        validForSeconds: view.market!.max_order_queue_seconds,
        clientNonce: nonce(),
      });
      setError("");
      setReview(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid order");
    }
  }
  async function submit() {
    if (!session.trader || !draft) return;
    const sdk = session.trader;
    const input = draft;
    setReview(false);
    setUnresolved(true);
    await session.run("Submitting encrypted trade", async () => {
      const opening = await sdk.trade
        .flow(input.clientNonce!)
        .resume(input, "increase");
      session.notice("Trade submitted");
      await opening.confirm();
      setUnresolved(false);
      setDraft(null);
      session.notice(
        "Trade filled. Read your private account to view the position.",
      );
    });
  }
  async function reconcile() {
    if (!session.trader || !draft) return;
    const sdk = session.trader;
    const input = draft;
    await session.run(
      "Checking trade continuation",
      async () => {
        const status = await sdk.trade.flow(input.clientNonce!).status();
        if (
          status.phase === "unstarted" ||
          status.phase === "failed" ||
          status.order?.status === "finalized"
        ) {
          setUnresolved(false);
          setDraft(null);
          session.notice(`Trade ${status.order?.outcome ?? status.phase}`);
        } else if (status.phase === "order") {
          await sdk.trade.operation(input.clientNonce!).confirm();
          setUnresolved(false);
          setDraft(null);
          session.notice("Trade filled");
        } else {
          setReview(true);
          session.notice(
            "The original trade can continue with its existing margin allocation.",
          );
        }
      },
      false,
    );
  }
  return (
    <section className="ticket-panel" aria-label="Place an encrypted trade">
      <div className="ticket-heading">
        <h2>Market order</h2>
      </div>
      <div className="direction-tabs">
        {(["long", "short"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={direction === value}
            disabled={unresolved}
            onClick={() => {
              setDirection(value);
              setReview(false);
            }}
          >
            {value === "long" ? "Long" : "Short"}
            <span>{value === "long" ? "↗" : "↘"}</span>
          </button>
        ))}
      </div>
      <label className="field-label">
        Additional margin
        <div className="input-unit">
          <input
            value={margin}
            disabled={unresolved}
            placeholder="0.00"
            inputMode="decimal"
            onChange={(event) => {
              setMargin(event.target.value);
              setReview(false);
            }}
          />
          <span>USDC</span>
        </div>
      </label>
      <div className="leverage-label">
        <span>Leverage</span>
        <strong>{selectedLeverage}×</strong>
      </div>
      <input
        aria-label="Leverage"
        className="leverage-slider"
        type="range"
        min="1"
        max={maxLeverage}
        value={selectedLeverage}
        style={
          { "--leverage-progress": `${leverageProgress}%` } as CSSProperties
        }
        disabled={unresolved || !view.market}
        onChange={(event) => {
          setLeverage(Number(event.target.value));
          setReview(false);
        }}
      />
      <div className="leverage-presets">
        {[1, 2, 3, 5, 10]
          .filter((value) => value <= maxLeverage)
          .map((value) => (
            <button
              key={value}
              aria-pressed={leverage === value}
              disabled={unresolved}
              onClick={() => {
                setLeverage(value);
                setReview(false);
              }}
            >
              {value}×
            </button>
          ))}
      </div>
      <label className="field-label">
        Slippage limit
        <div className="input-unit compact">
          <input
            value={slippage}
            inputMode="decimal"
            disabled={unresolved}
            onChange={(event) => {
              setSlippage(event.target.value);
              setReview(false);
            }}
          />
          <span>%</span>
        </div>
      </label>
      <dl className="ticket-summary">
        <div>
          <dt>Exposure</dt>
          <dd>{decimal(exposure)} USDC</dd>
        </div>
        <div>
          <dt>Trading fee cap</dt>
          <dd>{decimal(maxFee, 6, 4)} USDC</dd>
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
            {draft?.direction === "long" ? "Long" : "Short"} ·{" "}
            {decimal(draft?.notional)} USDC exposure
            <br />
            {decimal(draft?.margin)} USDC additional margin ·{" "}
            {(draft?.slippageBps ?? 0) / 100}% slippage
          </p>
          <p>
            Your wallet will approve the required account, private view and
            trade transactions. Network fees are additional.
          </p>
          <button
            className="terminal-button primary full"
            disabled={Boolean(session.busy)}
            onClick={() => void submit()}
          >
            Sign and submit
            <ArrowUpRight size={14} />
          </button>
          <button
            className="review-back"
            disabled={unresolved}
            onClick={() => setReview(false)}
          >
            Back to order
          </button>
        </div>
      ) : !session.trader && !session.verifying ? (
        <WalletButton
          label="Connect wallet to trade"
          className="terminal-button primary full"
        />
      ) : (
        <button
          className="terminal-button primary full"
          disabled={
            Boolean(session.busy) ||
            !session.trader ||
            (!unresolved && !view.ready)
          }
          onClick={() => (unresolved ? void reconcile() : prepare())}
          title={!unresolved && !view.ready ? view.reason : undefined}
        >
          {unresolved
            ? "Check pending trade"
            : !session.trader
              ? "Connect wallet to trade"
              : `Review ${direction}`}
          <ArrowUpRight size={14} />
        </button>
      )}
    </section>
  );
}
