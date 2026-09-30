export {
  DepthClient,
  createDepth,
  createDepth as create_depth,
} from "@/client/client";
export { DepthOperation } from "@/operation/operation";
export { TradeFlow } from "@/trade/flow";
export type { TradeFlowSnapshot } from "@/trade/flow";
export { MarketCatalog } from "@/catalog/catalog";
export type { MarketPolicy, MarketSummary } from "@/catalog/catalog";
export { AppAdmin, AppRegistration, AppUpdate } from "@/app/app";
export { FundingDiscovery } from "@/account/discovery";
export type {
  PendingItem,
  PendingKind,
  PendingPage,
  UnpairedAllocation,
} from "@/account/discovery";
export type { AppSummary } from "@/app/app";
export { DepthRecovery } from "@/recovery/recovery";
export type { RecoverySnapshot } from "@/recovery/recovery";
export {
  DepositHandle,
  FundingClient,
  TransferHandle,
  WithdrawalHandle,
} from "@/account/funding";
export { DepthView } from "@/view/view";
export { resolveAmount } from "@/trade/amount";
export type { AmountSelector } from "@/trade/amount";
export type {
  BalanceSnapshot,
  FillSnapshot,
  PositionSnapshot,
  QuoteBalanceSnapshot,
} from "@/view/view";
export type {
  DepthOptions,
  DepthWallet,
  TradeInput,
  ReductionInput,
  CloseInput,
  ReverseInput,
  TradeIntent,
} from "@/client/types";
export { resolveConnection } from "@/chain/environment";
export type {
  ConnectionOptions,
  ResolvedConnection,
  DepthEnvironment,
} from "@/chain/environment";

export { DepthError } from "@/operation/error";
export { DepthProvider } from "@/chain/provider";

export {
  authenticateManifest,
  captureDeployment,
  manifestBytes,
  verifyDeployment,
} from "@/chain/manifest";
export type {
  DeploymentManifest,
  SignedManifest,
  DeploymentPolicy,
} from "@/chain/manifest";
