use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{COMP_DEF_OFFSET_RELEASE_QUOTE, COMP_DEF_OFFSET_RESERVE_QUOTE, SOL_USD_FEED_ID},
    error::ErrorCode,
    instructions::operator::authorize_operator,
    state::{
        Market, MarketAccount, MarketAccountStatus, MarketStatus, OperatorGrant, Protocol,
        QuoteQueue, QuoteRecord, QuoteStatus,
    },
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("reserve_quote", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ReserveQuote<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_RESERVE_QUOTE))]
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

#[callback_accounts("reserve_quote")]
#[derive(Accounts)]
pub struct ReserveQuoteCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_RESERVE_QUOTE))]
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
    #[account(mut, seeds = [b"quote", quote.market.as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()], bump = quote.bump)]
    pub quote: Box<Account<'info, QuoteRecord>>,
}

#[init_computation_definition_accounts("reserve_quote", payer)]
#[derive(Accounts)]
pub struct InitReserveQuoteCompDef<'info> {
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

#[queue_computation_accounts("release_quote", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ReleaseQuote<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_RELEASE_QUOTE))]
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

#[callback_accounts("release_quote")]
#[derive(Accounts)]
pub struct ReleaseQuoteCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_RELEASE_QUOTE))]
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
    #[account(mut, seeds = [b"quote", quote.market.as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()], bump = quote.bump)]
    pub quote: Box<Account<'info, QuoteRecord>>,
}

#[init_computation_definition_accounts("release_quote", payer)]
#[derive(Accounts)]
pub struct InitReleaseQuoteCompDef<'info> {
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
pub struct StopQuote<'info> {
    pub actor: Signer<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"quote-queue", market.key().as_ref()], bump = quote_queue.bump, constraint = quote_queue.market == market.key() @ ErrorCode::WrongMarket)]
    pub quote_queue: Box<Account<'info, QuoteQueue>>,
    pub grant: Option<Box<Account<'info, OperatorGrant>>>,
    #[account(mut, constraint = quote.market == market.key() @ ErrorCode::WrongMarket, seeds = [b"quote", market.key().as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()], bump = quote.bump)]
    pub quote: Box<Account<'info, QuoteRecord>>,
}

#[derive(Accounts)]
pub struct EnqueueQuote<'info> {
    pub actor: Signer<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"quote-queue", market.key().as_ref()], bump = quote_queue.bump, constraint = quote_queue.market == market.key() @ ErrorCode::WrongMarket)]
    pub quote_queue: Box<Account<'info, QuoteQueue>>,
    pub grant: Option<Box<Account<'info, OperatorGrant>>>,
    #[account(mut, constraint = quote.market == market.key() @ ErrorCode::WrongMarket, seeds = [b"quote", market.key().as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()], bump = quote.bump)]
    pub quote: Box<Account<'info, QuoteRecord>>,
}

#[derive(Accounts)]
pub struct CancelQuoteReserve<'info> {
    pub actor: Signer<'info>,
    pub grant: Option<Box<Account<'info, OperatorGrant>>>,
    #[account(mut, seeds = [b"quote", quote.market.as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()], bump = quote.bump)]
    pub quote: Box<Account<'info, QuoteRecord>>,
    #[account(mut, constraint = market_account.owner == quote.maker, constraint = market_account.market == quote.market @ ErrorCode::WrongMarket, seeds = [b"market-account", quote.market.as_ref(), quote.maker.as_ref()], bump = market_account.bump)]
    pub market_account: Box<Account<'info, MarketAccount>>,
}

#[derive(Accounts)]
pub struct CancelQuoteRelease<'info> {
    pub actor: Signer<'info>,
    pub grant: Option<Box<Account<'info, OperatorGrant>>>,
    #[account(mut, seeds = [b"quote", quote.market.as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()], bump = quote.bump)]
    pub quote: Box<Account<'info, QuoteRecord>>,
    #[account(mut, constraint = market_account.owner == quote.maker, constraint = market_account.market == quote.market @ ErrorCode::WrongMarket, seeds = [b"market-account", quote.market.as_ref(), quote.maker.as_ref()], bump = market_account.bump)]
    pub market_account: Box<Account<'info, MarketAccount>>,
}

pub fn init_reserve_quote_comp_def_handler(ctx: Context<InitReserveQuoteCompDef>) -> Result<()> {
    init_depth_comp_def!(ctx.accounts, "reserve_quote")?;
    Ok(())
}

pub fn init_release_quote_comp_def_handler(ctx: Context<InitReleaseQuoteCompDef>) -> Result<()> {
    init_depth_comp_def!(ctx.accounts, "release_quote")?;
    Ok(())
}

