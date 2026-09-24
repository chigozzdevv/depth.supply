use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{COMP_DEF_OFFSET_CREDIT_FREE, COMP_DEF_OFFSET_CREDIT_MARKET, SOL_USD_FEED_ID},
    error::ErrorCode,
    state::{
        BalanceAccount, BalanceStatus, MarginTransfer, MarginTransferStatus, Market, MarketAccount,
        MarketAccountStatus, Protocol,
    },
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("credit_market", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SettleAllocation<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        constraint = transfer.owner == payer.key(),
        constraint = transfer.market == market.key() @ ErrorCode::WrongMarket,
        seeds = [b"margin-transfer", payer.key().as_ref(), transfer.nonce.to_le_bytes().as_ref()],
        bump = transfer.bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
    #[account(
        mut,
        constraint = market_account.owner == payer.key(),
        constraint = market_account.market == market.key() @ ErrorCode::WrongMarket,
        seeds = [b"market-account", market.key().as_ref(), payer.key().as_ref()],
        bump = market_account.bump,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CREDIT_MARKET))]
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

#[callback_accounts("credit_market")]
#[derive(Accounts)]
pub struct CreditMarketCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CREDIT_MARKET))]
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
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        mut,
        seeds = [b"margin-transfer", transfer.owner.as_ref(), transfer.nonce.to_le_bytes().as_ref()],
        bump = transfer.bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
    #[account(
        mut,
        seeds = [b"market-account", market_account.market.as_ref(), market_account.owner.as_ref()],
        bump = market_account.bump,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,
}

#[init_computation_definition_accounts("credit_market", payer)]
#[derive(Accounts)]
pub struct InitCreditMarketCompDef<'info> {
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

#[queue_computation_accounts("credit_free", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SettleRelease<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        mut,
        constraint = transfer.owner == payer.key(),
        seeds = [b"margin-transfer", payer.key().as_ref(), transfer.nonce.to_le_bytes().as_ref()],
        bump = transfer.bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
    #[account(
        mut,
        constraint = balance.owner == payer.key(),
        seeds = [b"balance", payer.key().as_ref()],
        bump = balance.bump,
    )]
    pub balance: Box<Account<'info, BalanceAccount>>,
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CREDIT_FREE))]
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

#[callback_accounts("credit_free")]
#[derive(Accounts)]
pub struct CreditFreeCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CREDIT_FREE))]
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
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        mut,
        seeds = [b"margin-transfer", transfer.owner.as_ref(), transfer.nonce.to_le_bytes().as_ref()],
        bump = transfer.bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
    #[account(mut, seeds = [b"balance", balance.owner.as_ref()], bump = balance.bump)]
    pub balance: Box<Account<'info, BalanceAccount>>,
}

#[init_computation_definition_accounts("credit_free", payer)]
#[derive(Accounts)]
pub struct InitCreditFreeCompDef<'info> {
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
pub struct CancelMarketCredit<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        constraint = transfer.owner == owner.key(),
        seeds = [b"margin-transfer", owner.key().as_ref(), transfer.nonce.to_le_bytes().as_ref()],
        bump = transfer.bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
    #[account(
        mut,
        constraint = market_account.owner == owner.key(),
        constraint = market_account.market == transfer.market @ ErrorCode::WrongMarket,
        seeds = [b"market-account", transfer.market.as_ref(), owner.key().as_ref()],
        bump = market_account.bump,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,
}

#[derive(Accounts)]
pub struct CancelFreeCredit<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        constraint = transfer.owner == owner.key(),
        seeds = [b"margin-transfer", owner.key().as_ref(), transfer.nonce.to_le_bytes().as_ref()],
        bump = transfer.bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
    #[account(
        mut,
        constraint = balance.owner == owner.key(),
        seeds = [b"balance", owner.key().as_ref()],
        bump = balance.bump,
    )]
    pub balance: Box<Account<'info, BalanceAccount>>,
}

#[derive(Accounts)]
pub struct RefundEscrow<'info> {
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
    #[account(mut, token::mint = settlement_mint, token::authority = protocol)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = settlement_mint, token::authority = owner)]
    pub destination: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = transfer.owner == owner.key(),
        seeds = [b"margin-transfer", owner.key().as_ref(), transfer.nonce.to_le_bytes().as_ref()],
        bump = transfer.bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
    pub token_program: Program<'info, Token>,
}

