export type OperationKind =
  | "deposit"
  | "withdraw"
  | "quote"
  | "trade"
  | "margin"
  | "view"
  | "risk";

export type OperationStatus =
  | "queued"
  | "finalized"
  | "rejected"
  | "expired"
  | "failed";

export type OperationSnapshot = {
  id: string;
  kind: OperationKind;
  owner: string;
  market_id?: string;
  status: OperationStatus;
  outcome?: "filled" | "active" | "cancelled" | "no_change";
  state_version?: string;
  slot: number;
};

export type PublicMarket = {
  id: string;
  address: string;
  status: "draft" | "active" | "paused";
  revision: string;
  settlement_mint: string;
  oracle_price_e8: string;
  oracle_timestamp: string;
  funding_index: string;
  fee_bps: number;
  insurance_fee_bps: number;
  initial_margin_bps: number;
  maintenance_margin_bps: number;
  slot: number;
};

export type PublicQuote = {
  id: string;
  maker: string;
  operator: string;
  market_id: string;
  status: string;
  capacity: string;
  remaining_capacity: string;
  tier_count: number;
  expiry: string;
  slot: number;
};

export type PublicApp = {
  id: string;
  fee_bps: number;
  version: string;
  active: boolean;
  slot: number;
};
