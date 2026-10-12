use anchor_lang::prelude::*;
use arcium_anchor::comp_def_offset;

#[constant]
pub const SEED: &str = "arcium";

pub const COMP_DEF_OFFSET_OPEN_BALANCE: u32 = comp_def_offset("open_balance");
pub const COMP_DEF_OFFSET_CREDIT_BALANCE: u32 = comp_def_offset("credit_balance");
pub const COMP_DEF_OFFSET_DEBIT_BALANCE: u32 = comp_def_offset("debit_balance");
pub const COMP_DEF_OFFSET_VIEW_BALANCE: u32 = comp_def_offset("view_balance");
pub const COMP_DEF_OFFSET_OPEN_MARKET: u32 = comp_def_offset("open_market");
pub const COMP_DEF_OFFSET_DEBIT_FREE: u32 = comp_def_offset("debit_free");
pub const COMP_DEF_OFFSET_CREDIT_FREE: u32 = comp_def_offset("credit_free");
pub const COMP_DEF_OFFSET_DEBIT_MARKET: u32 = comp_def_offset("debit_market_v2");
pub const COMP_DEF_OFFSET_CREDIT_MARKET: u32 = comp_def_offset("credit_market");
pub const COMP_DEF_OFFSET_PREPARE_QUOTE: u32 = comp_def_offset("prepare_quote");
pub const COMP_DEF_OFFSET_RESERVE_QUOTE: u32 = comp_def_offset("reserve_quote_v2");
pub const COMP_DEF_OFFSET_ROTATE_QUOTE: u32 = comp_def_offset("rotate_quote");
pub const COMP_DEF_OFFSET_RELEASE_QUOTE: u32 = comp_def_offset("release_quote");
pub const COMP_DEF_OFFSET_MATCH_ORDER: u32 = comp_def_offset("match_order");
pub const COMP_DEF_OFFSET_OPEN_CLEARING: u32 = comp_def_offset("open_clearing");
pub const COMP_DEF_OFFSET_CREDIT_INSURANCE: u32 = comp_def_offset("credit_insurance");
pub const COMP_DEF_OFFSET_SETTLE_TRADE: u32 = comp_def_offset("settle_trade_v2");
pub const COMP_DEF_OFFSET_CLAIM_TRADE_FEES: u32 = comp_def_offset("claim_trade_fees");
pub const COMP_DEF_OFFSET_SEAL_TRADE_FEES: u32 = comp_def_offset("seal_trade_fees");
pub const COMP_DEF_OFFSET_LIQUIDATE: u32 = comp_def_offset("liquidate_v2");
pub const COMP_DEF_OFFSET_OFFER_BACKSTOP: u32 = comp_def_offset("offer_backstop_v2");
pub const COMP_DEF_OFFSET_RELEASE_BACKSTOP: u32 = comp_def_offset("release_backstop");
pub const COMP_DEF_OFFSET_SEAL_MARKET: u32 = comp_def_offset("seal_market");
pub const COMP_DEF_OFFSET_SEAL_CLEARING: u32 = comp_def_offset("seal_clearing");
pub const COMP_DEF_OFFSET_VIEW_MARKET: u32 = comp_def_offset("view_market");
pub const COMP_DEF_OFFSET_VIEW_QUOTE: u32 = comp_def_offset("view_quote");
pub const COMP_DEF_OFFSET_VIEW_FILL: u32 = comp_def_offset("view_fill");

pub const MIN_SOL_PRICE_E8: u64 = 100_000_000;
pub const MAX_SOL_PRICE_E8: u64 = 100_000_000_000_000;
pub const MAX_ORACLE_AGE_SECONDS: u32 = if cfg!(feature = "devnet") { 600 } else { 300 };

pub const SOL_USD_FEED_ID: [u8; 32] = [
    0xef, 0x0d, 0x8b, 0x6f, 0xda, 0x2c, 0xeb, 0xa4, 0x1d, 0xa1, 0x5d, 0x40, 0x95, 0xd1, 0xda, 0x39,
    0x2a, 0x0d, 0x2f, 0x8e, 0xd0, 0xc6, 0xc7, 0xbc, 0x0f, 0x4c, 0xfa, 0xc8, 0xc2, 0x80, 0xb5, 0x6d,
];
