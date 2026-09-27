use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::COMP_DEF_OFFSET_CREDIT_BALANCE,
    error::ErrorCode,
    state::{BalanceAccount, BalanceStatus, DepositReceipt, DepositStatus, Protocol},
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("credit_balance", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CreditDeposit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        mut,
        seeds = [b"deposit", receipt.owner.as_ref(), receipt.nonce.to_le_bytes().as_ref()],
        bump = receipt.bump,
    )]
    pub receipt: Box<Account<'info, DepositReceipt>>,
    #[account(
        mut,
        constraint = balance.owner == receipt.owner,
        seeds = [b"balance", receipt.owner.as_ref()],
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CREDIT_BALANCE))]
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

#[callback_accounts("credit_balance")]
#[derive(Accounts)]
pub struct CreditBalanceCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CREDIT_BALANCE))]
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
        seeds = [b"deposit", receipt.owner.as_ref(), receipt.nonce.to_le_bytes().as_ref()],
        bump = receipt.bump,
    )]
    pub receipt: Box<Account<'info, DepositReceipt>>,
    #[account(
        mut,
        seeds = [b"balance", balance.owner.as_ref()],
        bump = balance.bump,
    )]
    pub balance: Box<Account<'info, BalanceAccount>>,
}

#[init_computation_definition_accounts("credit_balance", payer)]
#[derive(Accounts)]
pub struct InitCreditBalanceCompDef<'info> {
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
pub struct CancelCredit<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        constraint = receipt.owner == owner.key(),
        seeds = [b"deposit", owner.key().as_ref(), receipt.nonce.to_le_bytes().as_ref()],
        bump = receipt.bump,
    )]
    pub receipt: Box<Account<'info, DepositReceipt>>,
    #[account(
        mut,
        constraint = balance.owner == owner.key(),
        seeds = [b"balance", owner.key().as_ref()],
        bump = balance.bump,
    )]
    pub balance: Box<Account<'info, BalanceAccount>>,
}

pub fn init_credit_balance_comp_def_handler(ctx: Context<InitCreditBalanceCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn credit_deposit_handler(ctx: Context<CreditDeposit>, computation_offset: u64) -> Result<()> {
    require!(
        ctx.accounts.receipt.status == DepositStatus::Pending,
        ErrorCode::WrongDepositStatus
    );
    require!(
        ctx.accounts.balance.status == BalanceStatus::Ready,
        ErrorCode::WrongBalanceStatus
    );
    require!(
        ctx.accounts.balance.version < u64::MAX,
        ErrorCode::CreditedOverflow
    );

    let balance = &mut ctx.accounts.balance;
    balance.status = BalanceStatus::Crediting;
    balance.pending_computation = ctx.accounts.computation_account.key();
    balance.pending_receipt = ctx.accounts.receipt.key();
    balance.pending_amount = ctx.accounts.receipt.amount;
    ctx.accounts.receipt.status = DepositStatus::Crediting;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let mut args = ArgBuilder::new()
        .plaintext_u128(u128::from_le_bytes(balance.nonce))
        .encrypted_u64(balance.ciphertexts[0])
        .encrypted_u128(balance.ciphertexts[1])
        .plaintext_u64(ctx.accounts.receipt.amount);
    for byte in ctx.accounts.receipt.owner.to_bytes() {
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
        vec![CreditBalanceCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.protocol.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.receipt.key(),
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

pub fn credit_deposit_callback_handler(
    ctx: Context<CreditBalanceCallback>,
    output: SignedComputationOutputs<CreditBalanceOutput>,
) -> Result<()> {
    let CreditBalanceOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let balance = &mut ctx.accounts.balance;
    let receipt = &mut ctx.accounts.receipt;
    require!(
        balance.status == BalanceStatus::Crediting,
        ErrorCode::WrongBalanceStatus
    );
    require!(
        receipt.status == DepositStatus::Crediting,
        ErrorCode::WrongDepositStatus
    );
    require_keys_eq!(balance.owner, receipt.owner);
    require_keys_eq!(
        balance.pending_receipt,
        receipt.key(),
        ErrorCode::WrongPendingReceipt
    );
    require_keys_eq!(
        balance.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require!(
        balance.pending_amount == receipt.amount,
        ErrorCode::WrongPendingReceipt
    );

    if result.field_3 {
        require!(
            result.field_1.encryption_key == balance.recovery_key,
            ErrorCode::WrongRecoveryKey
        );
        let pending = ctx
            .accounts
            .protocol
            .pending_total
            .checked_sub(receipt.amount)
            .ok_or(ErrorCode::PendingUnderflow)?;
        let credited = ctx
            .accounts
            .protocol
            .credited_total
            .checked_add(receipt.amount)
            .ok_or(ErrorCode::CreditedOverflow)?;
        ctx.accounts.protocol.pending_total = pending;
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
        receipt.status = DepositStatus::Credited;
    } else {
        receipt.status = DepositStatus::Pending;
    }
    balance.pending_computation = Pubkey::default();
    balance.pending_receipt = Pubkey::default();
    balance.pending_amount = 0;
    balance.status = BalanceStatus::Ready;
    Ok(())
}

pub fn cancel_credit_handler(ctx: Context<CancelCredit>) -> Result<()> {
    require!(
        ctx.accounts.balance.status == BalanceStatus::Crediting,
        ErrorCode::WrongBalanceStatus
    );
    require!(
        ctx.accounts.receipt.status == DepositStatus::Crediting,
        ErrorCode::WrongDepositStatus
    );
    require_keys_eq!(
        ctx.accounts.balance.pending_receipt,
        ctx.accounts.receipt.key(),
        ErrorCode::WrongPendingReceipt
    );
    ctx.accounts.balance.pending_computation = Pubkey::default();
    ctx.accounts.balance.pending_receipt = Pubkey::default();
    ctx.accounts.balance.pending_amount = 0;
    ctx.accounts.balance.status = BalanceStatus::Ready;
    ctx.accounts.receipt.status = DepositStatus::Pending;
    Ok(())
}
