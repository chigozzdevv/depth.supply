use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{COMP_DEF_OFFSET_SETTLE_TRADE, SOL_USD_FEED_ID},
    error::ErrorCode,
    state::{
        ClearingAccount, ClearingStatus, Market, MarketAccount, MarketAccountStatus, MarketStatus,
        OrderRecord, OrderStatus, QuoteRecord, QuoteStatus,
    },
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("settle_trade_v2", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SettleTrade<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub trade: TradeSettlement<'info>,
    #[account(init_if_needed, space = 9, payer = payer, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account))]
    /// CHECK: The Arcium program validates the mempool account.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account))]
    /// CHECK: The Arcium program validates the execution pool.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account))]
    /// CHECK: The Arcium program validates the computation account.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SETTLE_TRADE))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[derive(Accounts)]
pub struct TradeSettlement<'info> {
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(mut, constraint = trader_account.market == market.key() @ ErrorCode::WrongMarket, seeds = [b"market-account", market.key().as_ref(), order.trader.as_ref()], bump = trader_account.bump)]
    pub trader_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, constraint = maker_account.market == market.key() @ ErrorCode::WrongMarket, seeds = [b"market-account", market.key().as_ref(), maker_account.owner.as_ref()], bump = maker_account.bump)]
    pub maker_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
}

#[callback_accounts("settle_trade_v2")]
#[derive(Accounts)]
pub struct SettleTradeV2Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SETTLE_TRADE))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: The signed Arcium output is verified against this computation account.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(address = ::arcium_anchor::solana_instructions_sysvar::ID)]
    /// CHECK: The account constraint validates the instructions sysvar.
    pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.trader.as_ref()], bump = trader_account.bump)]
    pub trader_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), quote.maker.as_ref()], bump = maker_account.bump)]
    pub maker_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"quote", market.key().as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()], bump = quote.bump)]
    pub quote: Box<Account<'info, QuoteRecord>>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
}

#[init_computation_definition_accounts("settle_trade_v2", payer)]
#[derive(Accounts)]
pub struct InitSettleTradeCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: The Arcium program initializes and validates this account.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: The Arcium program validates this address lookup table.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelTrade<'info> {
    pub actor: Signer<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.trader.as_ref()], bump = trader_account.bump)]
    pub trader_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), quote.maker.as_ref()], bump = maker_account.bump)]
    pub maker_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"quote", market.key().as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()], bump = quote.bump)]
    pub quote: Box<Account<'info, QuoteRecord>>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
}

pub fn init_settle_trade_comp_def_handler(ctx: Context<InitSettleTradeCompDef>) -> Result<()> {
    init_depth_comp_def!(ctx.accounts, "settle_trade_v2")?;
    Ok(())
}

