use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use sha3::{Digest, Sha3_256};

use crate::{
    constants::SOL_USD_FEED_ID,
    error::ErrorCode,
    state::{
        ClearingAccount, ClearingStatus, FeeRecoveryRecord, Market, MarketAccount,
        MarketAccountStatus, MarketStatus, OrderKind, OrderRecord, OrderStatus, Protocol,
        RecoveryConfig, Winddown, WinddownClaim, WinddownFeeClaim,
    },
};

const PRICE_SCALE: i128 = 100_000_000_000;

#[derive(Accounts)]
pub struct StartWinddown<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = vault)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(seeds = [b"recovery-config", market.key().as_ref()], bump = recovery_config.bump)]
    pub recovery_config: Box<Account<'info, RecoveryConfig>>,
    #[account(seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(token::mint = protocol.settlement_mint, token::authority = protocol)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(init, payer = payer, space = 8 + Winddown::INIT_SPACE, seeds = [b"winddown", market.key().as_ref()], bump)]
    pub winddown: Box<Account<'info, Winddown>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealWinddown<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"winddown", market.key().as_ref()], bump = winddown.bump)]
    pub winddown: Box<Account<'info, Winddown>>,
    #[account(seeds = [b"market-account", market.key().as_ref(), market_account.owner.as_ref()], bump = market_account.bump)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(init, payer = payer, space = 8 + WinddownClaim::INIT_SPACE, seeds = [b"winddown-claim", market_account.key().as_ref()], bump)]
    pub claim: Box<Account<'info, WinddownClaim>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealWinddownFee<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"winddown", market.key().as_ref()], bump = winddown.bump)]
    pub winddown: Box<Account<'info, Winddown>>,
    #[account(seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
    #[account(seeds = [b"fee-recovery", order.key().as_ref()], bump = fee_recovery.bump)]
    pub fee_recovery: Box<Account<'info, FeeRecoveryRecord>>,
    #[account(init, payer = payer, space = 8 + WinddownFeeClaim::INIT_SPACE, seeds = [b"winddown-fee", order.key().as_ref()], bump)]
    pub claim: Box<Account<'info, WinddownFeeClaim>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeWinddown<'info> {
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = vault)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"winddown", market.key().as_ref()], bump = winddown.bump)]
    pub winddown: Box<Account<'info, Winddown>>,
    #[account(token::mint = protocol.settlement_mint, token::authority = protocol)]
    pub vault: Box<Account<'info, TokenAccount>>,
}

#[derive(Accounts)]
pub struct ClaimWinddown<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = settlement_mint, has_one = vault)]
    pub protocol: Box<Account<'info, Protocol>>,
    pub settlement_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = settlement_mint, token::authority = protocol)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"winddown", market.key().as_ref()], bump = winddown.bump)]
    pub winddown: Box<Account<'info, Winddown>>,
    #[account(mut, close = owner, seeds = [b"market-account", market.key().as_ref(), owner.key().as_ref()], bump = market_account.bump)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"winddown-claim", market_account.key().as_ref()], bump = claim.bump)]
    pub claim: Box<Account<'info, WinddownClaim>>,
    #[account(mut, token::mint = settlement_mint, token::authority = owner)]
    pub destination: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimWinddownAppFee<'info> {
    #[account(mut)]
    pub app: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = settlement_mint, has_one = vault)]
    pub protocol: Box<Account<'info, Protocol>>,
    pub settlement_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = settlement_mint, token::authority = protocol)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"winddown", market.key().as_ref()], bump = winddown.bump)]
    pub winddown: Box<Account<'info, Winddown>>,
    #[account(mut, seeds = [b"winddown-fee", claim.order.as_ref()], bump = claim.bump)]
    pub claim: Box<Account<'info, WinddownFeeClaim>>,
    #[account(mut, token::mint = settlement_mint, token::authority = app)]
    pub destination: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimWinddownProtocolFees<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = authority, has_one = settlement_mint, has_one = vault)]
    pub protocol: Box<Account<'info, Protocol>>,
    pub settlement_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = settlement_mint, token::authority = protocol)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"winddown", market.key().as_ref()], bump = winddown.bump)]
    pub winddown: Box<Account<'info, Winddown>>,
    #[account(mut, token::mint = settlement_mint, token::authority = authority)]
    pub destination: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SweepWinddown<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = authority, has_one = settlement_mint, has_one = vault)]
    pub protocol: Box<Account<'info, Protocol>>,
    pub settlement_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = settlement_mint, token::authority = protocol)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"winddown", market.key().as_ref()], bump = winddown.bump)]
    pub winddown: Box<Account<'info, Winddown>>,
    #[account(mut, token::mint = settlement_mint, token::authority = authority)]
    pub destination: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

