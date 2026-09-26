use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use sha3::{Digest, Sha3_256};

use crate::{
    constants::SOL_USD_FEED_ID,
    error::ErrorCode,
    state::{
        BalanceAccount, BalanceStatus, Market, MarketAccount, MarketAccountStatus, MarketStatus,
        Protocol, RecoveryConfig,
    },
};

#[derive(Accounts)]
pub struct RecoverBalance<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = settlement_mint,
        has_one = vault,
    )]
    pub protocol: Box<Account<'info, Protocol>>,
    pub settlement_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = protocol,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = owner,
    )]
    pub destination: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        close = owner,
        constraint = balance.owner == owner.key(),
        seeds = [b"balance", owner.key().as_ref()],
        bump = balance.bump,
    )]
    pub balance: Box<Account<'info, BalanceAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RecoverMarket<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"recovery-config", market.key().as_ref()], bump = recovery_config.bump)]
    pub recovery_config: Box<Account<'info, RecoveryConfig>>,
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = settlement_mint,
        has_one = vault,
    )]
    pub protocol: Box<Account<'info, Protocol>>,
    pub settlement_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = protocol,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = owner,
    )]
    pub destination: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        close = owner,
        constraint = market_account.owner == owner.key(),
        seeds = [b"market-account", market_account.market.as_ref(), owner.key().as_ref()],
        bump = market_account.bump,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,
    pub token_program: Program<'info, Token>,
}

fn flat_recovery_state(
    reserved: u64,
    position: i64,
    entry_price: u64,
    _funding_checkpoint: i128,
) -> bool {
    reserved == 0 && position == 0 && entry_price == 0
}

pub fn recover_balance_handler(
    ctx: Context<RecoverBalance>,
    amount: u64,
    salt: u128,
) -> Result<()> {
    require!(
        !ctx.accounts.protocol.trading_enabled,
        ErrorCode::TradingActive
    );
    require!(
        ctx.accounts.balance.status == BalanceStatus::Ready,
        ErrorCode::WrongBalanceStatus
    );

    let mut preimage = [0u8; 80];
    preimage[..16].copy_from_slice(b"depth.balance.v1");
    preimage[16..48].copy_from_slice(ctx.accounts.owner.key().as_ref());
    preimage[48..56].copy_from_slice(&ctx.accounts.balance.version.to_le_bytes());
    preimage[56..64].copy_from_slice(&amount.to_le_bytes());
    preimage[64..80].copy_from_slice(&salt.to_le_bytes());
    let digest = Sha3_256::digest(preimage);
    require!(
        digest.as_slice() == ctx.accounts.balance.commitment,
        ErrorCode::InvalidRecoveryState
    );

    let credited = ctx
        .accounts
        .protocol
        .credited_total
        .checked_sub(amount)
        .ok_or(ErrorCode::InsufficientCreditedTotal)?;
    if amount > 0 {
        let bump = [ctx.accounts.protocol.bump];
        let seeds: &[&[u8]] = &[b"protocol", &bump];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.settlement_mint.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                &[seeds],
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
    Ok(())
}

pub fn recover_market_handler(
    ctx: Context<RecoverMarket>,
    collateral: u64,
    reserved: u64,
    position: i64,
    entry_price: u64,
    funding_checkpoint: i128,
    salt: u128,
) -> Result<()> {
    require!(
        !ctx.accounts.protocol.trading_enabled,
        ErrorCode::TradingActive
    );
    require!(
        ctx.accounts.market.status == MarketStatus::Draft,
        ErrorCode::MarketNotDraft
    );
    require_keys_eq!(
        ctx.accounts.market_account.market,
        ctx.accounts.market.key(),
        ErrorCode::WrongMarket
    );
    require!(
        ctx.accounts.market_account.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(
        flat_recovery_state(reserved, position, entry_price, funding_checkpoint),
        ErrorCode::InvalidRecoveryState
    );

    let mut preimage = [0u8; 120];
    preimage[..16].copy_from_slice(b"depth.market.v1\0");
    preimage[16..48].copy_from_slice(ctx.accounts.market_account.key().as_ref());
    preimage[48..56].copy_from_slice(&ctx.accounts.market_account.version.to_le_bytes());
    preimage[56..64].copy_from_slice(&collateral.to_le_bytes());
    preimage[64..72].copy_from_slice(&reserved.to_le_bytes());
    preimage[72..80].copy_from_slice(&position.to_le_bytes());
    preimage[80..88].copy_from_slice(&entry_price.to_le_bytes());
    preimage[88..104].copy_from_slice(&funding_checkpoint.to_le_bytes());
    preimage[104..120].copy_from_slice(&salt.to_le_bytes());
    let digest = Sha3_256::digest(preimage);
    require!(
        digest.as_slice() == ctx.accounts.market_account.commitment,
        ErrorCode::InvalidRecoveryState
    );

    let credited = ctx
        .accounts
        .protocol
        .credited_total
        .checked_sub(collateral)
        .ok_or(ErrorCode::InsufficientCreditedTotal)?;
    if collateral > 0 {
        let bump = [ctx.accounts.protocol.bump];
        let seeds: &[&[u8]] = &[b"protocol", &bump];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.settlement_mint.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: ctx.accounts.protocol.to_account_info(),
                },
                &[seeds],
            ),
            collateral,
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
    ctx.accounts.recovery_config.account_count = ctx
        .accounts
        .recovery_config
        .account_count
        .checked_sub(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::flat_recovery_state;

    #[test]
    fn flat_account_recovery_accepts_nonzero_funding_checkpoint() {
        assert!(flat_recovery_state(0, 0, 0, 123_456));
        assert!(flat_recovery_state(0, 0, 0, -123_456));
        assert!(!flat_recovery_state(1, 0, 0, 123_456));
        assert!(!flat_recovery_state(0, 1, 0, 123_456));
        assert!(!flat_recovery_state(0, 0, 1, 123_456));
    }
}