pub fn settle_trade_handler<'info>(
    ctx: Context<'info, SettleTrade<'info>>,
    computation_offset: u64,
) -> Result<()> {
    require!(
        ctx.remaining_accounts.len() == 1,
        ErrorCode::WrongQuoteSnapshot
    );
    let quote = Account::<QuoteRecord>::try_from(&ctx.remaining_accounts[0])?;
    let clock = Clock::get()?;
    let market = &ctx.accounts.trade.market;
    let order = &ctx.accounts.trade.order;
    let trader = &ctx.accounts.trade.trader_account;
    let maker = &ctx.accounts.trade.maker_account;
    let clearing = &ctx.accounts.trade.clearing;
    require!(
        market.status == MarketStatus::Active
            || (market.status == MarketStatus::Paused && order.reduce_only),
        ErrorCode::MarketNotActive
    );
    require!(
        market.has_pending(order.key()) && order.status == OrderStatus::Matched,
        ErrorCode::WrongOrderStatus
    );
    require!(
        trader.status == MarketAccountStatus::Trading && maker.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(
        clearing.status == ClearingStatus::Ready,
        ErrorCode::WrongClearingStatus
    );
    require!(
        quote.status == QuoteStatus::Active,
        ErrorCode::WrongQuoteStatus
    );
    require_keys_eq!(order.market, market.key(), ErrorCode::WrongMarket);
    require_keys_eq!(quote.market, market.key(), ErrorCode::WrongMarket);
    require_keys_eq!(clearing.market, market.key(), ErrorCode::WrongMarket);
    require_keys_eq!(order.trader, trader.owner, ErrorCode::WrongMarginTransfer);
    require_keys_eq!(quote.maker, maker.owner, ErrorCode::WrongMarginTransfer);
    require_keys_eq!(
        order.selected_quote,
        quote.key(),
        ErrorCode::WrongQuoteSnapshot
    );
    require!(trader.owner != maker.owner, ErrorCode::InvalidOrder);
    require!(
        order.deadline > clock.unix_timestamp,
        ErrorCode::OrderExpired
    );
    require!(
        order.market_revision == market.revision
            && order.oracle_timestamp == market.oracle_timestamp
            && order.oracle_price_e8 == market.oracle_price_e8,
        ErrorCode::StaleOracle
    );
    require!(
        clock.unix_timestamp >= market.oracle_timestamp
            && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
                <= i64::from(market.config.max_oracle_age_seconds),
        ErrorCode::StaleOracle
    );
    require!(
        trader.version == order.trader_version
            && trader.version < u64::MAX
            && maker.version < u64::MAX
            && clearing.version < u64::MAX,
        ErrorCode::RevisionOverflow
    );
    require!(
        market.active_quotes[..usize::from(market.active_quote_count)].contains(&quote.key()),
        ErrorCode::WrongQuoteSnapshot
    );
    let order = &mut ctx.accounts.trade.order;
    order.maker = quote.maker;
    order.maker_version = maker.version;
    order.clearing_version = clearing.version;
    order.funding_index = market.funding_index;
    order.pending_computation = ctx.accounts.computation_account.key();
    order.status = OrderStatus::Settling;
    ctx.accounts.trade.trader_account.pending_computation = ctx.accounts.computation_account.key();
    ctx.accounts.trade.maker_account.pending_computation = ctx.accounts.computation_account.key();
    ctx.accounts.trade.maker_account.status = MarketAccountStatus::Trading;
    ctx.accounts.trade.clearing.pending_computation = ctx.accounts.computation_account.key();
    ctx.accounts.trade.clearing.status = ClearingStatus::Trading;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let mut args = ArgBuilder::new()
        .plaintext_u128(u128::from_le_bytes(order.plan_nonce))
        .encrypted_u64(order.plan_ciphertexts[0])
        .encrypted_u64(order.plan_ciphertexts[1])
        .encrypted_u64(order.plan_ciphertexts[2]);
    for account in [
        &ctx.accounts.trade.trader_account,
        &ctx.accounts.trade.maker_account,
    ] {
        args = args.plaintext_u128(u128::from_le_bytes(account.nonce));
        for field in account.ciphertexts {
            args = args.encrypted_u64(field);
        }
    }
    args = args.plaintext_u128(u128::from_le_bytes(ctx.accounts.trade.clearing.nonce));
    for field in ctx.accounts.trade.clearing.ciphertexts {
        args = args.encrypted_u64(field);
    }
    args = args
        .plaintext_u128(u128::from_le_bytes(quote.balance_nonce))
        .encrypted_u64(quote.balance_ciphertext);
    let args = args
        .plaintext_u64(quote.capacity)
        .plaintext_u64(quote.required_margin)
        .plaintext_u64(market.oracle_price_e8)
        .plaintext_i128(market.funding_index)
        .plaintext_u16(market.config.initial_margin_bps)
        .plaintext_u64(market.config.max_account_notional)
        .plaintext_u64(market.config.max_market_notional)
        .build();
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![SettleTradeV2Callback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.trade.market.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.trade.clearing.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.trade.trader_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.trade.maker_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: quote.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.trade.order.key(),
                    is_writable: true,
                },
            ],
        )?],
        1,
        0,
        0,
    )?;
    Ok(())
}