fn authorize_quote_actor(
    actor: Pubkey,
    quote: &QuoteRecord,
    grant: Option<&Account<OperatorGrant>>,
) -> Result<()> {
    require!(
        actor == quote.maker || actor == quote.operator,
        ErrorCode::Unauthorized
    );
    let version = authorize_operator(
        actor,
        quote.maker,
        quote.market,
        quote.capacity,
        quote.expiry,
        false,
        grant,
    )?;
    require!(
        actor == quote.maker || version == quote.operator_version,
        ErrorCode::Unauthorized
    );
    Ok(())
}

pub fn reserve_quote_handler(ctx: Context<ReserveQuote>, computation_offset: u64) -> Result<()> {
    let waiting = ctx.accounts.quote.status == QuoteStatus::Waiting;
    authorize_quote_actor(
        if waiting {
            ctx.accounts.quote.operator
        } else {
            ctx.accounts.payer.key()
        },
        &ctx.accounts.quote,
        ctx.accounts.grant.as_deref(),
    )?;
    require!(
        ctx.accounts.market.pending_orders == 0,
        ErrorCode::WrongOrderStatus
    );
    let market = &mut ctx.accounts.market;
    require!(
        ctx.remaining_accounts.len() == 1,
        ErrorCode::WrongQuoteSnapshot
    );
    let queue_info = &ctx.remaining_accounts[0];
    let expected_queue =
        Pubkey::find_program_address(&[b"quote-queue", market.key().as_ref()], &ID).0;
    require_keys_eq!(queue_info.key(), expected_queue, ErrorCode::WrongMarket);
    require_keys_eq!(*queue_info.owner, ID, ErrorCode::WrongMarket);
    require!(queue_info.is_writable, ErrorCode::WrongMarket);
    let queue_data = queue_info.try_borrow_data()?;
    let mut quote_queue = QuoteQueue::try_deserialize(&mut &queue_data[..])?;
    drop(queue_data);
    require_keys_eq!(quote_queue.market, market.key(), ErrorCode::WrongMarket);
    let quote = &mut ctx.accounts.quote;
    let account = &mut ctx.accounts.market_account;
    let clock = Clock::get()?;
    require!(
        market.status != MarketStatus::Paused && market.status != MarketStatus::Settling,
        ErrorCode::InvalidQuote
    );
    require!(
        quote.status == QuoteStatus::Validated || quote.status == QuoteStatus::Waiting,
        ErrorCode::WrongQuoteStatus
    );
    if quote_queue.count > 0 {
        require!(
            waiting && quote_queue.entries[0] == quote.key(),
            ErrorCode::WrongQuoteStatus
        );
    } else {
        require!(!waiting, ErrorCode::WrongQuoteStatus);
    }
    require!(
        account.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(account.version < u64::MAX, ErrorCode::RevisionOverflow);
    require!(
        quote.market_revision == market.revision
            && quote.oracle_timestamp == market.oracle_timestamp,
        ErrorCode::InvalidQuote
    );
    require!(quote.expiry > clock.unix_timestamp, ErrorCode::InvalidQuote);
    require!(market.active_quote_count < 4, ErrorCode::QuoteSnapshotFull);
    require!(
        market
            .quoted_notional
            .checked_add(quote.capacity)
            .ok_or(ErrorCode::QuoteCapacityExceeded)?
            <= market.config.max_market_notional,
        ErrorCode::QuoteCapacityExceeded
    );
    require!(
        market.oracle_timestamp > 0
            && clock.unix_timestamp >= market.oracle_timestamp
            && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
                <= i64::from(market.config.max_oracle_age_seconds),
        ErrorCode::StaleOracle
    );
    if waiting {
        quote_queue.remove(quote.key())?;
        let mut data = queue_info.try_borrow_mut_data()?;
        quote_queue.try_serialize(&mut &mut data[..])?;
    }
    quote.status = QuoteStatus::Reserving;
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
        .plaintext_u64(quote.required_margin)
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
        vec![ReserveQuoteCallback::callback_ix(
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

pub fn reserve_quote_callback_handler(
    ctx: Context<ReserveQuoteCallback>,
    output: SignedComputationOutputs<ReserveQuoteOutput>,
) -> Result<()> {
    let ReserveQuoteOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let quote = &mut ctx.accounts.quote;
    let account = &mut ctx.accounts.market_account;
    let market = &mut ctx.accounts.market;
    require!(
        quote.status == QuoteStatus::Reserving,
        ErrorCode::WrongQuoteStatus
    );
    require!(
        account.status == MarketAccountStatus::Reserving,
        ErrorCode::WrongMarketAccountStatus
    );
    require_keys_eq!(quote.maker, account.owner, ErrorCode::WrongMarginTransfer);
    require_keys_eq!(quote.market, account.market, ErrorCode::WrongMarket);
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
    let clock = Clock::get()?;
    let eligible = result.field_3
        && market.pending_orders == 0
        && market.status != MarketStatus::Paused
        && quote.market_revision == market.revision
        && quote.oracle_timestamp == market.oracle_timestamp
        && quote.funding_index == market.funding_index
        && quote.expiry > clock.unix_timestamp
        && market.oracle_timestamp > 0
        && clock.unix_timestamp >= market.oracle_timestamp
        && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
            <= i64::from(market.config.max_oracle_age_seconds)
        && market.active_quote_count < 4
        && market
            .quoted_notional
            .checked_add(quote.capacity)
            .is_some_and(|total| total <= market.config.max_market_notional);
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
        let count = usize::from(market.active_quote_count);
        let mut index = count;
        while index > 0 && quote.key().to_bytes() < market.active_quotes[index - 1].to_bytes() {
            market.active_quotes[index] = market.active_quotes[index - 1];
            index -= 1;
        }
        market.active_quotes[index] = quote.key();
        market.active_quote_count += 1;
        market.quoted_notional = market
            .quoted_notional
            .checked_add(quote.capacity)
            .ok_or(ErrorCode::QuoteCapacityExceeded)?;
        quote.status = QuoteStatus::Active;
    } else {
        quote.status = QuoteStatus::Rejected;
    }
    account.status = MarketAccountStatus::Ready;
    account.pending_computation = Pubkey::default();
    quote.pending_computation = Pubkey::default();
    Ok(())
}

pub fn enqueue_quote_handler(ctx: Context<EnqueueQuote>) -> Result<()> {
    authorize_quote_actor(
        ctx.accounts.actor.key(),
        &ctx.accounts.quote,
        ctx.accounts.grant.as_deref(),
    )?;
    let market = &mut ctx.accounts.market;
    let quote = &mut ctx.accounts.quote;
    require!(
        quote.status == QuoteStatus::Validated,
        ErrorCode::WrongQuoteStatus
    );
    require!(
        market.status != MarketStatus::Paused && market.status != MarketStatus::Settling,
        ErrorCode::MarketNotActive
    );
    require!(
        market.active_quote_count == 4
            || ctx.accounts.quote_queue.count > 0
            || market
                .quoted_notional
                .checked_add(quote.capacity)
                .is_none_or(|total| total > market.config.max_market_notional),
        ErrorCode::WrongQuoteStatus
    );
    require!(
        quote.market_revision == market.revision
            && quote.oracle_timestamp == market.oracle_timestamp
            && quote.expiry > Clock::get()?.unix_timestamp,
        ErrorCode::InvalidQuote
    );
    ctx.accounts.quote_queue.enqueue(quote.key())?;
    quote.status = QuoteStatus::Waiting;
    Ok(())
}

pub fn stop_quote_handler(ctx: Context<StopQuote>) -> Result<()> {
    require!(
        ctx.accounts.market.pending_orders == 0,
        ErrorCode::WrongOrderStatus
    );
    let quote = &mut ctx.accounts.quote;
    let market = &mut ctx.accounts.market;
    if quote.status == QuoteStatus::Waiting {
        if Clock::get()?.unix_timestamp < quote.expiry
            && quote.market_revision == market.revision
            && quote.oracle_timestamp == market.oracle_timestamp
        {
            authorize_quote_actor(
                ctx.accounts.actor.key(),
                quote,
                ctx.accounts.grant.as_deref(),
            )?;
        }
        ctx.accounts.quote_queue.remove(quote.key())?;
        quote.status = QuoteStatus::Cancelled;
        return Ok(());
    }
    require!(
        quote.status == QuoteStatus::Active,
        ErrorCode::WrongQuoteStatus
    );
    if Clock::get()?.unix_timestamp < quote.expiry {
        authorize_quote_actor(
            ctx.accounts.actor.key(),
            quote,
            ctx.accounts.grant.as_deref(),
        )?;
    }
    let count = usize::from(market.active_quote_count);
    let index = market.active_quotes[..count]
        .iter()
        .position(|key| *key == quote.key())
        .ok_or(ErrorCode::InvalidQuote)?;
    for i in index..count - 1 {
        market.active_quotes[i] = market.active_quotes[i + 1];
    }
    market.active_quotes[count - 1] = Pubkey::default();
    market.active_quote_count -= 1;
    quote.status = QuoteStatus::Closing;
    Ok(())
}

pub fn release_quote_handler(ctx: Context<ReleaseQuote>, computation_offset: u64) -> Result<()> {
    require!(
        ctx.accounts.market.status != MarketStatus::Settling,
        ErrorCode::MarketNotActive
    );
    require!(
        ctx.accounts.market.pending_orders == 0,
        ErrorCode::WrongOrderStatus
    );
    let quote = &mut ctx.accounts.quote;
    let account = &mut ctx.accounts.market_account;
    require!(
        quote.status == QuoteStatus::Closing,
        ErrorCode::WrongQuoteStatus
    );
    require!(quote.attached_orders == 0, ErrorCode::QuoteHasOrders);
    require!(
        account.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(account.version < u64::MAX, ErrorCode::RevisionOverflow);
    quote.status = QuoteStatus::Releasing;
    quote.pending_computation = ctx.accounts.computation_account.key();
    account.status = MarketAccountStatus::Releasing;
    account.pending_computation = ctx.accounts.computation_account.key();
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let mut args = ArgBuilder::new()
        .plaintext_u128(u128::from_le_bytes(account.nonce))
        .encrypted_u64(account.ciphertexts[0])
        .encrypted_u64(account.ciphertexts[1])
        .encrypted_u64(account.ciphertexts[2])
        .plaintext_u128(u128::from_le_bytes(quote.balance_nonce))
        .encrypted_u64(quote.balance_ciphertext);
    args = args.plaintext_u64(quote.required_margin);
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
        vec![ReleaseQuoteCallback::callback_ix(
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

pub fn release_quote_callback_handler(
    ctx: Context<ReleaseQuoteCallback>,
    output: SignedComputationOutputs<ReleaseQuoteOutput>,
) -> Result<()> {
    let ReleaseQuoteOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let quote = &mut ctx.accounts.quote;
    let account = &mut ctx.accounts.market_account;
    require!(
        quote.status == QuoteStatus::Releasing,
        ErrorCode::WrongQuoteStatus
    );
    require!(
        account.status == MarketAccountStatus::Releasing,
        ErrorCode::WrongMarketAccountStatus
    );
    require_keys_eq!(quote.maker, account.owner, ErrorCode::WrongMarginTransfer);
    require_keys_eq!(quote.market, account.market, ErrorCode::WrongMarket);
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
    if result.field_3 {
        require!(quote.attached_orders == 0, ErrorCode::QuoteHasOrders);
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
        ctx.accounts.market.quoted_notional = ctx
            .accounts
            .market
            .quoted_notional
            .checked_sub(quote.capacity)
            .ok_or(ErrorCode::QuoteCapacityExceeded)?;
        quote.status = QuoteStatus::Cancelled;
    } else {
        quote.status = QuoteStatus::Closing;
    }
    account.status = MarketAccountStatus::Ready;
    account.pending_computation = Pubkey::default();
    quote.pending_computation = Pubkey::default();
    Ok(())
}

pub fn cancel_quote_reserve_handler(ctx: Context<CancelQuoteReserve>) -> Result<()> {
    authorize_quote_actor(
        ctx.accounts.actor.key(),
        &ctx.accounts.quote,
        ctx.accounts.grant.as_deref(),
    )?;
    require!(
        ctx.accounts.quote.status == QuoteStatus::Reserving,
        ErrorCode::WrongQuoteStatus
    );
    require!(
        ctx.accounts.market_account.status == MarketAccountStatus::Reserving,
        ErrorCode::WrongMarketAccountStatus
    );
    require_keys_eq!(
        ctx.accounts.quote.pending_computation,
        ctx.accounts.market_account.pending_computation,
        ErrorCode::WrongPendingComputation
    );
    ctx.accounts.quote.status = QuoteStatus::Validated;
    ctx.accounts.quote.pending_computation = Pubkey::default();
    ctx.accounts.market_account.status = MarketAccountStatus::Ready;
    ctx.accounts.market_account.pending_computation = Pubkey::default();
    Ok(())
}

pub fn cancel_quote_release_handler(ctx: Context<CancelQuoteRelease>) -> Result<()> {
    authorize_quote_actor(
        ctx.accounts.actor.key(),
        &ctx.accounts.quote,
        ctx.accounts.grant.as_deref(),
    )?;
    require!(
        ctx.accounts.quote.status == QuoteStatus::Releasing,
        ErrorCode::WrongQuoteStatus
    );
    require!(
        ctx.accounts.market_account.status == MarketAccountStatus::Releasing,
        ErrorCode::WrongMarketAccountStatus
    );
    require_keys_eq!(
        ctx.accounts.quote.pending_computation,
        ctx.accounts.market_account.pending_computation,
        ErrorCode::WrongPendingComputation
    );
    ctx.accounts.quote.status = QuoteStatus::Closing;
    ctx.accounts.quote.pending_computation = Pubkey::default();
    ctx.accounts.market_account.status = MarketAccountStatus::Ready;
    ctx.accounts.market_account.pending_computation = Pubkey::default();
    Ok(())
}
