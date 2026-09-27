export {
  DepthClient,
  createDepth,
  createDepth as create_depth,
} from "@/client/client";
export { DepthOperation } from "@/operation/operation";
export { AppAdmin, AppRegistration, AppUpdate } from "@/app/app";
export { FundingDiscovery } from "@/account/discovery";
export type { PendingItem, PendingKind, PendingPage } from "@/account/discovery";
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
export type {
  BalanceSnapshot,
  FillSnapshot,
  PositionSnapshot,
} from "@/view/view";
export type {
  DepthOptions,
  DepthWallet,
  TradeInput,
  TradeIntent,
} from "@/client/types";

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
export { WinddownOperator } from "@/recovery/winddown";
export type {
  ClearingWitness,
  MarketWitness,
  FeeWitness,
} from "@/recovery/winddown";
