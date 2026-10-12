use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{COMP_DEF_OFFSET_ROTATE_QUOTE, SOL_USD_FEED_ID},
    error::ErrorCode,
    instructions::quote::snapshot_compatible,
    instructions::reserve::authorize_quote_actor,
    state::{
        Market, MarketAccount, MarketAccountStatus, MarketStatus, OperatorGrant, QuoteRecord,
        QuoteStatus,
    },
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("rotate_quote", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct RotateQuote<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    pub grant: Option<Box<Account<'info, OperatorGrant>>>,
    #[account(
        mut,
        constraint = market_account.owner == quote.maker,
        constraint = market_account.market == market.key() @ ErrorCode::WrongMarket,
        seeds = [b"market-account", market.key().as_ref(), quote.maker.as_ref()],
        bump = market_account.bump,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(
        mut,
        constraint = quote.market == market.key() @ ErrorCode::WrongMarket,
        seeds = [b"quote", market.key().as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()],
        bump = quote.bump,
    )]
    pub quote: Box<Account<'info, QuoteRecord>>,
    #[account(mut, constraint = prior.market == market.key() @ ErrorCode::WrongMarket,
        constraint = prior.maker == quote.maker @ ErrorCode::WrongMarket,
        seeds = [b"quote", prior.market.as_ref(), prior.maker.as_ref(), prior.nonce.to_le_bytes().as_ref()], bump = prior.bump)]
    pub prior: Box<Account<'info, QuoteRecord>>,
    #[account(init_if_needed, space = 9, payer = payer, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_ROTATE_QUOTE))]
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

#[callback_accounts("rotate_quote")]
#[derive(Accounts)]
pub struct RotateQuoteCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_ROTATE_QUOTE))]
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
    #[account(mut, seeds = [b"market-account", market_account.market.as_ref(), market_account.owner.as_ref()], bump = market_account.bump)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"quote", quote.market.as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()], bump = quote.bump)]
    pub quote: Box<Account<'info, QuoteRecord>>,
    #[account(mut, constraint = prior.market == market.key() @ ErrorCode::WrongMarket,
        constraint = prior.maker == quote.maker @ ErrorCode::WrongMarket,
        seeds = [b"quote", prior.market.as_ref(), prior.maker.as_ref(), prior.nonce.to_le_bytes().as_ref()], bump = prior.bump)]
    pub prior: Box<Account<'info, QuoteRecord>>,
}

#[init_computation_definition_accounts("rotate_quote", payer)]
#[derive(Accounts)]
pub struct InitRotateQuoteCompDef<'info> {
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

pub fn init_rotate_quote_comp_def_handler(ctx: Context<InitRotateQuoteCompDef>) -> Result<()> {
    init_depth_comp_def!(ctx.accounts, "rotate_quote")?;
    Ok(())
}