pub fn init_credit_market_comp_def_handler(ctx: Context<InitCreditMarketCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn init_credit_free_comp_def_handler(ctx: Context<InitCreditFreeCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn settle_allocation_handler(
    ctx: Context<SettleAllocation>,
    computation_offset: u64,
) -> Result<()> {
    require!(
        ctx.accounts.transfer.status == MarginTransferStatus::Escrow
            && ctx.accounts.transfer.to_market,
        ErrorCode::WrongMarginTransferStatus
    );
    require!(
        ctx.accounts.market_account.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(
        ctx.accounts.market_account.version < u64::MAX,
        ErrorCode::RevisionOverflow
    );
    require!(
        ctx.accounts.protocol.escrow_total >= ctx.accounts.transfer.amount,
        ErrorCode::EscrowUnderflow
    );
    let account = &mut ctx.accounts.market_account;
    account.status = MarketAccountStatus::Moving;
    account.pending_computation = ctx.accounts.computation_account.key();
    ctx.accounts.transfer.status = MarginTransferStatus::Crediting;
    ctx.accounts.transfer.pending_computation = ctx.accounts.computation_account.key();
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let mut args = ArgBuilder::new()
        .plaintext_u128(u128::from_le_bytes(account.nonce))
        .encrypted_u64(account.ciphertexts[0])
        .encrypted_u64(account.ciphertexts[1])
        .encrypted_u64(account.ciphertexts[2])
        .plaintext_u64(ctx.accounts.transfer.amount);
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
        vec![CreditMarketCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.protocol.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.transfer.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.market_account.key(),
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

pub fn settle_release_handler(ctx: Context<SettleRelease>, computation_offset: u64) -> Result<()> {
    require!(
        ctx.accounts.transfer.status == MarginTransferStatus::Escrow
            && !ctx.accounts.transfer.to_market,
        ErrorCode::WrongMarginTransferStatus
    );
    require!(
        ctx.accounts.balance.status == BalanceStatus::Ready,
        ErrorCode::WrongBalanceStatus
    );
    require!(
        ctx.accounts.balance.version < u64::MAX,
        ErrorCode::RevisionOverflow
    );
    require!(
        ctx.accounts.protocol.escrow_total >= ctx.accounts.transfer.amount,
        ErrorCode::EscrowUnderflow
    );
    let balance = &mut ctx.accounts.balance;
    balance.status = BalanceStatus::Moving;
    balance.pending_computation = ctx.accounts.computation_account.key();
    ctx.accounts.transfer.status = MarginTransferStatus::Crediting;
    ctx.accounts.transfer.pending_computation = ctx.accounts.computation_account.key();
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let mut args = ArgBuilder::new()
        .plaintext_u128(u128::from_le_bytes(balance.nonce))
        .encrypted_u64(balance.ciphertexts[0])
        .encrypted_u128(balance.ciphertexts[1])
        .plaintext_u64(ctx.accounts.transfer.amount);
    for byte in balance.owner.to_bytes() {
        args = args.plaintext_u8(byte);
    }
    let args = args
        .plaintext_u64(balance.version)
        .x25519_pubkey(balance.recovery_key)
        .build();
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![CreditFreeCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.protocol.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.transfer.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.balance.key(),
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

pub fn credit_market_callback_handler(
    ctx: Context<CreditMarketCallback>,
    output: SignedComputationOutputs<CreditMarketOutput>,
) -> Result<()> {
    let CreditMarketOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let account = &mut ctx.accounts.market_account;
    let transfer = &mut ctx.accounts.transfer;
    require!(
        account.status == MarketAccountStatus::Moving,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(
        transfer.status == MarginTransferStatus::Crediting && transfer.to_market,
        ErrorCode::WrongMarginTransferStatus
    );
    require_keys_eq!(
        transfer.owner,
        account.owner,
        ErrorCode::WrongMarginTransfer
    );
    require_keys_eq!(transfer.market, account.market, ErrorCode::WrongMarket);
    require_keys_eq!(
        account.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        transfer.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    if result.field_3 {
        require!(
            result.field_1.encryption_key == account.recovery_key,
            ErrorCode::WrongRecoveryKey
        );
        ctx.accounts.protocol.escrow_total = ctx
            .accounts
            .protocol
            .escrow_total
            .checked_sub(transfer.amount)
            .ok_or(ErrorCode::EscrowUnderflow)?;
        account.ciphertexts = result.field_0.ciphertexts;
        account.nonce = result.field_0.nonce.to_le_bytes();
        account.recovery_ciphertexts = result.field_1.ciphertexts;
        account.recovery_nonce = result.field_1.nonce.to_le_bytes();
        account.commitment = result.field_2;
        account.version = account
            .version
            .checked_add(1)
            .ok_or(ErrorCode::RevisionOverflow)?;
        transfer.status = MarginTransferStatus::Settled;
    } else {
        transfer.status = MarginTransferStatus::Escrow;
    }
    account.status = MarketAccountStatus::Ready;
    account.pending_computation = Pubkey::default();
    transfer.pending_computation = Pubkey::default();
    Ok(())
}

pub fn credit_free_callback_handler(
    ctx: Context<CreditFreeCallback>,
    output: SignedComputationOutputs<CreditFreeOutput>,
) -> Result<()> {
    let CreditFreeOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let balance = &mut ctx.accounts.balance;
    let transfer = &mut ctx.accounts.transfer;
    require!(
        balance.status == BalanceStatus::Moving,
        ErrorCode::WrongBalanceStatus
    );
    require!(
        transfer.status == MarginTransferStatus::Crediting && !transfer.to_market,
        ErrorCode::WrongMarginTransferStatus
    );
    require_keys_eq!(
        transfer.owner,
        balance.owner,
        ErrorCode::WrongMarginTransfer
    );
    require_keys_eq!(
        balance.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        transfer.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    if result.field_3 {
        require!(
            result.field_1.encryption_key == balance.recovery_key,
            ErrorCode::WrongRecoveryKey
        );
        ctx.accounts.protocol.escrow_total = ctx
            .accounts
            .protocol
            .escrow_total
            .checked_sub(transfer.amount)
            .ok_or(ErrorCode::EscrowUnderflow)?;
        balance.ciphertexts = result.field_0.ciphertexts;
        balance.nonce = result.field_0.nonce.to_le_bytes();
        balance.recovery_ciphertexts = result.field_1.ciphertexts;
        balance.recovery_nonce = result.field_1.nonce.to_le_bytes();
        balance.commitment = result.field_2;
        balance.version = balance
            .version
            .checked_add(1)
            .ok_or(ErrorCode::RevisionOverflow)?;
        transfer.status = MarginTransferStatus::Settled;
    } else {
        transfer.status = MarginTransferStatus::Escrow;
    }
    balance.status = BalanceStatus::Ready;
    balance.pending_computation = Pubkey::default();
    transfer.pending_computation = Pubkey::default();
    Ok(())
}

pub fn cancel_market_credit_handler(ctx: Context<CancelMarketCredit>) -> Result<()> {
    require!(
        ctx.accounts.market_account.status == MarketAccountStatus::Moving,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(
        ctx.accounts.transfer.status == MarginTransferStatus::Crediting
            && ctx.accounts.transfer.to_market,
        ErrorCode::WrongMarginTransferStatus
    );
    require_keys_eq!(
        ctx.accounts.market_account.pending_computation,
        ctx.accounts.transfer.pending_computation,
        ErrorCode::WrongPendingComputation
    );
    ctx.accounts.market_account.status = MarketAccountStatus::Ready;
    ctx.accounts.market_account.pending_computation = Pubkey::default();
    ctx.accounts.transfer.status = MarginTransferStatus::Escrow;
    ctx.accounts.transfer.pending_computation = Pubkey::default();
    Ok(())
}

pub fn cancel_free_credit_handler(ctx: Context<CancelFreeCredit>) -> Result<()> {
    require!(
        ctx.accounts.balance.status == BalanceStatus::Moving,
        ErrorCode::WrongBalanceStatus
    );
    require!(
        ctx.accounts.transfer.status == MarginTransferStatus::Crediting
            && !ctx.accounts.transfer.to_market,
        ErrorCode::WrongMarginTransferStatus
    );
    require_keys_eq!(
        ctx.accounts.balance.pending_computation,
        ctx.accounts.transfer.pending_computation,
        ErrorCode::WrongPendingComputation
    );
    ctx.accounts.balance.status = BalanceStatus::Ready;
    ctx.accounts.balance.pending_computation = Pubkey::default();
    ctx.accounts.transfer.status = MarginTransferStatus::Escrow;
    ctx.accounts.transfer.pending_computation = Pubkey::default();
    Ok(())
}

pub fn refund_escrow_handler(ctx: Context<RefundEscrow>) -> Result<()> {
    require!(
        ctx.accounts.transfer.status == MarginTransferStatus::Escrow,
        ErrorCode::WrongMarginTransferStatus
    );
    let amount = ctx.accounts.transfer.amount;
    let escrow = ctx
        .accounts
        .protocol
        .escrow_total
        .checked_sub(amount)
        .ok_or(ErrorCode::EscrowUnderflow)?;
    let credited = ctx
        .accounts
        .protocol
        .credited_total
        .checked_sub(amount)
        .ok_or(ErrorCode::InsufficientCreditedTotal)?;
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
    require!(
        u128::from(ctx.accounts.protocol.pending_total) + u128::from(credited)
            <= u128::from(ctx.accounts.vault.amount),
        ErrorCode::VaultUnderfunded
    );
    ctx.accounts.protocol.escrow_total = escrow;
    ctx.accounts.protocol.credited_total = credited;
    ctx.accounts.transfer.status = MarginTransferStatus::Refunded;
    Ok(())
}
