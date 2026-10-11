export {
  createDepthMaker,
  createDepthMaker as create_depth_maker,
  MakerClient,
} from "@/client/client";
export { QuoteHandle } from "@/quote/quote";
export { QuoteReplacement } from "@/quote/replacement";
export type { ReplacementSnapshot } from "@/quote/replacement";
export { BackstopHandle, BackstopRelease } from "@/backstop/backstop";
export type { BackstopSnapshot } from "@/backstop/backstop";
export type { QuoteSnapshot } from "@/quote/quote";
export type {
  FlatQuoteInput,
  BackstopInput,
  MakerOptions,
  QuoteInput,
  QuoteRequest,
  QuoteTier,
} from "@/client/types";

export type { FillPage } from "@/fill/history";
export { MakerAccess } from "@/hedge/access";
export type { MakerHedgeView } from "@/hedge/access";
export { MakerAutomation } from "@/automation/automation";
export {
  automationConfig,
  automationWire,
  automationView,
} from "@/automation/types";
export type { AutomationConfig, AutomationView } from "@/automation/types";
export { setup_hyperliquid } from "@/hedge/setup";
export { connect_hyperliquid } from "@/hedge/wallet";
export type { EthereumProvider } from "@/hedge/wallet";
