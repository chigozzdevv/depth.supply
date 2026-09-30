use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{COMP_DEF_OFFSET_PREPARE_QUOTE, SOL_USD_FEED_ID},
    error::ErrorCode,
    instructions::operator::authorize_operator,
    state::{
        Market, MarketAccount, MarketAccountStatus, MarketStatus, OperatorGrant, QuoteRecord,
        QuoteStatus,
    },
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("prepare_quote", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, nonce: u64)]
pub struct SubmitQuote<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(seeds = [b"market-account", market.key().as_ref(), market_account.owner.as_ref()], bump = market_account.bump, constraint = market_account.market == market.key() @ ErrorCode::WrongMarket)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    pub grant: Option<Box<Account<'info, OperatorGrant>>>,
    #[account(
        init,
        payer = payer,
        space = 8 + QuoteRecord::INIT_SPACE,
        seeds = [b"quote", market.key().as_ref(), market_account.owner.as_ref(), nonce.to_le_bytes().as_ref()],
        bump,
    )]
    pub quote: Box<Account<'info, QuoteRecord>>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PREPARE_QUOTE))]
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

#[callback_accounts("prepare_quote")]
#[derive(Accounts)]
pub struct PrepareQuoteCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PREPARE_QUOTE))]
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
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        seeds = [b"quote", quote.market.as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()],
        bump = quote.bump,
    )]
    pub quote: Box<Account<'info, QuoteRecord>>,
}

#[init_computation_definition_accounts("prepare_quote", payer)]
#[derive(Accounts)]
pub struct InitPrepareQuoteCompDef<'info> {
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
pub struct CancelPreparedQuote<'info> {
    pub actor: Signer<'info>,
    pub grant: Option<Box<Account<'info, OperatorGrant>>>,
    #[account(
        mut,
        seeds = [b"quote", quote.market.as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()],
        bump = quote.bump,
    )]
    pub quote: Box<Account<'info, QuoteRecord>>,
}

#[derive(Accounts)]
pub struct CloseQuote<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,
    #[account(
        mut,
        close = maker,
        constraint = quote.maker == maker.key(),
        seeds = [b"quote", quote.market.as_ref(), maker.key().as_ref(), quote.nonce.to_le_bytes().as_ref()],
        bump = quote.bump,
    )]
    pub quote: Box<Account<'info, QuoteRecord>>,
}