fn clearing_commitment(
    market: Pubkey,
    version: u64,
    insurance: u64,
    open_interest: u64,
    protocol_fees: u64,
    app_fees: u64,
    salt: u128,
) -> [u8; 32] {
    let mut preimage = [0u8; 104];
    preimage[..16].copy_from_slice(b"depth.clear.v2\0\0");
    preimage[16..48].copy_from_slice(market.as_ref());
    preimage[48..56].copy_from_slice(&version.to_le_bytes());
    preimage[56..64].copy_from_slice(&insurance.to_le_bytes());
    preimage[64..72].copy_from_slice(&open_interest.to_le_bytes());
    preimage[72..80].copy_from_slice(&protocol_fees.to_le_bytes());
    preimage[80..88].copy_from_slice(&app_fees.to_le_bytes());
    preimage[88..104].copy_from_slice(&salt.to_le_bytes());
    Sha3_256::digest(preimage).into()
}

fn market_commitment(
    account: Pubkey,
    version: u64,
    collateral: u64,
    reserved: u64,
    position: i64,
    entry_price: u64,
    funding_checkpoint: i128,
    salt: u128,
) -> [u8; 32] {
    let mut preimage = [0u8; 120];
    preimage[..16].copy_from_slice(b"depth.market.v1\0");
    preimage[16..48].copy_from_slice(account.as_ref());
    preimage[48..56].copy_from_slice(&version.to_le_bytes());
    preimage[56..64].copy_from_slice(&collateral.to_le_bytes());
    preimage[64..72].copy_from_slice(&reserved.to_le_bytes());
    preimage[72..80].copy_from_slice(&position.to_le_bytes());
    preimage[80..88].copy_from_slice(&entry_price.to_le_bytes());
    preimage[88..104].copy_from_slice(&funding_checkpoint.to_le_bytes());
    preimage[104..120].copy_from_slice(&salt.to_le_bytes());
    Sha3_256::digest(preimage).into()
}

fn fee_commitment(order: Pubkey, protocol_fee: u64, app_fee: u64, salt: u128) -> [u8; 32] {
    let mut preimage = [0u8; 80];
    preimage[..16].copy_from_slice(b"depth.fees.v1\0\0\0");
    preimage[16..48].copy_from_slice(order.as_ref());
    preimage[48..56].copy_from_slice(&protocol_fee.to_le_bytes());
    preimage[56..64].copy_from_slice(&app_fee.to_le_bytes());
    preimage[64..80].copy_from_slice(&salt.to_le_bytes());
    Sha3_256::digest(preimage).into()
}

fn positive_equity(
    collateral: u64,
    position: i64,
    entry_price: u64,
    funding_checkpoint: i128,
    price: u64,
    funding_index: i128,
) -> Result<u128> {
    let exposure = i128::from(position);
    let realised = exposure
        .checked_mul(i128::from(price) - i128::from(entry_price))
        .ok_or(ErrorCode::InvalidRecoveryState)?
        / PRICE_SCALE;
    let funding = exposure
        .checked_mul(
            funding_index
                .checked_sub(funding_checkpoint)
                .ok_or(ErrorCode::InvalidRecoveryState)?,
        )
        .ok_or(ErrorCode::InvalidRecoveryState)?
        / PRICE_SCALE;
    let equity = i128::from(collateral)
        .checked_add(realised)
        .and_then(|value| value.checked_sub(funding))
        .ok_or(ErrorCode::InvalidRecoveryState)?;
    Ok(equity.max(0) as u128)
}

fn committee_authorized(config: &RecoveryConfig, signers: &[AccountInfo]) -> bool {
    let mut approved = [false; 5];
    for account in signers {
        if account.is_signer {
            for (index, key) in config.signers.iter().enumerate() {
                if account.key == key {
                    approved[index] = true;
                }
            }
        }
    }
    approved.iter().filter(|approved| **approved).count() >= 3
}

