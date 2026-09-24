use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::COMP_DEF_OFFSET_OPEN_BALANCE,
    error::ErrorCode,
    state::{BalanceAccount, BalanceStatus, Protocol},
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("open_balance", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct OpenBalance<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        init,
        payer = payer,
        space = 8 + BalanceAccount::INIT_SPACE,
        seeds = [b"balance", payer.key().as_ref()],
        bump,
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_OPEN_BALANCE))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("open_balance")]
#[derive(Accounts)]
pub struct OpenBalanceCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_OPEN_BALANCE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: The signed Arcium output is verified against this computation account.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::arcium_anchor::solana_instructions_sysvar::ID)]
    /// CHECK: The account constraint validates the instructions sysvar.
    pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        mut,
        seeds = [b"balance", balance.owner.as_ref()],
        bump = balance.bump,
    )]
    pub balance: Box<Account<'info, BalanceAccount>>,
}

#[init_computation_definition_accounts("open_balance", payer)]
#[derive(Accounts)]
pub struct InitOpenBalanceCompDef<'info> {
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
pub struct CancelOpenBalance<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        close = owner,
        constraint = balance.owner == owner.key(),
        seeds = [b"balance", owner.key().as_ref()],
        bump = balance.bump,
    )]
    pub balance: Box<Account<'info, BalanceAccount>>,
}

pub fn init_open_balance_comp_def_handler(ctx: Context<InitOpenBalanceCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn open_balance_handler(
    ctx: Context<OpenBalance>,
    computation_offset: u64,
    recovery_key: [u8; 32],
) -> Result<()> {
    require!(recovery_key != [0; 32], ErrorCode::InvalidRecoveryKey);
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    let balance = &mut ctx.accounts.balance;
    balance.owner = ctx.accounts.payer.key();
    balance.recovery_key = recovery_key;
    balance.status = BalanceStatus::Opening;
    balance.pending_computation = ctx.accounts.computation_account.key();
    balance.bump = ctx.bumps.balance;

    let mut args = ArgBuilder::new();
    for byte in ctx.accounts.payer.key().to_bytes() {
        args = args.plaintext_u8(byte);
    }
    let args = args.x25519_pubkey(balance.recovery_key).build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![OpenBalanceCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.protocol.key(),
                    is_writable: false,
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

pub fn open_balance_callback_handler(
    ctx: Context<OpenBalanceCallback>,
    output: SignedComputationOutputs<OpenBalanceOutput>,
) -> Result<()> {
    let OpenBalanceOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let balance = &mut ctx.accounts.balance;
    require!(
        balance.status == BalanceStatus::Opening,
        ErrorCode::WrongBalanceStatus
    );
    require_keys_eq!(
        balance.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require!(
        result.field_1.encryption_key == balance.recovery_key,
        ErrorCode::WrongRecoveryKey
    );
    balance.ciphertexts = result.field_0.ciphertexts;
    balance.nonce = result.field_0.nonce.to_le_bytes();
    balance.recovery_ciphertexts = result.field_1.ciphertexts;
    balance.recovery_nonce = result.field_1.nonce.to_le_bytes();
    balance.commitment = result.field_2;
    balance.pending_computation = Pubkey::default();
    balance.status = BalanceStatus::Ready;
    Ok(())
}

pub fn cancel_open_balance_handler(ctx: Context<CancelOpenBalance>) -> Result<()> {
    require!(
        ctx.accounts.balance.status == BalanceStatus::Opening,
        ErrorCode::WrongBalanceStatus
    );
    Ok(())
}
