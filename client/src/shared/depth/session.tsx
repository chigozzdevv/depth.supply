"use client";

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { DepthClient, DepthWallet } from "@depthhq/sdk";
import type { MakerClient } from "@depthhq/maker-sdk";
import type { DemoConfig } from "@/shared/config/runtime";

type Session = {
  config: DemoConfig;
  connected: boolean;
  trader?: DepthClient;
  maker?: MakerClient;
  verifying: boolean;
  retry?: () => void;
  error: string;
  busy: string;
  message: string;
  version: number;
  run: (
    label: string,
    action: () => Promise<void>,
    mutates?: boolean,
  ) => Promise<void>;
  notice: (message: string) => void;
};
const Context = createContext<Session | null>(null);

export function DepthSession({
  config,
  role,
  children,
}: {
  config: DemoConfig;
  role: "trade" | "maker";
  children: ReactNode;
}) {
  const wallet = useWallet();
  const owner = wallet.publicKey?.toBase58() ?? "";
  const connected = Boolean(owner);
  const scope = useRef(owner);
  useEffect(() => {
    scope.current = owner;
  }, [owner]);
  const [state, setState] = useState<{
    owner: string;
    trader?: DepthClient;
    maker?: MakerClient;
    error?: string;
  }>({ owner: "" });
  const [feedback, setFeedback] = useState({
    owner: "",
    busy: "",
    error: "",
    message: "",
  });
  const [version, setVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const locked = useRef(false);
  const signer = useMemo<DepthWallet | undefined>(
    () =>
      wallet.publicKey && wallet.signTransaction && wallet.signAllTransactions
        ? {
            publicKey: wallet.publicKey,
            signTransaction: wallet.signTransaction,
            signAllTransactions: wallet.signAllTransactions,
            signMessage: wallet.signMessage,
          }
        : undefined,
    [
      wallet.publicKey,
      wallet.signTransaction,
      wallet.signAllTransactions,
      wallet.signMessage,
    ],
  );

  useEffect(() => {
    if (!signer) return;
    let cancelled = false;
    let makerSession: MakerClient | undefined;
    const options = {
      environment: config.environment,
      appId: config.appId,
      wallet: signer,
      rpcUrl: `${location.origin}/api/rpc?cluster=${config.environment}`,
      serviceUrl: `${location.origin}/api/depth`,
    };
    void (async () => {
      try {
        const { create_depth } = await import("@depthhq/sdk");
        const trader = await create_depth(options);
        const maker =
          role === "maker"
            ? await (
                await import("@depthhq/maker-sdk")
              ).create_depth_maker(options)
            : undefined;
        if (!cancelled) {
          makerSession = maker;
          setState({ owner, trader, maker });
        } else {
          maker?.hedges.disconnect();
          maker?.automation.disconnect();
        }
      } catch (cause) {
        if (!cancelled)
          setState({
            owner,
            error:
              cause instanceof Error
                ? cause.message
                : "Deployment verification failed",
          });
      }
    })();
    return () => {
      cancelled = true;
      makerSession?.hedges.disconnect();
      makerSession?.automation.disconnect();
    };
  }, [config, owner, signer, role, attempt]);

  const current = state.owner === owner && owner ? state : undefined;
  const currentFeedback = feedback.owner === owner ? feedback : undefined;
  async function run(
    label: string,
    action: () => Promise<void>,
    mutates = true,
  ) {
    if (locked.current) return;
    const account = owner;
    locked.current = true;
    setFeedback({ owner: account, busy: label, error: "", message: "" });
    try {
      await action();
    } catch (cause) {
      if (scope.current === account)
        setFeedback((value) => ({
          ...value,
          error:
            cause instanceof Error
              ? cause.message
              : "The operation could not be completed",
        }));
    } finally {
      if (mutates && scope.current === account)
        setVersion((value) => value + 1);
      locked.current = false;
      if (scope.current === account)
        setFeedback((value) => ({ ...value, busy: "" }));
    }
  }
  return (
    <Context.Provider
      value={{
        config,
        connected,
        trader: signer ? current?.trader : undefined,
        maker: signer ? current?.maker : undefined,
        verifying: Boolean(signer && !current),
        retry: signer
          ? () => {
              if (locked.current) return;
              setState({ owner: "" });
              setAttempt((value) => value + 1);
            }
          : undefined,
        error:
          connected && !signer
            ? "This wallet cannot sign Solana transactions"
            : (current?.error ?? currentFeedback?.error ?? ""),
        busy: currentFeedback?.busy ?? "",
        message: currentFeedback?.message ?? "",
        version,
        run,
        notice: (message) => {
          if (scope.current === owner)
            setFeedback((value) => ({
              ...value,
              owner,
              message,
            }));
        },
      }}
    >
      <Fragment key={owner}>{children}</Fragment>
    </Context.Provider>
  );
}
export function useDepth(): Session {
  const value = useContext(Context);
  if (!value) throw new Error("Depth session is unavailable");
  return value;
}
