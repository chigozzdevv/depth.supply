use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{
        COMP_DEF_OFFSET_OFFER_BACKSTOP, COMP_DEF_OFFSET_RELEASE_BACKSTOP, SOL_USD_FEED_ID,
    },
    error::ErrorCode,
    state::{
        BackstopOffer, BackstopStatus, Market, MarketAccount, MarketAccountStatus, MarketIncident,
        MarketStatus, Protocol,
    },
    ArciumSignerAccount, ID, ID_CONST,
};

#[init_computation_definition_accounts("offer_backstop", payer)]
#[derive(Accounts)]
pub struct InitOfferBackstopCompDef<'info> {
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

#[init_computation_definition_accounts("release_backstop", payer)]
#[derive(Accounts)]
pub struct InitReleaseBackstopCompDef<'info> {
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

#[queue_computation_accounts("offer_backstop", maker)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, nonce: u64)]
pub struct OfferBackstop<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), maker.key().as_ref()], bump = market_account.bump, constraint = market_account.owner == maker.key(), constraint = market_account.market == market.key() @ ErrorCode::WrongMarket)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(init, payer = maker, space = 8 + BackstopOffer::INIT_SPACE, seeds = [b"backstop", market.key().as_ref(), maker.key().as_ref(), nonce.to_le_bytes().as_ref()], bump)]
    pub offer: Box<Account<'info, BackstopOffer>>,
    #[account(init_if_needed, space = 9, payer = maker, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_OFFER_BACKSTOP))]
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

#[callback_accounts("offer_backstop")]
#[derive(Accounts)]
pub struct OfferBackstopCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_OFFER_BACKSTOP))]
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
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), offer.maker.as_ref()], bump = market_account.bump)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"backstop", market.key().as_ref(), offer.maker.as_ref(), offer.nonce.to_le_bytes().as_ref()], bump = offer.bump)]
    pub offer: Box<Account<'info, BackstopOffer>>,
}

#[queue_computation_accounts("release_backstop", actor)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ReleaseBackstop<'info> {
    #[account(mut)]
    pub actor: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), offer.maker.as_ref()], bump = market_account.bump)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"backstop", market.key().as_ref(), offer.maker.as_ref(), offer.nonce.to_le_bytes().as_ref()], bump = offer.bump)]
    pub offer: Box<Account<'info, BackstopOffer>>,
    #[account(init_if_needed, space = 9, payer = actor, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_RELEASE_BACKSTOP))]
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

#[callback_accounts("release_backstop")]
#[derive(Accounts)]
pub struct ReleaseBackstopCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_RELEASE_BACKSTOP))]
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
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), offer.maker.as_ref()], bump = market_account.bump)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"backstop", market.key().as_ref(), offer.maker.as_ref(), offer.nonce.to_le_bytes().as_ref()], bump = offer.bump)]
    pub offer: Box<Account<'info, BackstopOffer>>,
}

#[derive(Accounts)]
pub struct CloseBackstop<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,
    #[account(mut, close = maker, constraint = offer.maker == maker.key(), seeds = [b"backstop", offer.market.as_ref(), maker.key().as_ref(), offer.nonce.to_le_bytes().as_ref()], bump = offer.bump)]
    pub offer: Box<Account<'info, BackstopOffer>>,
}