pub fn settle_trade_v2_callback_handler(
    ctx: Context<SettleTradeV2Callback>,
    output: SignedComputationOutputs<SettleTradeV2Output>,
) -> Result<()> {
    let SettleTradeV2Output { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let order = &mut ctx.accounts.order;
    let trader = &mut ctx.accounts.trader_account;
    let maker = &mut ctx.accounts.maker_account;
    let clearing = &mut ctx.accounts.clearing;
    let quote = &mut ctx.accounts.quote;
    let market = &mut ctx.accounts.market;
    require!(
        order.status == OrderStatus::Settling && market.has_pending(order.key()),
        ErrorCode::WrongOrderStatus
    );
    require!(
        trader.status == MarketAccountStatus::Trading
            && maker.status == MarketAccountStatus::Trading,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(
        clearing.status == ClearingStatus::Trading,
        ErrorCode::WrongClearingStatus
    );
    require_keys_eq!(
        order.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        trader.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        maker.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        clearing.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(order.market, market.key(), ErrorCode::WrongMarket);
    require_keys_eq!(order.trader, trader.owner, ErrorCode::WrongMarginTransfer);
    require_keys_eq!(quote.maker, maker.owner, ErrorCode::WrongMarginTransfer);
    require_keys_eq!(
        order.selected_quote,
        quote.key(),
        ErrorCode::WrongQuoteSnapshot
    );
    require_keys_eq!(clearing.market, market.key(), ErrorCode::WrongMarket);
    let clock = Clock::get()?;
    let eligible = result.field_4
        && (market.status == MarketStatus::Active
            || (market.status == MarketStatus::Paused && order.reduce_only))
        && quote.status == QuoteStatus::Active
        && order.deadline > clock.unix_timestamp
        && order.market_revision == market.revision
        && order.oracle_timestamp == market.oracle_timestamp
        && order.oracle_price_e8 == market.oracle_price_e8
        && order.funding_index == market.funding_index
        && order.trader_version == trader.version
        && order.maker_version == maker.version
        && order.clearing_version == clearing.version
        && clock.unix_timestamp >= market.oracle_timestamp
        && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
            <= i64::from(market.config.max_oracle_age_seconds);
    if eligible {
        order.candidate_primary = result.field_0.ciphertexts;
        order.candidate_primary_nonce = result.field_0.nonce.to_le_bytes();
        order.candidate_secondary = result.field_1.ciphertexts;
        order.candidate_secondary_nonce = result.field_1.nonce.to_le_bytes();
        order.candidate_clearing = result.field_2.ciphertexts;
        order.candidate_clearing_nonce = result.field_2.nonce.to_le_bytes();
        quote.pending_balance_ciphertext = result.field_3.ciphertexts[0];
        quote.pending_balance_nonce = result.field_3.nonce.to_le_bytes();
        order.status = OrderStatus::RiskApproved;
    } else {
        order.status = OrderStatus::Rejected;
        trader.status = MarketAccountStatus::Ready;
        maker.status = MarketAccountStatus::Ready;
        clearing.status = ClearingStatus::Ready;
        market.clear_pending(order.key())?;
    }
    order.pending_computation = Pubkey::default();
    trader.pending_computation = Pubkey::default();
    maker.pending_computation = Pubkey::default();
    clearing.pending_computation = Pubkey::default();
    Ok(())
}

pub fn cancel_trade_handler(ctx: Context<CancelTrade>) -> Result<()> {
    let order = &mut ctx.accounts.order;
    require!(
        Clock::get()?.unix_timestamp >= order.deadline,
        ErrorCode::OrderNotExpired
    );
    require!(
        (order.status == OrderStatus::Settling
            || order.status == OrderStatus::RiskApproved
            || order.status == OrderStatus::SealingTrader
            || order.status == OrderStatus::TraderSealed
            || order.status == OrderStatus::SealingMaker
            || order.status == OrderStatus::MakerSealed
            || order.status == OrderStatus::SealingClearing)
            && ctx.accounts.market.has_pending(order.key()),
        ErrorCode::WrongOrderStatus
    );
    require_keys_eq!(
        order.selected_quote,
        ctx.accounts.quote.key(),
        ErrorCode::WrongQuoteSnapshot
    );
    require_keys_eq!(
        order.trader,
        ctx.accounts.trader_account.owner,
        ErrorCode::WrongMarginTransfer
    );
    require_keys_eq!(
        ctx.accounts.quote.maker,
        ctx.accounts.maker_account.owner,
        ErrorCode::WrongMarginTransfer
    );
    require_keys_eq!(
        ctx.accounts.clearing.market,
        ctx.accounts.market.key(),
        ErrorCode::WrongMarket
    );
    let computation = order.pending_computation;
    require_keys_eq!(
        ctx.accounts.trader_account.pending_computation,
        computation,
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        ctx.accounts.maker_account.pending_computation,
        computation,
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        ctx.accounts.clearing.pending_computation,
        computation,
        ErrorCode::WrongPendingComputation
    );
    order.status = OrderStatus::Cancelled;
    order.pending_computation = Pubkey::default();
    ctx.accounts.trader_account.status = MarketAccountStatus::Ready;
    ctx.accounts.trader_account.pending_computation = Pubkey::default();
    ctx.accounts.maker_account.status = MarketAccountStatus::Ready;
    ctx.accounts.maker_account.pending_computation = Pubkey::default();
    ctx.accounts.clearing.status = ClearingStatus::Ready;
    ctx.accounts.clearing.pending_computation = Pubkey::default();
    ctx.accounts.quote.pending_balance_ciphertext = [0; 32];
    ctx.accounts.quote.pending_balance_nonce = [0; 16];
    ctx.accounts.market.clear_pending(order.key())?;
    Ok(())
}
