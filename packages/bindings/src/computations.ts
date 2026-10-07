export const computations = [
  "claim_trade_fees",
  "credit_balance",
  "credit_free",
  "credit_insurance",
  "credit_market",
  "debit_balance",
  "debit_free",
  "debit_market_v2",
  "liquidate_v2",
  "match_order",
  "offer_backstop_v2",
  "open_balance",
  "open_clearing",
  "open_market",
  "prepare_quote",
  "release_backstop",
  "release_quote",
  "reserve_quote_v2",
  "seal_clearing",
  "seal_market",
  "seal_trade_fees",
  "settle_trade_v2",
  "view_balance",
  "view_fill",
  "view_market",
  "view_quote"
] as const;

export function computationName(name: string) {
  const current = computations.find(
    (value) => value === name || value.replace(/_v\d+$/, "") === name,
  );
  if (!current) throw new Error(`Unknown Depth computation: ${name}`);
  return current;
}
