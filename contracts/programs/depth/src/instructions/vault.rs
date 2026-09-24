use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::{
    error::ErrorCode,
    state::{DepositReceipt, DepositStatus, Protocol},
};

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::Depth>,
    #[account(constraint = program_data.upgrade_authority_address == Some(authority.key()))]
    pub program_data: Account<'info, ProgramData>,
    pub settlement_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + Protocol::INIT_SPACE,
        seeds = [b"protocol"],
        bump,
    )]
    pub protocol: Account<'info, Protocol>,
    #[account(
        init,
        payer = authority,
        token::mint = settlement_mint,
        token::authority = protocol,
        seeds = [b"vault"],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = settlement_mint,
        has_one = vault,
    )]
    pub protocol: Account<'info, Protocol>,
    pub settlement_mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = owner,
    )]
    pub source: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = protocol,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = owner,
        space = 8 + DepositReceipt::INIT_SPACE,
        seeds = [b"deposit", owner.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump,
    )]
    pub receipt: Account<'info, DepositReceipt>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RefundDeposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = settlement_mint,
        has_one = vault,
    )]
    pub protocol: Account<'info, Protocol>,
    pub settlement_mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = protocol,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = owner,
    )]
    pub destination: Account<'info, TokenAccount>,
    #[account(
        mut,
        has_one = owner,
        seeds = [b"deposit", owner.key().as_ref(), receipt.nonce.to_le_bytes().as_ref()],
        bump = receipt.bump,
    )]
    pub receipt: Account<'info, DepositReceipt>,
    pub token_program: Program<'info, Token>,
}

pub fn initialize_protocol_handler(ctx: Context<InitializeProtocol>) -> Result<()> {
    require!(
        ctx.accounts.settlement_mint.decimals == 6,
        ErrorCode::InvalidSettlementMint
    );
    let protocol = &mut ctx.accounts.protocol;
    protocol.authority = ctx.accounts.authority.key();
    protocol.settlement_mint = ctx.accounts.settlement_mint.key();
    protocol.vault = ctx.accounts.vault.key();
    protocol.pending_total = 0;
    protocol.credited_total = 0;
    protocol.escrow_total = 0;
    protocol.trading_enabled = false;
    protocol.bump = ctx.bumps.protocol;
    Ok(())
}

pub fn deposit_handler(ctx: Context<Deposit>, nonce: u64, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidDeposit);
    let pending_total = ctx
        .accounts
        .protocol
        .pending_total
        .checked_add(amount)
        .ok_or(ErrorCode::PendingOverflow)?;
    let before = ctx.accounts.vault.amount;
    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.source.to_account_info(),
                mint: ctx.accounts.settlement_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.settlement_mint.decimals,
    )?;
    ctx.accounts.vault.reload()?;
    require!(
        ctx.accounts.vault.amount.checked_sub(before) == Some(amount),
        ErrorCode::DepositAmountMismatch
    );
    require!(
        u128::from(pending_total) + u128::from(ctx.accounts.protocol.credited_total)
            <= u128::from(ctx.accounts.vault.amount),
        ErrorCode::VaultUnderfunded
    );
    ctx.accounts.protocol.pending_total = pending_total;
    let receipt = &mut ctx.accounts.receipt;
    receipt.owner = ctx.accounts.owner.key();
    receipt.nonce = nonce;
    receipt.amount = amount;
    receipt.status = DepositStatus::Pending;
    receipt.bump = ctx.bumps.receipt;
    Ok(())
}

pub fn refund_deposit_handler(ctx: Context<RefundDeposit>) -> Result<()> {
    let receipt = &mut ctx.accounts.receipt;
    require!(
        receipt.status == DepositStatus::Pending,
        ErrorCode::AlreadyRefunded
    );
    let amount = receipt.amount;
    ctx.accounts.protocol.pending_total = ctx
        .accounts
        .protocol
        .pending_total
        .checked_sub(amount)
        .ok_or(ErrorCode::PendingUnderflow)?;
    receipt.status = DepositStatus::Refunded;
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
    Ok(())
}
