"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play, Settings2 } from "lucide-react";
import type { AutomationView, EthereumProvider } from "@depthhq/maker-sdk";
import { connect_hyperliquid } from "@depthhq/maker-sdk";
import { useDepth } from "@/shared/depth/session";
import {
  automationDefaults,
  automationForm,
  automationInput,
  type AutomationForm,
} from "@/shared/depth/automation";
import { decimal, short, transactionUrl } from "@/shared/depth/format";
import { WalletButton } from "@/components/demo/wallet";

type HedgeWallet = Awaited<ReturnType<typeof connect_hyperliquid>>;
export function Automation({
  profile,
  onProfile,
  read,
}: {
  profile: AutomationView | null | undefined;
  onProfile: (value: AutomationView | null | undefined) => void;
  read: (authorize?: boolean) => Promise<AutomationView | null>;
}) {
  const session = useDepth();
  const active = profile !== undefined;
  const [form, setForm] = useState({ ...automationDefaults });
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState(false);
  const [privateView, setPrivateView] = useState(false);
  const [grantHours, setGrantHours] = useState("24");
  const [hedgeWallet, setHedgeWallet] = useState<HedgeWallet>();
  const [error, setError] = useState("");
  const [receipts, setReceipts] = useState<string[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!active || !session.maker) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await read();
        if (!stopped) {
          onProfile(value);
          setError("");
        }
      } catch (cause) {
        if (!stopped) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Automation status is unavailable",
          );
          if (String(cause).includes("Authorize")) onProfile(undefined);
        }
      } finally {
        if (!stopped) timer = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, session.maker, read, onProfile]);
  const writable =
    !profile ||
    (profile.desired === "paused" &&
      ["configured", "paused"].includes(profile.phase) &&
      profile.funding?.status !== "pending");
  const hashes = [
    ...new Set([
      ...(profile?.funding ? [profile.funding.signature] : []),
      ...receipts,
    ]),
  ];
  const paused = profile?.desired === "paused";
  const update = <K extends keyof AutomationForm>(
    key: K,
    value: AutomationForm[K],
  ) => setForm((previous) => ({ ...previous, [key]: value }));
  async function open() {
    if (!session.maker) return;
    await session.run(
      "Read automation",
      async () => {
        const value = await read(true);
        if (alive.current) {
          onProfile(value);
          if (value) setForm(automationForm(value));
          setEditing(!value);
          setError("");
        }
      },
      false,
    );
  }
  async function prepare() {
    setError("");
    let input;
    try {
      input = automationInput(form, profile);
    } catch (cause) {
      setError((cause as Error).message);
      return;
    }
    await session.run("Save automation", async () => {
      const value = await session.maker!.automation.configure(
        input,
        profile?.revision ?? 0,
      );
      if (alive.current) {
        onProfile(value);
        setForm(automationForm(value));
        setEditing(false);
        setReview(true);
        setPrivateView(false);
        setReceipts([]);
      }
    });
  }
  async function connect() {
    await session.run(
      "Connect hedge wallet",
      async () => {
        const provider = (window as Window & { ethereum?: EthereumProvider })
          .ethereum;
        if (!provider)
          throw new Error(
            "Open this page in an Ethereum wallet browser or enable its extension",
          );
        const wallet = await connect_hyperliquid(provider);
        const [account] = await wallet.getAddresses();
        if (alive.current) {
          setHedgeWallet(wallet);
          update("account", account);
        }
      },
      false,
    );
  }
  async function approve() {
    if (!profile || !privateView) return;
    const duration = Number(grantHours) * 3600;
    if (
      !Number.isSafeInteger(duration) ||
      duration < 3600 ||
      duration > 604800
    ) {
      setError("Approval must last 1 to 168 hours");
      return;
    }
    await session.run("Approve automation", async () => {
      const result = await session.maker!.automation.approve(profile, {
        grantSeconds: duration,
        hedgeWallet,
      });
      if (alive.current) {
        setReceipts(result.signatures);
        setReview(false);
        session.notice(
          "Operator approved. Start when your market collateral is ready.",
        );
      }
    });
  }
  async function command(action: "start" | "pause") {
    if (!profile) return;
    await session.run(
      action === "start" ? "Start automation" : "Pause automation",
      async () => {
        const value = await session.maker!.automation[action](profile.revision);
        if (alive.current) onProfile(value);
      },
    );
  }
  const field = (
    label: string,
    key: Exclude<keyof AutomationForm, "hedge">,
    unit: string,
  ) => (
    <label className="field-label" key={key}>
      {label}
      <div className="input-unit compact">
        <input
          aria-label={label}
          inputMode={key === "account" ? "text" : "decimal"}
          value={form[key]}
          onChange={(event) => update(key, event.target.value)}
          disabled={Boolean(session.busy)}
        />
        <span>{unit}</span>
      </div>
    </label>
  );
  if (!active)
    return (
      <div className="records-empty">
        {!session.connected ? (
          <WalletButton
            label="Connect maker wallet"
            className="terminal-button primary full"
          />
        ) : (
          <button
            className="terminal-button primary full"
            disabled={!session.maker || Boolean(session.busy)}
            onClick={open}
          >
            Set up automation
          </button>
        )}
        {error && <p>{error}</p>}
      </div>
    );
  return (
    <div className="automation-panel">
      <div className="automation-heading">
        <div>
          <span
            className="automation-state"
            aria-label="Automation status"
            data-running={profile?.phase === "running"}
          >
            {profile?.phase ?? "Not configured"}
          </span>
        </div>
        {profile && (
          <div className="automation-controls">
            <button
              className="terminal-button secondary"
              disabled={!writable || Boolean(session.busy)}
              onClick={() => {
                setForm(automationForm(profile));
                setEditing(!editing);
                setReview(false);
              }}
            >
              <Settings2 size={13} /> Settings
            </button>
            <button
              className="terminal-button"
              disabled={
                Boolean(session.busy) ||
                profile.phase === "pausing" ||
                editing ||
                review
              }
              onClick={() => command(paused ? "start" : "pause")}
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}
              {paused ? "Start" : "Pause"}
            </button>
          </div>
        )}
      </div>
      {profile?.reason && <p className="automation-reason">{profile.reason}</p>}
      {profile?.funding?.status === "pending" && (
        <p className="automation-reason">
          Operator funding is pending. Approval can resume after confirmation.
        </p>
      )}
      {editing || !profile ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void prepare();
          }}
        >
          <div className="automation-fields">
            {field("Quote capacity", "capacity", "USDC")}
            {field("Inventory limit", "inventory", "USDC")}
            {field("Spread", "spread", "bps")}
            {field("Reprice after", "reprice", "bps")}
            {field("Quote lifetime", "lifetime", "sec")}
            {field("Refresh every", "refresh", "sec")}
          </div>
          <label className="automation-toggle">
            <input
              type="checkbox"
              checked={form.hedge}
              disabled={Boolean(profile?.config.hedge) || Boolean(session.busy)}
              onChange={(event) => update("hedge", event.target.checked)}
            />
            Hedge inventory on Hyperliquid
          </label>
          {form.hedge && (
            <div className="automation-hedge">
              <div className="automation-connect">
                {field("Hyperliquid account", "account", "")}
                {!profile?.config.hedge && (
                  <button
                    type="button"
                    className="terminal-button secondary"
                    disabled={Boolean(session.busy)}
                    onClick={connect}
                  >
                    Connect Ethereum wallet
                  </button>
                )}
              </div>
              <div className="automation-fields">
                {field("Hedge ratio", "ratio", "%")}
                {field("Minimum hedge", "threshold", "USDC")}
                {field("Unhedged limit", "exposure", "USDC")}
                {field("Order limit", "order", "USDC")}
                {field("Slippage", "slippage", "bps")}
                {field("Maximum leverage", "leverage", "X")}
              </div>
              <p>External hedges are public and may reveal inventory clues.</p>
            </div>
          )}
          <div className="automation-controls">
            <button
              className="terminal-button"
              disabled={Boolean(session.busy)}
              type="submit"
            >
              Review setup
            </button>
            {profile && (
              <button
                type="button"
                className="terminal-button secondary"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        profile && (
          <>
            <dl className="automation-summary">
              <div>
                <dt>Capacity</dt>
                <dd>
                  {decimal(BigInt(profile.config.quote.maxCapacity))} USDC
                </dd>
              </div>
              <div>
                <dt>Inventory limit</dt>
                <dd>
                  {decimal(BigInt(profile.config.quote.maxInventoryNotional))}{" "}
                  USDC
                </dd>
              </div>
              <div>
                <dt>Spread / reprice</dt>
                <dd>
                  {profile.config.quote.spreadBps} /{" "}
                  {profile.config.quote.repriceBps} bps
                </dd>
              </div>
              <div>
                <dt>Refresh / expiry</dt>
                <dd>
                  {profile.config.quote.refreshSeconds}s /{" "}
                  {profile.config.quote.lifetimeSeconds}s
                </dd>
              </div>
              <div>
                <dt>Hedging</dt>
                <dd>
                  {profile.config.hedge
                    ? `Hyperliquid ${profile.environment === "devnet" ? "testnet" : "mainnet"}`
                    : "Off"}
                </dd>
              </div>
              <div>
                <dt>Fills tracked</dt>
                <dd>{profile.bot?.fillCount ?? 0}</dd>
              </div>
            </dl>
            {review ? (
              <div className="automation-review">
                <h4>Approve this operator</h4>
                <dl>
                  <div>
                    <dt>Solana operator</dt>
                    <dd>{profile.operator}</dd>
                  </div>
                  <div>
                    <dt>Funding budget</dt>
                    <dd>
                      Top up to{" "}
                      {decimal(
                        BigInt(
                          profile.config.quote.gasReserveLamports ?? "50000000",
                        ) + 200000000n,
                        9,
                        3,
                      )}{" "}
                      SOL
                    </dd>
                  </div>
                  {profile.config.hedge && (
                    <div>
                      <dt>Hyperliquid agent</dt>
                      <dd>{profile.agent}</dd>
                    </div>
                  )}
                </dl>
                {profile.config.hedge && (
                  <div className="automation-connect">
                    <button
                      className="terminal-button secondary"
                      disabled={Boolean(session.busy)}
                      onClick={connect}
                    >
                      {hedgeWallet
                        ? "Change Ethereum wallet"
                        : "Connect account wallet"}
                    </button>
                    <a
                      href={
                        profile.environment === "devnet"
                          ? "https://app.hyperliquid-testnet.xyz/API"
                          : "https://app.hyperliquid.xyz/API"
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Hyperliquid API wallets <ArrowUpRight size={13} />
                    </a>
                  </div>
                )}
                <label className="field-label">
                  Approval duration
                  <select
                    value={grantHours}
                    onChange={(event) => setGrantHours(event.target.value)}
                  >
                    <option value="1">1 hour</option>
                    <option value="24">24 hours</option>
                    <option value="168">7 days</option>
                  </select>
                </label>
                <label className="automation-toggle">
                  <input
                    type="checkbox"
                    checked={privateView}
                    onChange={(event) => setPrivateView(event.target.checked)}
                  />
                  Allow this operator to read my private inventory
                </label>
                <p>
                  The operator can quote, cancel, and read your inventory; your
                  wallet controls collateral transfers.
                </p>
                <div className="automation-controls">
                  <button
                    className="terminal-button"
                    disabled={!privateView || Boolean(session.busy)}
                    onClick={approve}
                  >
                    Approve with wallet
                  </button>
                  <button
                    className="terminal-button secondary"
                    onClick={() => setReview(false)}
                  >
                    Later
                  </button>
                </div>
              </div>
            ) : (
              <div className="automation-controls">
                <button
                  className="terminal-button secondary"
                  disabled={!writable || Boolean(session.busy)}
                  onClick={() => {
                    setReview(true);
                    setPrivateView(false);
                  }}
                >
                  Approve / renew operator
                </button>
                <p>Pause stops new quotes and hedges; positions stay open.</p>
              </div>
            )}
            {hashes.length > 0 && (
              <div className="automation-receipts">
                {hashes.map((hash) => (
                  <a
                    key={hash}
                    href={transactionUrl(hash, profile.environment)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(hash)}
                    <ArrowUpRight size={12} />
                  </a>
                ))}
              </div>
            )}
          </>
        )
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