pub fn init_prepare_quote_comp_def_handler(ctx: Context<InitPrepareQuoteCompDef>) -> Result<()> {
    init_depth_comp_def!(ctx.accounts, "prepare_quote")?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn submit_quote_handler(
    ctx: Context<SubmitQuote>,
    computation_offset: u64,
    nonce: u64,
    capacity: u64,
    tier_count: u8,
    expiry: i64,
    expected_revision: u64,
    expected_oracle_timestamp: i64,
    ciphertexts: [[u8; 32]; 6],
    input_key: [u8; 32],
    input_nonce: u128,
) -> Result<()> {
    let market = &ctx.accounts.market;
    let clock = Clock::get()?;
    require!(
        market.revision == expected_revision
            && market.oracle_timestamp == expected_oracle_timestamp,
        ErrorCode::StaleMarketSnapshot
    );
    require!(
        market.status != MarketStatus::Paused && market.status != MarketStatus::Settling,
        ErrorCode::InvalidQuote
    );
    require!(tier_count > 0 && tier_count <= 4, ErrorCode::InvalidQuote);
    require!(
        capacity >= market.config.quote_tiers[usize::from(tier_count - 1)]
            && capacity <= market.config.max_account_notional,
        ErrorCode::InvalidQuote
    );
    require!(
        expiry > clock.unix_timestamp
            && expiry.saturating_sub(clock.unix_timestamp)
                <= i64::from(market.config.max_quote_lifetime_seconds),
        ErrorCode::InvalidQuote
    );
    require!(
        market.oracle_timestamp > 0
            && clock.unix_timestamp >= market.oracle_timestamp
            && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
                <= i64::from(market.config.max_oracle_age_seconds),
        ErrorCode::StaleOracle
    );
    require!(input_key != [0; 32], ErrorCode::InvalidQuote);
    require!(
        ctx.accounts.market_account.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    let operator_version = authorize_operator(
        ctx.accounts.payer.key(),
        ctx.accounts.market_account.owner,
        market.key(),
        capacity,
        expiry,
        false,
        ctx.accounts.grant.as_deref(),
    )?;
    let required_margin = u128::from(capacity)
        .checked_mul(u128::from(market.config.initial_margin_bps))
        .ok_or(ErrorCode::InvalidQuote)?
        .div_ceil(10_000);
    let required_margin = u64::try_from(required_margin).map_err(|_| ErrorCode::InvalidQuote)?;
    let quote = &mut ctx.accounts.quote;
    quote.maker = ctx.accounts.market_account.owner;
    quote.operator = ctx.accounts.payer.key();
    quote.operator_version = operator_version;
    quote.market = market.key();
    quote.nonce = nonce;
    quote.capacity = capacity;
    quote.required_margin = required_margin;
    quote.expiry = expiry;
    quote.tier_count = tier_count;
    quote.market_revision = market.revision;
    quote.oracle_timestamp = market.oracle_timestamp;
    quote.pending_computation = ctx.accounts.computation_account.key();
    quote.replacement_nonce = None;
    quote.status = QuoteStatus::Validating;
    quote.bump = ctx.bumps.quote;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let mut args = ArgBuilder::new()
        .x25519_pubkey(input_key)
        .plaintext_u128(input_nonce);
    for field in ciphertexts {
        args = args.encrypted_u64(field);
    }
    let args = args
        .plaintext_u64(market.oracle_price_e8)
        .plaintext_u16(market.config.max_quote_deviation_bps)
        .plaintext_u8(tier_count)
        .plaintext_u64(capacity)
        .plaintext_u64(required_margin)
        .build();
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![PrepareQuoteCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.market.key(),
                    is_writable: false,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.quote.key(),
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

pub fn prepare_quote_callback_handler(
    ctx: Context<PrepareQuoteCallback>,
    output: SignedComputationOutputs<PrepareQuoteOutput>,
) -> Result<()> {
    let PrepareQuoteOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let quote = &mut ctx.accounts.quote;
    require!(
        quote.status == QuoteStatus::Validating,
        ErrorCode::WrongQuoteStatus
    );
    require_keys_eq!(
        quote.market,
        ctx.accounts.market.key(),
        ErrorCode::WrongMarket
    );
    require_keys_eq!(
        quote.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    let clock = Clock::get()?;
    if result.field_2
        && quote.market_revision == ctx.accounts.market.revision
        && quote.oracle_timestamp == ctx.accounts.market.oracle_timestamp
        && quote.expiry > clock.unix_timestamp
        && clock.unix_timestamp >= quote.oracle_timestamp
        && clock.unix_timestamp.saturating_sub(quote.oracle_timestamp)
            <= i64::from(ctx.accounts.market.config.max_oracle_age_seconds)
    {
        quote.ciphertexts = result.field_0.ciphertexts;
        quote.cipher_nonce = result.field_0.nonce.to_le_bytes();
        quote.balance_ciphertext = result.field_1.ciphertexts[0];
        quote.balance_nonce = result.field_1.nonce.to_le_bytes();
        quote.status = QuoteStatus::Validated;
    } else {
        quote.status = QuoteStatus::Rejected;
    }
    quote.pending_computation = Pubkey::default();
    Ok(())
}

pub fn cancel_prepared_quote_handler(ctx: Context<CancelPreparedQuote>) -> Result<()> {
    let quote = &ctx.accounts.quote;
    require!(
        ctx.accounts.actor.key() == quote.maker || ctx.accounts.actor.key() == quote.operator,
        ErrorCode::Unauthorized
    );
    let version = authorize_operator(
        ctx.accounts.actor.key(),
        quote.maker,
        quote.market,
        quote.capacity,
        quote.expiry,
        false,
        ctx.accounts.grant.as_deref(),
    )?;
    require!(
        ctx.accounts.actor.key() == quote.maker || version == quote.operator_version,
        ErrorCode::Unauthorized
    );
    require!(
        ctx.accounts.quote.status == QuoteStatus::Validating
            || ctx.accounts.quote.status == QuoteStatus::Validated,
        ErrorCode::WrongQuoteStatus
    );
    ctx.accounts.quote.status = QuoteStatus::Cancelled;
    ctx.accounts.quote.pending_computation = Pubkey::default();
    Ok(())
}

pub fn close_quote_handler(ctx: Context<CloseQuote>) -> Result<()> {
    require!(
        ctx.accounts.quote.status == QuoteStatus::Cancelled
            || ctx.accounts.quote.status == QuoteStatus::Filled
            || ctx.accounts.quote.status == QuoteStatus::Rejected,
        ErrorCode::WrongQuoteStatus
    );
    require!(
        ctx.accounts.quote.attached_orders == 0,
        ErrorCode::QuoteHasOrders
    );
    Ok(())
}