pub fn start_winddown_handler(
    ctx: Context<StartWinddown>,
    insurance: u64,
    open_interest: u64,
    protocol_fees: u64,
    app_fees: u64,
    salt: u128,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clearing = &ctx.accounts.clearing;
    let protocol = &mut ctx.accounts.protocol;
    require!(
        market.status == MarketStatus::Paused || market.status == MarketStatus::Active,
        ErrorCode::MarketNotPaused
    );
    require!(market.pending_orders == 0, ErrorCode::WrongOrderStatus);
    require!(
        protocol.escrow_total == 0,
        ErrorCode::WrongMarginTransferStatus
    );
    require!(
        clearing.status == ClearingStatus::Ready,
        ErrorCode::WrongClearingStatus
    );
    require_keys_eq!(clearing.market, market.key(), ErrorCode::WrongMarket);
    require!(
        committee_authorized(&ctx.accounts.recovery_config, ctx.remaining_accounts),
        ErrorCode::Unauthorized
    );
    let clock = Clock::get()?;
    require!(
        market.oracle_price_e8 > 0
            && market.oracle_timestamp > 0
            && clock.unix_timestamp >= market.oracle_timestamp
            && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
                <= i64::from(market.config.max_oracle_age_seconds),
        ErrorCode::StaleOracle
    );
    require!(
        clearing_commitment(
            market.key(),
            clearing.version,
            insurance,
            open_interest,
            protocol_fees,
            app_fees,
            salt,
        ) == clearing.commitment,
        ErrorCode::InvalidRecoveryState
    );
    require!(
        u128::from(protocol.pending_total) + u128::from(protocol.credited_total)
            <= u128::from(ctx.accounts.vault.amount),
        ErrorCode::VaultUnderfunded
    );
    let winddown = &mut ctx.accounts.winddown;
    winddown.market = market.key();
    winddown.price_e8 = market.oracle_price_e8;
    winddown.funding_index = market.funding_index;
    winddown.expected_accounts = ctx.accounts.recovery_config.account_count;
    winddown.open_interest = open_interest;
    winddown.insurance = insurance;
    winddown.protocol_fees = protocol_fees;
    winddown.app_fees = app_fees;
    winddown.bump = ctx.bumps.winddown;
    market.status = MarketStatus::Settling;
    protocol.trading_enabled = false;
    Ok(())
}

