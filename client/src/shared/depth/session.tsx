"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type {
  DepthClient,
  DepthWallet,
  ResolvedConnection,
} from "@depthhq/sdk";
import type { MakerClient } from "@depthhq/maker-sdk";
import type { DemoConfig } from "@/shared/config/runtime";
import { errorMessage } from "@/shared/depth/error";

type Session = {
  config: DemoConfig;
  connected: boolean;
  trader?: DepthClient;
  maker?: MakerClient;
  verifying: boolean;
  retry?: () => void;
  error: string;
  busy: string;
  reading: boolean;
  local: boolean;
  message: string;
  version: number;
  run: (
    label: string,
    action: () => Promise<void>,
    options?: boolean | { mutates?: boolean; feedback?: "local" },
  ) => Promise<void>;
  load: (action: () => Promise<void>) => Promise<boolean>;
  notice: (message: string) => void;
  dismiss: () => void;
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
    reading: false,
    local: false,
  });
  const [version, setVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const bootKey = `${config.environment}:${config.appId}:${attempt}`;
  const [boot, setBoot] = useState<{
    key: string;
    connection?: ResolvedConnection;
    error?: string;
  }>();
  const prepared = boot?.key === bootKey ? boot : undefined;
  const connection = prepared?.connection;
  const locked = useRef(false);
  const signer = useMemo<DepthWallet | undefined>(
    () =>
      wallet.publicKey && wallet.signTransaction && wallet.signAllTransactions
        ? {
            publicKey: wallet.publicKey,
            signTransaction: async (transaction) => {
              if (scope.current !== owner)
                throw new Error("Wallet changed before approval");
              return wallet.signTransaction!(transaction);
            },
            signAllTransactions: async (transactions) => {
              if (scope.current !== owner)
                throw new Error("Wallet changed before approval");
              return wallet.signAllTransactions!(transactions);
            },
            signMessage: wallet.signMessage
              ? async (message: Uint8Array) => {
                  if (scope.current !== owner)
                    throw new Error("Wallet changed before approval");
                  return wallet.signMessage!(message);
                }
              : undefined,
          }
        : undefined,
    [
      owner,
      wallet.publicKey,
      wallet.signTransaction,
      wallet.signAllTransactions,
      wallet.signMessage,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { prepare_depth } = await import("@depthhq/sdk");
        const connection = await prepare_depth({
          environment: config.environment,
          rpcUrl: `${location.origin}/api/rpc?cluster=${config.environment}`,
          serviceUrl: `${location.origin}/api/depth`,
        });
        if (!cancelled) setBoot({ key: bootKey, connection });
      } catch (cause) {
        if (!cancelled)
          setBoot({
            key: bootKey,
            error:
              cause instanceof Error
                ? cause.message
                : "Deployment verification failed",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootKey, config.environment]);

  useEffect(() => {
    if (!signer || !connection) return;
    let cancelled = false;
    let makerSession: MakerClient | undefined;
    const options = {
      ...connection,
      appId: config.appId,
      wallet: signer,
      privateViews: "device" as const,
      viewAuthorization: "session" as const,
      settlement: "keeper" as const,
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
  }, [config.appId, connection, owner, signer, role]);

  const current = state.owner === owner && owner ? state : undefined;
  const currentFeedback = feedback.owner === owner ? feedback : undefined;
  const run = useCallback(
    async function run(
      label: string,
      action: () => Promise<void>,
      options: boolean | { mutates?: boolean; feedback?: "local" } = {},
    ) {
      const { mutates = true, feedback: destination } =
        typeof options === "boolean" ? { mutates: options } : options;
      if (locked.current || scope.current !== owner) return;
      const account = owner;
      locked.current = true;
      setFeedback({
        owner: account,
        busy: label,
        error: "",
        message: "",
        reading: false,
        local: destination === "local",
      });
      try {
        await action();
      } catch (cause) {
        if (scope.current === account)
          setFeedback((value) => ({
            ...value,
            error: errorMessage(cause),
          }));
      } finally {
        if (mutates && scope.current === account)
          setVersion((value) => value + 1);
        locked.current = false;
        setFeedback((value) => ({ ...value, busy: "", reading: false }));
      }
    },
    [owner],
  );
  const load = useCallback(
    async (action: () => Promise<void>) => {
      if (locked.current || scope.current !== owner) return false;
      locked.current = true;
      setFeedback((previous) => ({
        owner,
        busy: "Loading account",
        error: previous.owner === owner ? previous.error : "",
        message: previous.owner === owner ? previous.message : "",
        reading: true,
        local: previous.owner === owner && previous.local,
      }));
      try {
        await action();
        return true;
      } finally {
        locked.current = false;
        setFeedback((previous) => ({ ...previous, busy: "", reading: false }));
      }
    },
    [owner],
  );
  return (
    <Context.Provider
      value={{
        config,
        connected,
        trader: signer ? current?.trader : undefined,
        maker: signer ? current?.maker : undefined,
        verifying: Boolean(signer && !current && !prepared?.error),
        retry:
          (connected && !signer) || (!prepared?.error && !current?.error)
            ? undefined
            : () => {
                if (locked.current) return;
                setState({ owner: "" });
                setAttempt((value) => value + 1);
              },
        error:
          connected && !signer
            ? "This wallet cannot sign Solana transactions"
            : (prepared?.error ??
              current?.error ??
              currentFeedback?.error ??
              ""),
        busy: feedback.busy,
        reading: feedback.reading || feedback.owner !== owner,
        local: Boolean(
          currentFeedback?.local && !prepared?.error && !current?.error,
        ),
        message: currentFeedback?.message ?? "",
        version,
        run,
        load,
        dismiss: () =>
          setFeedback((value) => ({ ...value, error: "", message: "" })),
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