pub fn offer_backstop_handler(
    ctx: Context<OfferBackstop>,
    computation_offset: u64,
    nonce: u64,
    capacity: u64,
    expiry: i64,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let account = &mut ctx.accounts.market_account;
    let clock = Clock::get()?;
    require!(
        market.status != MarketStatus::Settling,
        ErrorCode::MarketNotActive
    );
    require!(market.pending_orders == 0, ErrorCode::WrongOrderStatus);
    require!(
        market.backstop_offer == Pubkey::default(),
        ErrorCode::BackstopAlreadyActive
    );
    require!(
        account.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(account.version < u64::MAX, ErrorCode::RevisionOverflow);
    require!(
        capacity > 0 && capacity <= market.config.max_account_notional,
        ErrorCode::InvalidBackstop
    );
    require!(
        expiry > clock.unix_timestamp && expiry.saturating_sub(clock.unix_timestamp) <= 86_400,
        ErrorCode::InvalidBackstop
    );
    require!(
        market.oracle_timestamp > 0
            && clock.unix_timestamp >= market.oracle_timestamp
            && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
                <= i64::from(market.config.max_oracle_age_seconds),
        ErrorCode::StaleOracle
    );
    let margin =
        (u128::from(capacity) * u128::from(market.config.initial_margin_bps)).div_ceil(10_000);
    let margin = u64::try_from(margin).map_err(|_| ErrorCode::InvalidBackstop)?;
    require!(
        margin >= market.config.backstop_min_collateral,
        ErrorCode::InvalidBackstop
    );
    let offer = &mut ctx.accounts.offer;
    offer.maker = ctx.accounts.maker.key();
    offer.market = market.key();
    offer.nonce = nonce;
    offer.capacity = capacity;
    offer.margin = margin;
    offer.expiry = expiry;
    offer.market_revision = market.revision;
    offer.oracle_timestamp = market.oracle_timestamp;
    offer.funding_index = market.funding_index;
    offer.pending_computation = ctx.accounts.computation_account.key();
    offer.status = BackstopStatus::Reserving;
    offer.bump = ctx.bumps.offer;
    account.status = MarketAccountStatus::Reserving;
    account.pending_computation = ctx.accounts.computation_account.key();
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    let mut args = ArgBuilder::new().plaintext_u128(u128::from_le_bytes(account.nonce));
    for field in account.ciphertexts {
        args = args.encrypted_u64(field);
    }
    args = args
        .plaintext_u64(margin)
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
        vec![OfferBackstopCallback::callback_ix(
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
                    pubkey: ctx.accounts.offer.key(),
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

pub fn offer_backstop_callback_handler(
    ctx: Context<OfferBackstopCallback>,
    output: SignedComputationOutputs<OfferBackstopOutput>,
) -> Result<()> {
    let OfferBackstopOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let market = &mut ctx.accounts.market;
    let account = &mut ctx.accounts.market_account;
    let offer = &mut ctx.accounts.offer;
    require!(
        offer.status == BackstopStatus::Reserving,
        ErrorCode::WrongBackstopStatus
    );
    require!(
        account.status == MarketAccountStatus::Reserving,
        ErrorCode::WrongMarketAccountStatus
    );
    require_keys_eq!(offer.maker, account.owner, ErrorCode::WrongMarket);
    require_keys_eq!(offer.market, market.key(), ErrorCode::WrongMarket);
    let computation = ctx.accounts.computation_account.key();
    require_keys_eq!(
        offer.pending_computation,
        computation,
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        account.pending_computation,
        computation,
        ErrorCode::WrongPendingComputation
    );
    let clock = Clock::get()?;
    if result.field_3
        && market.backstop_offer == Pubkey::default()
        && market.pending_orders == 0
        && offer.market_revision == market.revision
        && offer.oracle_timestamp == market.oracle_timestamp
        && offer.funding_index == market.funding_index
        && offer.expiry > clock.unix_timestamp
        && clock.unix_timestamp >= market.oracle_timestamp
        && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
            <= i64::from(market.config.max_oracle_age_seconds)
    {
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
        market.backstop_offer = offer.key();
        offer.status = BackstopStatus::Active;
    } else {
        offer.status = BackstopStatus::Rejected;
    }
    account.status = MarketAccountStatus::Ready;
    account.pending_computation = Pubkey::default();
    offer.pending_computation = Pubkey::default();
    Ok(())
}

pub fn release_backstop_handler(
    ctx: Context<ReleaseBackstop>,
    computation_offset: u64,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(
        market.status != MarketStatus::Settling,
        ErrorCode::MarketNotActive
    );
    let account = &mut ctx.accounts.market_account;
    let offer = &mut ctx.accounts.offer;
    let clock = Clock::get()?;
    require!(market.pending_orders == 0, ErrorCode::WrongOrderStatus);
    require!(
        market.backstop_offer == offer.key(),
        ErrorCode::WrongBackstopStatus
    );
    require!(
        offer.status == BackstopStatus::Active,
        ErrorCode::WrongBackstopStatus
    );
    require_keys_eq!(offer.market, market.key(), ErrorCode::WrongMarket);
    require_keys_eq!(offer.maker, account.owner, ErrorCode::WrongMarket);
    require!(
        ctx.accounts.actor.key() == offer.maker
            || ctx.accounts.actor.key() == ctx.accounts.protocol.authority
            || clock.unix_timestamp >= offer.expiry,
        ErrorCode::Unauthorized
    );
    require!(
        account.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(account.version < u64::MAX, ErrorCode::RevisionOverflow);
    if market.status == MarketStatus::Active {
        market.pause(MarketIncident::BackstopUnavailable);
        ctx.accounts.protocol.trading_enabled = false;
    }
    offer.status = BackstopStatus::Releasing;
    let computation = ctx.accounts.computation_account.key();
    offer.pending_computation = computation;
    account.status = MarketAccountStatus::Releasing;
    account.pending_computation = computation;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    let mut args = ArgBuilder::new().plaintext_u128(u128::from_le_bytes(account.nonce));
    for field in account.ciphertexts {
        args = args.encrypted_u64(field);
    }
    args = args.plaintext_u64(offer.margin);
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
        vec![ReleaseBackstopCallback::callback_ix(
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
                    pubkey: ctx.accounts.offer.key(),
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

pub fn release_backstop_callback_handler(
    ctx: Context<ReleaseBackstopCallback>,
    output: SignedComputationOutputs<ReleaseBackstopOutput>,
) -> Result<()> {
    let ReleaseBackstopOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let market = &mut ctx.accounts.market;
    let account = &mut ctx.accounts.market_account;
    let offer = &mut ctx.accounts.offer;
    require!(
        offer.status == BackstopStatus::Releasing,
        ErrorCode::WrongBackstopStatus
    );
    require!(
        account.status == MarketAccountStatus::Releasing,
        ErrorCode::WrongMarketAccountStatus
    );
    require_keys_eq!(offer.market, market.key(), ErrorCode::WrongMarket);
    require_keys_eq!(offer.maker, account.owner, ErrorCode::WrongMarket);
    let computation = ctx.accounts.computation_account.key();
    require_keys_eq!(
        offer.pending_computation,
        computation,
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        account.pending_computation,
        computation,
        ErrorCode::WrongPendingComputation
    );
    if result.field_3 {
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
        market.backstop_offer = Pubkey::default();
        offer.status = BackstopStatus::Cancelled;
    } else {
        offer.status = BackstopStatus::Active;
    }
    account.status = MarketAccountStatus::Ready;
    account.pending_computation = Pubkey::default();
    offer.pending_computation = Pubkey::default();
    Ok(())
}

pub fn close_backstop_handler(ctx: Context<CloseBackstop>) -> Result<()> {
    require!(
        ctx.accounts.offer.status == BackstopStatus::Cancelled
            || ctx.accounts.offer.status == BackstopStatus::Rejected
            || ctx.accounts.offer.status == BackstopStatus::Consumed,
        ErrorCode::WrongBackstopStatus
    );
    Ok(())
}

pub fn init_offer_backstop_comp_def_handler(ctx: Context<InitOfferBackstopCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn init_release_backstop_comp_def_handler(
    ctx: Context<InitReleaseBackstopCompDef>,
) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}
