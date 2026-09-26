use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{COMP_DEF_OFFSET_MATCH_ORDER, SOL_USD_FEED_ID},
    error::ErrorCode,
    state::{
        AppConfig, BackstopOffer, BackstopStatus, Market, MarketAccount, MarketAccountStatus,
        MarketStatus, OrderKind, OrderRecord, OrderStatus, Protocol, QuoteRecord, QuoteStatus,
    },
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("match_order", trader)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, nonce: u64, app: Pubkey)]
pub struct SubmitOrder<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        seeds = [b"app", app.as_ref()],
        bump = app_config.bump,
        constraint = app_config.app == app && app_config.active @ ErrorCode::InvalidOrder,
    )]
    pub app_config: Box<Account<'info, AppConfig>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        constraint = market_account.owner == trader.key(),
        constraint = market_account.market == market.key() @ ErrorCode::WrongMarket,
        seeds = [b"market-account", market.key().as_ref(), trader.key().as_ref()],
        bump = market_account.bump,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(
        init,
        payer = trader,
        space = 8 + OrderRecord::INIT_SPACE,
        seeds = [b"order", market.key().as_ref(), trader.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump,
    )]
    pub order: Box<Account<'info, OrderRecord>>,
    #[account(init_if_needed, space = 9, payer = trader, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_MATCH_ORDER))]
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

#[callback_accounts("match_order")]
#[derive(Accounts)]
pub struct MatchOrderCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_MATCH_ORDER))]
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
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"market-account", market_account.market.as_ref(), market_account.owner.as_ref()], bump = market_account.bump)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"order", order.market.as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
}

#[init_computation_definition_accounts("match_order", payer)]
#[derive(Accounts)]
pub struct InitMatchOrderCompDef<'info> {
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
pub struct CancelOrder<'info> {
    pub actor: Signer<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.trader.as_ref()], bump = market_account.bump)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
}