pub fn rotate_quote_handler(ctx: Context<RotateQuote>, computation_offset: u64) -> Result<()> {
    let market = &ctx.accounts.market;
    let account = &mut ctx.accounts.market_account;
    let prior = &ctx.accounts.prior;
    let quote = &mut ctx.accounts.quote;
    let now = Clock::get()?.unix_timestamp;
    authorize_quote_actor(
        ctx.accounts.payer.key(),
        prior,
        ctx.accounts.grant.as_deref(),
    )?;
    authorize_quote_actor(
        ctx.accounts.payer.key(),
        quote,
        ctx.accounts.grant.as_deref(),
    )?;
    require!(
        prior.replacement_nonce == Some(quote.nonce),
        ErrorCode::InvalidQuote
    );
    require!(
        prior.status == QuoteStatus::Active && prior.attached_orders == 0,
        ErrorCode::WrongQuoteStatus
    );
    require!(
        quote.status == QuoteStatus::Validated,
        ErrorCode::WrongQuoteStatus
    );
    require!(market.pending_orders == 0, ErrorCode::WrongOrderStatus);
    require!(
        market.status != MarketStatus::Paused && market.status != MarketStatus::Settling,
        ErrorCode::InvalidQuote
    );
    require!(
        market.active_quotes[..usize::from(market.active_quote_count)].contains(&prior.key()),
        ErrorCode::WrongQuoteSnapshot
    );
    require!(
        account.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(account.version < u64::MAX, ErrorCode::RevisionOverflow);
    require!(
        snapshot_compatible(quote, market) && quote.expiry > now,
        ErrorCode::InvalidQuote
    );
    require!(
        market.oracle_timestamp > 0
            && now >= market.oracle_timestamp
            && now.saturating_sub(market.oracle_timestamp)
                <= i64::from(market.config.max_oracle_age_seconds),
        ErrorCode::StaleOracle
    );
    require!(
        market
            .quoted_notional
            .checked_sub(prior.capacity)
            .and_then(|total| total.checked_add(quote.capacity))
            .is_some_and(|total| total <= market.config.max_market_notional),
        ErrorCode::QuoteCapacityExceeded
    );
    quote.status = QuoteStatus::Reserving;
    quote.oracle_timestamp = market.oracle_timestamp;
    quote.funding_index = market.funding_index;
    quote.pending_computation = ctx.accounts.computation_account.key();
    account.status = MarketAccountStatus::Reserving;
    account.pending_computation = ctx.accounts.computation_account.key();
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    let mut args = ArgBuilder::new()
        .plaintext_u128(u128::from_le_bytes(account.nonce))
        .encrypted_u64(account.ciphertexts[0])
        .encrypted_u64(account.ciphertexts[1])
        .encrypted_u64(account.ciphertexts[2])
        .plaintext_u128(u128::from_le_bytes(prior.balance_nonce))
        .encrypted_u128(prior.balance_ciphertext)
        .plaintext_u64(prior.required_margin)
        .plaintext_u64(prior.capacity)
        .plaintext_u64(quote.required_margin)
        .plaintext_u64(quote.capacity)
        .plaintext_u64(market.config.max_account_notional)
        .plaintext_u64(market.oracle_price_e8)
        .plaintext_i128(market.funding_index)
        .plaintext_u16(market.config.initial_margin_bps);
    for byte in account.key().to_bytes() {
        args = args.plaintext_u8(byte);
    }
    let args = args
        .plaintext_u64(account.version)
        .x25519_pubkey(account.recovery_key)
        .build();
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![RotateQuoteCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.market.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.market_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.quote.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.prior.key(),
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

pub fn rotate_quote_callback_handler(
    ctx: Context<RotateQuoteCallback>,
    output: SignedComputationOutputs<RotateQuoteOutput>,
) -> Result<()> {
    let RotateQuoteOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let market = &mut ctx.accounts.market;
    let account = &mut ctx.accounts.market_account;
    let prior = &mut ctx.accounts.prior;
    let quote = &mut ctx.accounts.quote;
    require!(
        quote.status == QuoteStatus::Reserving && account.status == MarketAccountStatus::Reserving,
        ErrorCode::WrongQuoteStatus
    );
    require_keys_eq!(account.owner, quote.maker, ErrorCode::WrongMarginTransfer);
    require_keys_eq!(account.market, market.key(), ErrorCode::WrongMarket);
    require_keys_eq!(
        quote.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        account.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require!(
        prior.replacement_nonce == Some(quote.nonce),
        ErrorCode::InvalidQuote
    );
    let now = Clock::get()?.unix_timestamp;
    let count = usize::from(market.active_quote_count);
    let index = market.active_quotes[..count]
        .iter()
        .position(|key| *key == prior.key());
    let total = market
        .quoted_notional
        .checked_sub(prior.capacity)
        .and_then(|value| value.checked_add(quote.capacity));
    let eligible = result.field_3
        && index.is_some()
        && prior.status == QuoteStatus::Active
        && prior.attached_orders == 0
        && market.pending_orders == 0
        && market.status != MarketStatus::Paused
        && market.status != MarketStatus::Settling
        && quote.market_revision == market.revision
        && quote.oracle_timestamp == market.oracle_timestamp
        && quote.funding_index == market.funding_index
        && quote.expiry > now
        && market.oracle_timestamp > 0
        && now >= market.oracle_timestamp
        && now.saturating_sub(market.oracle_timestamp)
            <= i64::from(market.config.max_oracle_age_seconds)
        && total.is_some_and(|value| value <= market.config.max_market_notional);
    if eligible {
        require!(
            result.field_1.encryption_key == account.recovery_key,
            ErrorCode::WrongRecoveryKey
        );
        account.ciphertexts = result.field_0.ciphertexts;
        account.nonce = result.field_0.nonce.to_le_bytes();
        account.recovery_ciphertexts = result.field_1.ciphertexts;
        account.recovery_nonce = result.field_1.nonce.to_le_bytes();
        account.commitment = result.field_2;
        account.version = account
            .version
            .checked_add(1)
            .ok_or(ErrorCode::RevisionOverflow)?;
        market.active_quotes[index.ok_or(ErrorCode::WrongQuoteSnapshot)?] = quote.key();
        market.active_quotes[..count].sort_unstable_by_key(|key| key.to_bytes());
        market.quoted_notional = total.ok_or(ErrorCode::QuoteCapacityExceeded)?;
        quote.status = QuoteStatus::Active;
        prior.status = QuoteStatus::Cancelled;
    } else {
        quote.status = QuoteStatus::Validated;
    }
    account.status = MarketAccountStatus::Ready;
    account.pending_computation = Pubkey::default();
    quote.pending_computation = Pubkey::default();
    Ok(())
}
