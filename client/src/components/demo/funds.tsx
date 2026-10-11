"use client";

import { useId, useRef, useState } from "react";
import { ArrowDownToLine, X, RefreshCw, LoaderCircle } from "lucide-react";
import type { AmountSelector } from "@depthhq/sdk";
import { useDepth } from "@/shared/depth/session";
import type { AccountView } from "@/shared/depth/account";
import { decimal, units } from "@/shared/depth/format";
import { availableBalance } from "@/shared/depth/snapshot";
import {
  FundingStore,
  discoverFunding,
  fundingRequest,
  settleFunding,
  type FundingAction,
  type FundingRequest,
} from "@/shared/depth/funding";
import { errorMessage } from "@/shared/depth/error";

export function Funds({ account }: { account: AccountView }) {
  const session = useDepth();
  const [action, setAction] = useState<FundingAction>("deposit");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [request, setRequest] = useState<FundingRequest>();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [complete, setComplete] = useState("");
  const [processing, setProcessing] = useState(false);
  const working = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const available = availableBalance(account);
  async function open() {
    const sdk = session.trader;
    if (!sdk || working.current) return;
    if (!dialog.current?.open) dialog.current?.showModal();
    setError("");
    setComplete("");
    setChecking(true);
    setChecked(false);
    try {
      const store = new FundingStore(localStorage, sdk);
      const pending = store.read() ?? (await discoverFunding(sdk));
      if (pending) {
        store.save(pending);
        setAction(pending.action);
        setAmount(
          typeof pending.amount === "bigint"
            ? decimal(pending.amount, 6, 6).replaceAll(",", "")
            : pending.amount,
        );
      }
      setRequest(pending);
      setChecked(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setChecking(false);
    }
  }
  async function submit() {
    const sdk = session.trader;
    if (!sdk || working.current || checking || !checked || session.busy) return;
    let value: AmountSelector;
    try {
      value =
        request?.amount ??
        (amount === "all" || /^(?:10|25|50|100)%$/.test(amount)
          ? (amount as AmountSelector)
          : units(amount));
      if (typeof value === "bigint" && value <= 0n)
        throw new Error("Amount must be positive");
    } catch (cause) {
      setError(String(cause instanceof Error ? cause.message : cause));
      return;
    }
    if (action === "deposit" && typeof value !== "bigint") {
      setError("Deposits require an exact USDC amount");
      return;
    }
    working.current = true;
    setProcessing(true);
    setError("");
    setComplete("");
    try {
      await session.run(
        `${action === "deposit" ? "Depositing" : action === "withdraw" ? "Withdrawing" : action === "allocate" ? "Allocating" : "Releasing"} USDC`,
        async () => {
          try {
            const store = new FundingStore(localStorage, sdk);
            const intent = request ?? fundingRequest(action, value);
            store.save(intent);
            setRequest(intent);
            await settleFunding(sdk, intent);
            store.clear();
            setRequest(undefined);
            setAmount("");
            setComplete("Transfer confirmed.");
          } catch (cause) {
            setError(errorMessage(cause));
          }
        },
        { feedback: "local" },
      );
    } finally {
      working.current = false;
      setProcessing(false);
    }
  }
  return (
    <>
      {session.trader && (
        <button
          className="funds-trigger"
          aria-label="Funds"
          title="Manage USDC"
          disabled={Boolean(session.busy) && !session.reading}
          onClick={() => void open()}
        >
          <ArrowDownToLine aria-hidden="true" size={13} />
          <span>Funds</span>
        </button>
      )}
      <dialog
        ref={dialog}
        className="terminal-dialog"
        aria-labelledby={titleId}
      >
        <div className="dialog-heading">
          <h2 id={titleId}>Manage USDC</h2>
          <button
            aria-label="Close funds dialog"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <div className="funds-summary">
          <dl>
            <div>
              <dt>Balance</dt>
              <dd>{decimal(available)} USDC</dd>
            </div>
            <div>
              <dt>Collateral</dt>
              <dd>
                {decimal(
                  account.position?.status === "ready" &&
                    !account.outdated &&
                    !account.checking
                    ? account.position.collateral
                    : account.loaded &&
                        !account.position &&
                        !account.outdated &&
                        !account.checking
                      ? 0n
                      : undefined,
                )}{" "}
                USDC
              </dd>
            </div>
          </dl>
          {!account.empty && (
            <button
              className="terminal-button quiet"
              aria-label={account.error ? "Retry balances" : "Refresh balances"}
              title="Decrypt balances with wallet approval"
              disabled={
                !session.trader || Boolean(session.busy) || account.checking
              }
              onClick={() => void account.read()}
            >
              <RefreshCw
                size={13}
                className={account.checking ? "spin" : undefined}
              />
              {account.error ? "Retry" : "Refresh"}
            </button>
          )}
        </div>
        {account.error && (
          <p role="alert" className="form-error">
            {account.error}
          </p>
        )}
        <label className="field-label">
          Operation
          <select
            value={action}
            disabled={Boolean(request) || checking || processing}
            onChange={(event) => {
              setAction(event.target.value as FundingAction);
              setError("");
              if (
                event.target.value === "deposit" &&
                /^(?:all|\d+%)$/.test(amount)
              )
                setAmount("");
            }}
          >
            <option value="deposit">Deposit from wallet</option>
            <option value="withdraw">Withdraw to wallet</option>
            <option value="allocate">Allocate to SOL market</option>
            <option value="release">Release from SOL market</option>
          </select>
        </label>
        <label className="field-label">
          Amount
          <div className="input-unit">
            <input
              value={amount}
              disabled={Boolean(request) || checking || processing}
              placeholder="0.00"
              inputMode="decimal"
              onChange={(event) => {
                setAmount(event.target.value);
                setError("");
              }}
            />
            <span>USDC</span>
          </div>
        </label>
        {action !== "deposit" && !request && (
          <div className="amount-presets">
            {["10%", "25%", "50%", "all"].map((value) => (
              <button
                key={value}
                onClick={() => {
                  setAmount(value);
                  setError("");
                }}
              >
                {value}
              </button>
            ))}
          </div>
        )}
        <p className="funds-disclosure">
          Token and margin transfers are public.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {complete && (
          <p role="status" className="funds-result">
            {complete}
          </p>
        )}
        <button
          className="terminal-button primary full"
          disabled={!session.trader || checking || Boolean(session.busy)}
          onClick={() => void (checked ? submit() : open())}
        >
          {processing ? (
            <>
              <LoaderCircle size={14} className="spin" />
              {session.busy}
            </>
          ) : checking ? (
            "Checking transfers…"
          ) : session.reading ? (
            "Loading balances…"
          ) : !checked ? (
            "Retry connection"
          ) : request ? (
            `Resume ${action === "allocate" ? "allocation" : action === "withdraw" ? "withdrawal" : action}`
          ) : action === "deposit" ? (
            "Review deposit"
          ) : action === "withdraw" ? (
            "Review withdrawal"
          ) : action === "allocate" ? (
            "Review allocation"
          ) : (
            "Review release"
          )}
        </button>
      </dialog>
    </>
  );
}
