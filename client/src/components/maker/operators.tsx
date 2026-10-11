"use client";

import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useDepth } from "@/shared/depth/session";
import { decimal, short, units } from "@/shared/depth/format";

type Grant = {
  operator: string;
  active: boolean;
  canView: boolean;
  capacity: bigint;
  expiresAt: number;
};
export function Operators() {
  const session = useDepth();
  const [operator, setOperator] = useState("");
  const [capacity, setCapacity] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [canView, setCanView] = useState(false);
  const [state, setState] = useState<{ owner: string; grants: Grant[] }>();
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const owner = session.maker?.options.maker.toBase58();
  useEffect(() => {
    if (!session.maker || !owner) return;
    let stopped = false;
    void session.maker.operator
      .list()
      .then((grants) => {
        if (!stopped)
          setState({
            owner,
            grants: grants.map(({ state: grant }) => ({
              operator: grant.operator.toBase58(),
              active: grant.active,
              canView: grant.canView,
              capacity: BigInt(grant.maxCapacity.toString()),
              expiresAt: grant.expiresAt.toNumber(),
            })),
          });
      })
      .catch(() => {
        if (!stopped) setError("Operator grants are unavailable");
      });
    return () => {
      stopped = true;
    };
  }, [session.maker, session.version, owner]);
  async function authorize() {
    if (!session.maker) return;
    const maker = session.maker;
    let key: PublicKey;
    let amount: bigint;
    let lifetime: number;
    try {
      key = new PublicKey(operator);
      amount = units(capacity);
      lifetime = Number(minutes) * 60;
      if (
        amount <= 0n ||
        !Number.isSafeInteger(lifetime) ||
        lifetime < 60 ||
        lifetime > 604800
      )
        throw new Error(
          "Enter positive capacity and a duration between 1 minute and 7 days",
        );
    } catch {
      setError("Check the operator public key, capacity and expiry");
      return;
    }
    setReview(false);
    await session.run("Authorizing quote operator", async () => {
      await maker.operator.authorize({
        operator: key,
        maxCapacity: amount,
        expiresAt: Math.floor(Date.now() / 1000) + lifetime,
        canView,
      });
      session.notice("Operator grant confirmed");
    });
  }
  return (
    <section className="operator-panel" aria-label="Quote operator permissions">
      <p>
        Operators can publish and cancel quotes within their grant; your wallet
        controls collateral transfers.
      </p>
      <div className="operator-form">
        <label className="field-label">
          Operator
          <input
            aria-label="Operator Solana public key"
            placeholder="Solana public key"
            value={operator}
            onChange={(event) => {
              setOperator(event.target.value);
              setReview(false);
            }}
          />
        </label>
        <label className="field-label">
          Capacity
          <div className="input-unit compact">
            <input
              aria-label="Operator capacity USDC"
              inputMode="decimal"
              placeholder="0.00"
              value={capacity}
              onChange={(event) => {
                setCapacity(event.target.value);
                setReview(false);
              }}
            />
            <span>USDC</span>
          </div>
        </label>
        <label className="field-label">
          Grant duration
          <div className="input-unit compact">
            <input
              aria-label="Operator grant duration minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(event) => {
                setMinutes(event.target.value);
                setReview(false);
              }}
            />
            <span>min</span>
          </div>
        </label>
        <div className="operator-controls">
          <label>
            <input
              type="checkbox"
              checked={canView}
              onChange={(event) => {
                setCanView(event.target.checked);
                setReview(false);
              }}
            />
            Allow private views
          </label>
          <button
            className="terminal-button"
            disabled={!session.maker || Boolean(session.busy)}
            onClick={() => (review ? void authorize() : setReview(true))}
          >
            {review ? "Approve grant in wallet" : "Review grant"}
          </button>
        </div>
      </div>
      {review && (
        <p>
          Grant {operator || "the selected operator"} up to {capacity || "—"}{" "}
          USDC capacity for {minutes} minutes
          {canView ? ", including private view access" : ""}.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {state &&
        state.owner === owner &&
        state.grants.map((grant) => (
          <div className="operation-row" key={grant.operator}>
            <span>{short(grant.operator)}</span>
            <span>
              {decimal(grant.capacity)} USDC ·{" "}
              {grant.canView ? "views allowed" : "quotes only"} ·{" "}
              {grant.active && grant.expiresAt > now ? "active" : "inactive"}
            </span>
            <button
              disabled={Boolean(session.busy) || !grant.active}
              onClick={() =>
                void session.run("Revoking operator", async () => {
                  await session.maker!.operator.revoke(
                    new PublicKey(grant.operator),
                  );
                  session.notice("Operator revoked");
                })
              }
            >
              Revoke
            </button>
          </div>
        ))}
    </section>
  );
}
