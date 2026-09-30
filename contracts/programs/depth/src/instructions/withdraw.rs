use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::COMP_DEF_OFFSET_DEBIT_BALANCE,
    error::ErrorCode,
    state::{BalanceAccount, BalanceStatus, Protocol, WithdrawalReceipt, WithdrawalStatus},
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("debit_balance", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, nonce: u64)]
pub struct RequestWithdrawal<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        constraint = destination.owner == payer.key(),
        constraint = destination.mint == protocol.settlement_mint,
    )]
    pub destination: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = balance.owner == payer.key(),
        seeds = [b"balance", payer.key().as_ref()],
        bump = balance.bump,
    )]
    pub balance: Box<Account<'info, BalanceAccount>>,
    #[account(
        init, payer = payer, space = 8 + WithdrawalReceipt::INIT_SPACE,
        seeds = [b"withdrawal", balance.key().as_ref(), nonce.to_le_bytes().as_ref()], bump,
    )]
    pub receipt: Box<Account<'info, WithdrawalReceipt>>,
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEBIT_BALANCE))]
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

#[callback_accounts("debit_balance")]
#[derive(Accounts)]
pub struct DebitBalanceCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEBIT_BALANCE))]
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
        constraint = destination.owner == balance.owner,
        token::mint = settlement_mint,
    )]
    pub destination: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [b"balance", balance.owner.as_ref()],
        bump = balance.bump,
    )]
    pub balance: Box<Account<'info, BalanceAccount>>,
    #[account(
        mut, has_one = balance, has_one = destination,
        seeds = [b"withdrawal", balance.key().as_ref(), receipt.nonce.to_le_bytes().as_ref()], bump = receipt.bump,
        constraint = receipt.computation == computation_account.key() @ ErrorCode::WrongPendingComputation,
        constraint = receipt.status == WithdrawalStatus::Queued @ ErrorCode::InvalidWithdrawal,
    )]
    pub receipt: Box<Account<'info, WithdrawalReceipt>>,
    pub token_program: Program<'info, Token>,
}

#[init_computation_definition_accounts("debit_balance", payer)]
#[derive(Accounts)]
pub struct InitDebitBalanceCompDef<'info> {
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
pub struct CancelWithdrawal<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        constraint = balance.owner == owner.key(),
        seeds = [b"balance", owner.key().as_ref()],
        bump = balance.bump,
    )]
    pub balance: Box<Account<'info, BalanceAccount>>,
    #[account(
        mut, has_one = balance, has_one = owner,
        seeds = [b"withdrawal", balance.key().as_ref(), receipt.nonce.to_le_bytes().as_ref()], bump = receipt.bump,
        constraint = receipt.computation == balance.pending_computation @ ErrorCode::WrongPendingComputation,
        constraint = receipt.status == WithdrawalStatus::Queued @ ErrorCode::InvalidWithdrawal,
    )]
    pub receipt: Box<Account<'info, WithdrawalReceipt>>,
}

pub fn init_debit_balance_comp_def_handler(ctx: Context<InitDebitBalanceCompDef>) -> Result<()> {
    init_depth_comp_def!(ctx.accounts, "debit_balance")?;
    Ok(())
}