pub fn reveal_winddown_handler(
    ctx: Context<RevealWinddown>,
    collateral: u64,
    reserved: u64,
    position: i64,
    entry_price: u64,
    funding_checkpoint: i128,
    salt: u128,
) -> Result<()> {
    let account = &ctx.accounts.market_account;
    let winddown = &mut ctx.accounts.winddown;
    require!(
        ctx.accounts.market.status == MarketStatus::Settling,
        ErrorCode::MarketNotPaused
    );
    require!(!winddown.finalized, ErrorCode::InvalidRecoveryState);
    require!(
        account.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    require_keys_eq!(
        account.market,
        ctx.accounts.market.key(),
        ErrorCode::WrongMarket
    );
    require!(
        market_commitment(
            account.key(),
            account.version,
            collateral,
            reserved,
            position,
            entry_price,
            funding_checkpoint,
            salt,
        ) == account.commitment,
        ErrorCode::InvalidRecoveryState
    );
    let equity = positive_equity(
        collateral,
        position,
        entry_price,
        funding_checkpoint,
        winddown.price_e8,
        winddown.funding_index,
    )?;
    winddown.revealed_accounts = winddown
        .revealed_accounts
        .checked_add(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    require!(
        winddown.revealed_accounts <= winddown.expected_accounts,
        ErrorCode::InvalidRecoveryState
    );
    winddown.total_collateral = winddown
        .total_collateral
        .checked_add(u128::from(collateral))
        .ok_or(ErrorCode::RevisionOverflow)?;
    winddown.gross_positive = winddown
        .gross_positive
        .checked_add(equity)
        .ok_or(ErrorCode::RevisionOverflow)?;
    winddown.net_position = winddown
        .net_position
        .checked_add(i128::from(position))
        .ok_or(ErrorCode::RevisionOverflow)?;
    winddown.absolute_position = winddown
        .absolute_position
        .checked_add(i128::from(position).unsigned_abs())
        .ok_or(ErrorCode::RevisionOverflow)?;
    let claim = &mut ctx.accounts.claim;
    claim.winddown = winddown.key();
    claim.market_account = account.key();
    claim.owner = account.owner;
    claim.positive_equity = equity;
    claim.bump = ctx.bumps.claim;
    Ok(())
}

pub fn reveal_winddown_fee_handler(
    ctx: Context<RevealWinddownFee>,
    protocol_fee: u64,
    app_fee: u64,
    salt: u128,
) -> Result<()> {
    let winddown = &mut ctx.accounts.winddown;
    let order = &ctx.accounts.order;
    let recovery = &ctx.accounts.fee_recovery;
    require!(
        ctx.accounts.market.status == MarketStatus::Settling && !winddown.finalized,
        ErrorCode::InvalidRecoveryState
    );
    require!(
        order.kind == OrderKind::Trade
            && order.status == OrderStatus::Filled
            && !order.fees_claimed
            && order.market == ctx.accounts.market.key()
            && recovery.order == order.key()
            && recovery.commitment != [0; 32],
        ErrorCode::InvalidRecoveryState
    );
    require!(
        fee_commitment(order.key(), protocol_fee, app_fee, salt) == recovery.commitment,
        ErrorCode::InvalidRecoveryState
    );
    winddown.revealed_protocol_fees = winddown
        .revealed_protocol_fees
        .checked_add(protocol_fee)
        .ok_or(ErrorCode::RevisionOverflow)?;
    winddown.revealed_app_fees = winddown
        .revealed_app_fees
        .checked_add(app_fee)
        .ok_or(ErrorCode::RevisionOverflow)?;
    require!(
        winddown.revealed_protocol_fees <= winddown.protocol_fees
            && winddown.revealed_app_fees <= winddown.app_fees,
        ErrorCode::InvalidRecoveryState
    );
    if app_fee > 0 {
        winddown.app_claims = winddown
            .app_claims
            .checked_add(1)
            .ok_or(ErrorCode::RevisionOverflow)?;
    }
    let claim = &mut ctx.accounts.claim;
    claim.winddown = winddown.key();
    claim.order = order.key();
    claim.app = order.app;
    claim.amount = app_fee;
    claim.bump = ctx.bumps.claim;
    Ok(())
}

pub fn finalize_winddown_handler(ctx: Context<FinalizeWinddown>) -> Result<()> {
    let winddown = &mut ctx.accounts.winddown;
    require!(
        ctx.accounts.market.status == MarketStatus::Settling,
        ErrorCode::MarketNotPaused
    );
    require!(!winddown.finalized, ErrorCode::InvalidRecoveryState);
    require!(
        winddown.revealed_accounts == winddown.expected_accounts,
        ErrorCode::InvalidRecoveryState
    );
    require!(winddown.net_position == 0, ErrorCode::InvalidRecoveryState);
    require!(
        winddown.absolute_position == u128::from(winddown.open_interest) * 2,
        ErrorCode::InvalidRecoveryState
    );
    require!(
        winddown.revealed_protocol_fees == winddown.protocol_fees
            && winddown.revealed_app_fees == winddown.app_fees,
        ErrorCode::InvalidRecoveryState
    );
    let pool = winddown
        .total_collateral
        .checked_add(u128::from(winddown.insurance))
        .ok_or(ErrorCode::RevisionOverflow)?;
    let liabilities = pool
        .checked_add(u128::from(winddown.protocol_fees))
        .and_then(|value| value.checked_add(u128::from(winddown.app_fees)))
        .ok_or(ErrorCode::RevisionOverflow)?;
    require!(
        liabilities <= u128::from(ctx.accounts.protocol.credited_total),
        ErrorCode::InvalidRecoveryState
    );
    require!(
        u128::from(ctx.accounts.protocol.pending_total)
            + u128::from(ctx.accounts.protocol.credited_total)
            <= u128::from(ctx.accounts.vault.amount),
        ErrorCode::VaultUnderfunded
    );
    winddown.payout_pool = u64::try_from(pool).map_err(|_| error!(ErrorCode::RevisionOverflow))?;
    winddown.remaining_pool = winddown.payout_pool;
    winddown.finalized = true;
    Ok(())
}

fn payout(equity: u128, pool: u64, gross: u128) -> Result<u64> {
    if gross <= u128::from(pool) {
        return u64::try_from(equity).map_err(|_| error!(ErrorCode::RevisionOverflow));
    }
    require!(equity <= gross, ErrorCode::InvalidRecoveryState);
    let mut remainder = 0u128;
    let mut quotient = 0u128;
    for bit in (0..64).rev() {
        let (mut low, carry) = remainder.overflowing_add(remainder);
        let mut high = u8::from(carry);
        if (pool >> bit) & 1 == 1 {
            let (sum, carry) = low.overflowing_add(equity);
            low = sum;
            high += u8::from(carry);
        }
        let mut digit = 0u128;
        while high > 0 || low >= gross {
            let (difference, borrow) = low.overflowing_sub(gross);
            low = difference;
            high -= u8::from(borrow);
            digit += 1;
        }
        remainder = low;
        quotient = quotient * 2 + digit;
    }
    u64::try_from(quotient).map_err(|_| error!(ErrorCode::RevisionOverflow))
}

pub fn claim_winddown_handler(ctx: Context<ClaimWinddown>) -> Result<()> {
    let winddown = &mut ctx.accounts.winddown;
    let claim = &mut ctx.accounts.claim;
    require!(winddown.finalized, ErrorCode::InvalidRecoveryState);
    require!(!claim.paid, ErrorCode::InvalidRecoveryState);
    require_keys_eq!(claim.winddown, winddown.key(), ErrorCode::WrongMarket);
    require_keys_eq!(
        claim.market_account,
        ctx.accounts.market_account.key(),
        ErrorCode::WrongMarket
    );
    require_keys_eq!(
        claim.owner,
        ctx.accounts.owner.key(),
        ErrorCode::Unauthorized
    );
    let amount = payout(
        claim.positive_equity,
        winddown.payout_pool,
        winddown.gross_positive,
    )?;
    let remaining = winddown
        .remaining_pool
        .checked_sub(amount)
        .ok_or(ErrorCode::RevisionOverflow)?;
    let credited = ctx
        .accounts
        .protocol
        .credited_total
        .checked_sub(amount)
        .ok_or(ErrorCode::InsufficientCreditedTotal)?;
    if amount > 0 {
        let bump = [ctx.accounts.protocol.bump];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.settlement_mint.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                &[&[b"protocol", &bump]],
            ),
            amount,
            ctx.accounts.settlement_mint.decimals,
        )?;
        ctx.accounts.vault.reload()?;
    }
    require!(
        u128::from(ctx.accounts.protocol.pending_total) + u128::from(credited)
            <= u128::from(ctx.accounts.vault.amount),
        ErrorCode::VaultUnderfunded
    );
    ctx.accounts.protocol.credited_total = credited;
    winddown.remaining_pool = remaining;
    winddown.paid_accounts = winddown
        .paid_accounts
        .checked_add(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    claim.paid = true;
    Ok(())
}

pub fn claim_winddown_app_fee_handler(ctx: Context<ClaimWinddownAppFee>) -> Result<()> {
    let winddown = &mut ctx.accounts.winddown;
    let claim = &mut ctx.accounts.claim;
    require!(
        winddown.finalized && !winddown.swept,
        ErrorCode::InvalidRecoveryState
    );
    require!(
        !claim.paid && claim.amount > 0,
        ErrorCode::InvalidRecoveryState
    );
    require_keys_eq!(claim.winddown, winddown.key(), ErrorCode::WrongMarket);
    require_keys_eq!(claim.app, ctx.accounts.app.key(), ErrorCode::Unauthorized);
    let amount = claim.amount;
    let credited = ctx
        .accounts
        .protocol
        .credited_total
        .checked_sub(amount)
        .ok_or(ErrorCode::InsufficientCreditedTotal)?;
    let bump = [ctx.accounts.protocol.bump];
    token::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.settlement_mint.to_account_info(),
                to: ctx.accounts.destination.to_account_info(),
                authority: ctx.accounts.protocol.to_account_info(),
            },
            &[&[b"protocol", &bump]],
        ),
        amount,
        ctx.accounts.settlement_mint.decimals,
    )?;
    ctx.accounts.vault.reload()?;
    require!(
        u128::from(ctx.accounts.protocol.pending_total) + u128::from(credited)
            <= u128::from(ctx.accounts.vault.amount),
        ErrorCode::VaultUnderfunded
    );
    ctx.accounts.protocol.credited_total = credited;
    claim.paid = true;
    winddown.paid_app_claims = winddown
        .paid_app_claims
        .checked_add(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    Ok(())
}