pub fn init_match_order_comp_def_handler(ctx: Context<InitMatchOrderCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn submit_order_handler<'info>(
    ctx: Context<'info, SubmitOrder<'info>>,
    computation_offset: u64,
    nonce: u64,
    app: Pubkey,
    app_fee_bps: u16,
    app_fee_version: u64,
    deadline: i64,
    expected_revision: u64,
    expected_oracle_timestamp: i64,
    ciphertexts: [[u8; 32]; 5],
    input_key: [u8; 32],
    input_nonce: u128,
) -> Result<()> {
    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;
    require!(
        market.revision == expected_revision
            && market.oracle_timestamp == expected_oracle_timestamp,
        ErrorCode::StaleMarketSnapshot
    );
    require!(
        ctx.accounts.protocol.trading_enabled && market.status == MarketStatus::Active,
        ErrorCode::MarketNotActive
    );
    require!(market.pending_orders == 0, ErrorCode::WrongOrderStatus);
    require!(market.active_quote_count > 0, ErrorCode::InvalidOrder);
    require!(
        ctx.accounts.market_account.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(
        ctx.accounts.market_account.version < u64::MAX,
        ErrorCode::RevisionOverflow
    );
    require!(
        input_key != [0; 32] && app != Pubkey::default() && app != ctx.accounts.protocol.authority,
        ErrorCode::InvalidOrder
    );
    require!(
        app_fee_bps == ctx.accounts.app_config.fee_bps
            && app_fee_version == ctx.accounts.app_config.version,
        ErrorCode::InvalidOrder
    );
    require!(
        deadline > clock.unix_timestamp
            && deadline.saturating_sub(clock.unix_timestamp)
                <= i64::from(market.config.max_order_queue_seconds),
        ErrorCode::InvalidOrder
    );
    require!(
        market.oracle_timestamp > 0
            && clock.unix_timestamp >= market.oracle_timestamp
            && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
                <= i64::from(market.config.max_oracle_age_seconds),
        ErrorCode::StaleOracle
    );
    let count = usize::from(market.active_quote_count);
    require!(
        ctx.remaining_accounts.len() == count + 1,
        ErrorCode::WrongQuoteSnapshot
    );
    require_keys_eq!(
        ctx.remaining_accounts[0].key(),
        market.backstop_offer,
        ErrorCode::InvalidBackstop
    );
    let backstop = Account::<BackstopOffer>::try_from(&ctx.remaining_accounts[0])?;
    require!(
        backstop.status == BackstopStatus::Active
            && backstop.market == market.key()
            && backstop.expiry > clock.unix_timestamp,
        ErrorCode::InvalidBackstop
    );
    let mut capacities = [0u64; 4];
    let mut tiers = [0u8; 4];
    let mut self_matches = [false; 4];
    let mut keys = [Pubkey::default(); 4];
    let mut quotes = Vec::with_capacity(4);
    for (index, info) in ctx.remaining_accounts.iter().skip(1).enumerate() {
        require_keys_eq!(
            info.key(),
            market.active_quotes[index],
            ErrorCode::WrongQuoteSnapshot
        );
        let quote = Account::<QuoteRecord>::try_from(info)?;
        require_keys_eq!(quote.market, market.key(), ErrorCode::WrongMarket);
        require!(
            quote.status == QuoteStatus::Active && quote.expiry > clock.unix_timestamp,
            ErrorCode::WrongQuoteStatus
        );
        require!(
            quote.market_revision == market.revision,
            ErrorCode::InvalidQuote
        );
        capacities[index] = quote.remaining_capacity;
        tiers[index] = quote.tier_count;
        self_matches[index] = quote.maker == ctx.accounts.trader.key();
        keys[index] = info.key();
        quotes.push((quote.ciphertexts, quote.cipher_nonce));
    }
    while quotes.len() < 4 {
        quotes.push(quotes[0]);
    }
    let order = &mut ctx.accounts.order;
    order.trader = ctx.accounts.trader.key();
    order.market = market.key();
    order.app = app;
    order.app_fee_bps = app_fee_bps;
    order.app_fee_version = app_fee_version;
    order.nonce = nonce;
    order.deadline = deadline;
    order.quote_keys = keys;
    order.quote_count = count as u8;
    order.market_revision = market.revision;
    order.oracle_timestamp = market.oracle_timestamp;
    order.oracle_price_e8 = market.oracle_price_e8;
    order.trader_version = ctx.accounts.market_account.version;
    order.pending_computation = ctx.accounts.computation_account.key();
    order.kind = OrderKind::Trade;
    order.status = OrderStatus::Matching;
    order.bump = ctx.bumps.order;
    ctx.accounts.market_account.status = MarketAccountStatus::Matching;
    ctx.accounts.market_account.pending_computation = ctx.accounts.computation_account.key();
    market.pending_orders = 1;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let mut args = ArgBuilder::new()
        .x25519_pubkey(input_key)
        .plaintext_u128(input_nonce);
    args = args.encrypted_i8(ciphertexts[0]);
    for field in ciphertexts.iter().skip(1) {
        args = args.encrypted_u64(*field);
    }
    for (fields, cipher_nonce) in quotes {
        args = args.plaintext_u128(u128::from_le_bytes(cipher_nonce));
        for field in fields {
            args = args.encrypted_u64(field);
        }
    }
    args = args.plaintext_u8(count as u8);
    for capacity in capacities {
        args = args.plaintext_u64(capacity);
    }
    for tier in tiers {
        args = args.plaintext_u8(tier);
    }
    for self_match in self_matches {
        args = args.plaintext_bool(self_match);
    }
    for size_tier in market.config.quote_tiers {
        args = args.plaintext_u64(size_tier);
    }
    let args = args
        .plaintext_u64(market.oracle_price_e8)
        .plaintext_u16(market.config.initial_margin_bps)
        .plaintext_u16(market.config.trade_fee_bps)
        .plaintext_u16(market.config.insurance_fee_bps)
        .plaintext_u16(order.app_fee_bps)
        .plaintext_u16(market.config.max_quote_deviation_bps)
        .plaintext_u64(market.config.max_account_notional)
        .build();
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![MatchOrderCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.protocol.key(),
                    is_writable: false,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.market.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.market_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.order.key(),
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

pub fn match_order_callback_handler(
    ctx: Context<MatchOrderCallback>,
    output: SignedComputationOutputs<MatchOrderOutput>,
) -> Result<()> {
    let MatchOrderOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let order = &mut ctx.accounts.order;
    let account = &mut ctx.accounts.market_account;
    let market = &mut ctx.accounts.market;
    require!(
        order.status == OrderStatus::Matching
            && account.status == MarketAccountStatus::Matching
            && market.pending_orders == 1,
        ErrorCode::WrongOrderStatus
    );
    require_keys_eq!(order.market, market.key(), ErrorCode::WrongMarket);
    require_keys_eq!(order.trader, account.owner, ErrorCode::WrongMarginTransfer);
    require_keys_eq!(
        order.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        account.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    let clock = Clock::get()?;
    let selected = usize::from(result.field_1);
    let eligible = result.field_2
        && selected < usize::from(order.quote_count)
        && order.market_revision == market.revision
        && order.oracle_timestamp == market.oracle_timestamp
        && order.oracle_price_e8 == market.oracle_price_e8
        && order.trader_version == account.version
        && order.deadline > clock.unix_timestamp
        && clock.unix_timestamp >= market.oracle_timestamp
        && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
            <= i64::from(market.config.max_oracle_age_seconds)
        && market.status == MarketStatus::Active
        && ctx.accounts.protocol.trading_enabled;
    if eligible {
        order.selected_quote = order.quote_keys[selected];
        order.plan_ciphertexts = result.field_0.ciphertexts;
        order.plan_nonce = result.field_0.nonce.to_le_bytes();
        order.status = OrderStatus::Matched;
        account.status = MarketAccountStatus::Trading;
    } else {
        order.status = OrderStatus::Rejected;
        account.status = MarketAccountStatus::Ready;
        market.pending_orders = 0;
    }
    order.pending_computation = Pubkey::default();
    account.pending_computation = Pubkey::default();
    Ok(())
}

pub fn cancel_order_handler(ctx: Context<CancelOrder>) -> Result<()> {
    let order = &mut ctx.accounts.order;
    let account = &mut ctx.accounts.market_account;
    let market = &mut ctx.accounts.market;
    require!(
        Clock::get()?.unix_timestamp >= order.deadline,
        ErrorCode::OrderNotExpired
    );
    require!(market.pending_orders == 1, ErrorCode::WrongOrderStatus);
    require_keys_eq!(order.market, market.key(), ErrorCode::WrongMarket);
    require_keys_eq!(order.trader, account.owner, ErrorCode::WrongMarginTransfer);
    require!(
        order.status == OrderStatus::Matching || order.status == OrderStatus::Matched,
        ErrorCode::WrongOrderStatus
    );
    require!(
        account.status == MarketAccountStatus::Matching
            || account.status == MarketAccountStatus::Trading,
        ErrorCode::WrongMarketAccountStatus
    );
    order.status = OrderStatus::Cancelled;
    order.pending_computation = Pubkey::default();
    account.status = MarketAccountStatus::Ready;
    account.pending_computation = Pubkey::default();
    market.pending_orders = 0;
    Ok(())
}