pub fn request_withdrawal_handler(
    ctx: Context<RequestWithdrawal>,
    computation_offset: u64,
    nonce: u64,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidWithdrawal);
    require!(
        ctx.accounts.balance.status == BalanceStatus::Ready,
        ErrorCode::WrongBalanceStatus
    );
    require!(
        ctx.accounts.balance.version < u64::MAX,
        ErrorCode::CreditedOverflow
    );
    require!(
        ctx.accounts.protocol.credited_total >= amount,
        ErrorCode::InsufficientCreditedTotal
    );

    let receipt = &mut ctx.accounts.receipt;
    receipt.owner = ctx.accounts.payer.key();
    receipt.balance = ctx.accounts.balance.key();
    receipt.destination = ctx.accounts.destination.key();
    receipt.computation = ctx.accounts.computation_account.key();
    receipt.nonce = nonce;
    receipt.amount = amount;
    receipt.version = ctx.accounts.balance.version;
    receipt.status = WithdrawalStatus::Queued;
    receipt.bump = ctx.bumps.receipt;
    let balance = &mut ctx.accounts.balance;
    balance.status = BalanceStatus::Withdrawing;
    balance.pending_computation = ctx.accounts.computation_account.key();
    balance.pending_amount = amount;
    balance.pending_destination = ctx.accounts.destination.key();
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let mut args = ArgBuilder::new()
        .plaintext_u128(u128::from_le_bytes(balance.nonce))
        .encrypted_u64(balance.ciphertexts[0])
        .encrypted_u128(balance.ciphertexts[1])
        .plaintext_u64(amount);
    for byte in ctx.accounts.payer.key().to_bytes() {
        args = args.plaintext_u8(byte);
    }
    let args = args
        .plaintext_u64(balance.version)
        .x25519_pubkey(ctx.accounts.balance.recovery_key)
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![DebitBalanceCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.protocol.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.protocol.settlement_mint,
                    is_writable: false,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.protocol.vault,
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.destination.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.balance.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.receipt.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: token::ID,
                    is_writable: false,
                },
            ],
        )?],
        1,
        0,
        0,
    )?;
    Ok(())
}

pub fn debit_balance_callback_handler(
    ctx: Context<DebitBalanceCallback>,
    output: SignedComputationOutputs<DebitBalanceOutput>,
) -> Result<()> {
    let DebitBalanceOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let balance = &mut ctx.accounts.balance;
    require!(
        balance.status == BalanceStatus::Withdrawing,
        ErrorCode::WrongBalanceStatus
    );
    require_keys_eq!(
        balance.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        balance.pending_destination,
        ctx.accounts.destination.key(),
        ErrorCode::WrongWithdrawalDestination
    );

    require!(
        ctx.accounts.receipt.version == balance.version
            && ctx.accounts.receipt.amount == balance.pending_amount
            && ctx.accounts.receipt.owner == balance.owner,
        ErrorCode::InvalidWithdrawal
    );
    ctx.accounts.receipt.status = if result.field_3 {
        WithdrawalStatus::Paid
    } else {
        WithdrawalStatus::Rejected
    };
    if result.field_3 {
        require!(
            result.field_1.encryption_key == balance.recovery_key,
            ErrorCode::WrongRecoveryKey
        );
        let amount = balance.pending_amount;
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
        ctx.accounts.protocol.credited_total = credited;
        balance.ciphertexts = result.field_0.ciphertexts;
        balance.nonce = result.field_0.nonce.to_le_bytes();
        balance.recovery_ciphertexts = result.field_1.ciphertexts;
        balance.recovery_nonce = result.field_1.nonce.to_le_bytes();
        balance.commitment = result.field_2;
        balance.version = balance
            .version
            .checked_add(1)
            .ok_or(ErrorCode::CreditedOverflow)?;
    }
    balance.pending_computation = Pubkey::default();
    balance.pending_amount = 0;
    balance.pending_destination = Pubkey::default();
    balance.status = BalanceStatus::Ready;
    Ok(())
}

pub fn cancel_withdrawal_handler(ctx: Context<CancelWithdrawal>) -> Result<()> {
    require!(
        ctx.accounts.balance.status == BalanceStatus::Withdrawing,
        ErrorCode::WrongBalanceStatus
    );
    ctx.accounts.receipt.status = WithdrawalStatus::Cancelled;
    ctx.accounts.balance.pending_computation = Pubkey::default();
    ctx.accounts.balance.pending_amount = 0;
    ctx.accounts.balance.pending_destination = Pubkey::default();
    ctx.accounts.balance.status = BalanceStatus::Ready;
    Ok(())
}