pub fn claim_winddown_protocol_fees_handler(ctx: Context<ClaimWinddownProtocolFees>) -> Result<()> {
    let winddown = &mut ctx.accounts.winddown;
    require!(
        winddown.finalized && !winddown.swept,
        ErrorCode::InvalidRecoveryState
    );
    require!(
        !winddown.protocol_fees_paid,
        ErrorCode::InvalidRecoveryState
    );
    let amount = winddown.protocol_fees;
    let credited = ctx
        .accounts
        .protocol
        .credited_total
        .checked_sub(amount)
        .ok_or(ErrorCode::InsufficientCreditedTotal)?;
    if amount > 0 {
        let bump = [ctx.accounts.protocol.bump];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.settlement_mint.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                &[&[b"protocol", &bump]],
            ),
            amount,
            ctx.accounts.settlement_mint.decimals,
        )?;
        ctx.accounts.vault.reload()?;
    }
    require!(
        u128::from(ctx.accounts.protocol.pending_total) + u128::from(credited)
            <= u128::from(ctx.accounts.vault.amount),
        ErrorCode::VaultUnderfunded
    );
    ctx.accounts.protocol.credited_total = credited;
    winddown.protocol_fees_paid = true;
    Ok(())
}

pub fn sweep_winddown_handler(ctx: Context<SweepWinddown>) -> Result<()> {
    let winddown = &mut ctx.accounts.winddown;
    require!(winddown.finalized, ErrorCode::InvalidRecoveryState);
    require!(!winddown.swept, ErrorCode::InvalidRecoveryState);
    require!(
        winddown.paid_accounts == winddown.expected_accounts,
        ErrorCode::InvalidRecoveryState
    );
    require!(
        (winddown.protocol_fees == 0 || winddown.protocol_fees_paid)
            && winddown.paid_app_claims == winddown.app_claims,
        ErrorCode::InvalidRecoveryState
    );
    let amount = winddown.remaining_pool;
    let credited = ctx
        .accounts
        .protocol
        .credited_total
        .checked_sub(amount)
        .ok_or(ErrorCode::InsufficientCreditedTotal)?;
    if amount > 0 {
        let bump = [ctx.accounts.protocol.bump];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.settlement_mint.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                &[&[b"protocol", &bump]],
            ),
            amount,
            ctx.accounts.settlement_mint.decimals,
        )?;
        ctx.accounts.vault.reload()?;
    }
    require!(
        u128::from(ctx.accounts.protocol.pending_total) + u128::from(credited)
            <= u128::from(ctx.accounts.vault.amount),
        ErrorCode::VaultUnderfunded
    );
    ctx.accounts.protocol.credited_total = credited;
    winddown.remaining_pool = 0;
    winddown.swept = true;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{payout, positive_equity};

    #[test]
    fn insolvency_uses_insurance_then_haircuts_positive_equity() {
        assert_eq!(payout(60, 100, 120).unwrap(), 50);
        assert_eq!(payout(60, 120, 120).unwrap(), 60);
        assert_eq!(payout(60, 140, 120).unwrap(), 60);
    }

    #[test]
    fn haircut_handles_profit_above_u64_without_overflow() {
        let equity = (u64::MAX as u128) + 1;
        assert_eq!(payout(equity, u64::MAX, equity * 2).unwrap(), u64::MAX / 2);
        assert_eq!(payout(u128::MAX, u64::MAX, u128::MAX).unwrap(), u64::MAX);
        assert_eq!(
            payout(u128::MAX - 1, u64::MAX, u128::MAX).unwrap(),
            u64::MAX - 1
        );
    }

    #[test]
    fn haircut_division_matches_wide_integer_reference() {
        let mut seed = 0x9e37_79b9_7f4a_7c15u64;
        for _ in 0..1_000 {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            let gross = u128::from(seed % 1_000_000_000_000 + 1);
            let pool = (seed.rotate_left(17) as u128 % gross) as u64;
            let equity = u128::from(seed.rotate_right(11)) % (gross + 1);
            let expected = (equity * u128::from(pool) / gross) as u64;
            assert_eq!(payout(equity, pool, gross).unwrap(), expected);
        }
    }

    #[test]
    fn default_payouts_are_pro_rata_across_multiple_accounts() {
        let equities = [70u128, 50, 30];
        let gross = equities.iter().sum();
        let pool = 100u64;
        let paid: Vec<u64> = equities
            .iter()
            .map(|equity| payout(*equity, pool, gross).unwrap())
            .collect();
        assert_eq!(paid, [46, 33, 20]);
        assert_eq!(paid.iter().sum::<u64>(), 99);
        assert!(paid.iter().sum::<u64>() <= pool);
        let reversed: Vec<u64> = equities
            .iter()
            .rev()
            .map(|equity| payout(*equity, pool, gross).unwrap())
            .collect();
        assert_eq!(reversed, [20, 33, 46]);
    }

    #[test]
    fn negative_equity_cannot_be_paid() {
        assert_eq!(
            positive_equity(10, 1, 200_000_000_000, 0, 100_000_000_000, 0).unwrap(),
            9
        );
        assert_eq!(
            positive_equity(0, 1, 200_000_000_000, 0, 100_000_000_000, 0).unwrap(),
            0
        );
    }
}
