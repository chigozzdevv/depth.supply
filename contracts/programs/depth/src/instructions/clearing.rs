use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;
use sha3::{Digest, Sha3_256};

use crate::{
    constants::{COMP_DEF_OFFSET_CREDIT_INSURANCE, COMP_DEF_OFFSET_OPEN_CLEARING, SOL_USD_FEED_ID},
    error::ErrorCode,
    state::{
        ClearingAccount, ClearingStatus, DepositReceipt, DepositStatus, Market, MarketStatus,
        Protocol, RecoveryConfig,
    },
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("open_clearing", authority)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct OpenClearing<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = authority)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(seeds = [b"recovery-config", market.key().as_ref()], bump = recovery_config.bump)]
    pub recovery_config: Box<Account<'info, RecoveryConfig>>,
    #[account(init, payer = authority, space = 8 + ClearingAccount::INIT_SPACE, seeds = [b"clearing", market.key().as_ref()], bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(init_if_needed, space = 9, payer = authority, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_OPEN_CLEARING))]
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

#[callback_accounts("open_clearing")]
#[derive(Accounts)]
pub struct OpenClearingCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_OPEN_CLEARING))]
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
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", clearing.market.as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
}

#[init_computation_definition_accounts("open_clearing", payer)]
#[derive(Accounts)]
pub struct InitOpenClearingCompDef<'info> {
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
pub struct CancelOpenClearing<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = authority)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, close = authority, seeds = [b"clearing", clearing.market.as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
}

#[queue_computation_accounts("credit_insurance", authority)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CreditInsurance<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = authority)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, constraint = receipt.owner == authority.key(), seeds = [b"deposit", authority.key().as_ref(), receipt.nonce.to_le_bytes().as_ref()], bump = receipt.bump)]
    pub receipt: Box<Account<'info, DepositReceipt>>,
    #[account(mut, constraint = clearing.market == market.key() @ ErrorCode::WrongMarket, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(init_if_needed, space = 9, payer = authority, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CREDIT_INSURANCE))]
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

#[callback_accounts("credit_insurance")]
#[derive(Accounts)]
pub struct CreditInsuranceCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CREDIT_INSURANCE))]
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
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"deposit", receipt.owner.as_ref(), receipt.nonce.to_le_bytes().as_ref()], bump = receipt.bump)]
    pub receipt: Box<Account<'info, DepositReceipt>>,
    #[account(mut, seeds = [b"clearing", clearing.market.as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
}

#[init_computation_definition_accounts("credit_insurance", payer)]
#[derive(Accounts)]
pub struct InitCreditInsuranceCompDef<'info> {
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
pub struct CancelInsuranceCredit<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = authority)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, constraint = receipt.owner == authority.key(), seeds = [b"deposit", authority.key().as_ref(), receipt.nonce.to_le_bytes().as_ref()], bump = receipt.bump)]
    pub receipt: Box<Account<'info, DepositReceipt>>,
    #[account(mut, seeds = [b"clearing", clearing.market.as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
}

#[derive(Accounts)]
pub struct RecoverClearing<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = authority, has_one = settlement_mint, has_one = vault)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    pub settlement_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = settlement_mint, token::authority = protocol)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = settlement_mint, token::authority = authority)]
    pub destination: Box<Account<'info, TokenAccount>>,
    #[account(mut, close = authority, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    pub token_program: Program<'info, Token>,
}

pub fn init_open_clearing_comp_def_handler(ctx: Context<InitOpenClearingCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn init_credit_insurance_comp_def_handler(
    ctx: Context<InitCreditInsuranceCompDef>,
) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn open_clearing_handler(
    ctx: Context<OpenClearing>,
    computation_offset: u64,
    recovery_key: [u8; 32],
) -> Result<()> {
    require!(
        ctx.accounts.market.status == MarketStatus::Draft,
        ErrorCode::MarketNotDraft
    );
    require!(
        recovery_key == ctx.accounts.recovery_config.recovery_key,
        ErrorCode::WrongRecoveryKey
    );
    let clearing = &mut ctx.accounts.clearing;
    clearing.market = ctx.accounts.market.key();
    clearing.recovery_key = recovery_key;
    clearing.pending_computation = ctx.accounts.computation_account.key();
    clearing.status = ClearingStatus::Opening;
    clearing.bump = ctx.bumps.clearing;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    let mut args = ArgBuilder::new();
    for byte in clearing.market.to_bytes() {
        args = args.plaintext_u8(byte);
    }
    let args = args.x25519_pubkey(recovery_key).build();
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![OpenClearingCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.market.key(),
                    is_writable: false,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.clearing.key(),
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

pub fn open_clearing_callback_handler(
    ctx: Context<OpenClearingCallback>,
    output: SignedComputationOutputs<OpenClearingOutput>,
) -> Result<()> {
    let OpenClearingOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let clearing = &mut ctx.accounts.clearing;
    require!(
        clearing.status == ClearingStatus::Opening,
        ErrorCode::WrongClearingStatus
    );
    require_keys_eq!(
        clearing.market,
        ctx.accounts.market.key(),
        ErrorCode::WrongMarket
    );
    require_keys_eq!(
        clearing.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require!(
        result.field_1.encryption_key == clearing.recovery_key,
        ErrorCode::WrongRecoveryKey
    );
    clearing.ciphertexts = result.field_0.ciphertexts;
    clearing.nonce = result.field_0.nonce.to_le_bytes();
    clearing.recovery_ciphertexts = result.field_1.ciphertexts;
    clearing.recovery_nonce = result.field_1.nonce.to_le_bytes();
    clearing.commitment = result.field_2;
    clearing.pending_computation = Pubkey::default();
    clearing.status = ClearingStatus::Ready;
    Ok(())
}

pub fn cancel_open_clearing_handler(ctx: Context<CancelOpenClearing>) -> Result<()> {
    require!(
        ctx.accounts.clearing.status == ClearingStatus::Opening,
        ErrorCode::WrongClearingStatus
    );
    Ok(())
}

pub fn credit_insurance_handler(
    ctx: Context<CreditInsurance>,
    computation_offset: u64,
) -> Result<()> {
    require!(
        ctx.accounts.market.status != MarketStatus::Settling,
        ErrorCode::MarketNotActive
    );
    require!(
        ctx.accounts.receipt.status == DepositStatus::Pending,
        ErrorCode::WrongDepositStatus
    );
    require!(
        ctx.accounts.clearing.status == ClearingStatus::Ready,
        ErrorCode::WrongClearingStatus
    );
    require!(
        ctx.accounts.clearing.version < u64::MAX,
        ErrorCode::RevisionOverflow
    );
    require!(
        ctx.accounts.market.pending_orders == 0,
        ErrorCode::WrongOrderStatus
    );
    let clearing = &mut ctx.accounts.clearing;
    clearing.status = ClearingStatus::Crediting;
    clearing.pending_computation = ctx.accounts.computation_account.key();
    clearing.pending_receipt = ctx.accounts.receipt.key();
    clearing.pending_amount = ctx.accounts.receipt.amount;
    ctx.accounts.receipt.status = DepositStatus::Crediting;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    let mut args = ArgBuilder::new()
        .plaintext_u128(u128::from_le_bytes(clearing.nonce))
        .encrypted_u64(clearing.ciphertexts[0])
        .encrypted_u64(clearing.ciphertexts[1])
        .plaintext_u64(ctx.accounts.receipt.amount);
    for byte in clearing.market.to_bytes() {
        args = args.plaintext_u8(byte);
    }
    let args = args
        .plaintext_u64(clearing.version)
        .x25519_pubkey(clearing.recovery_key)
        .build();
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![CreditInsuranceCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.protocol.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.market.key(),
                    is_writable: false,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.receipt.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.clearing.key(),
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

pub fn credit_insurance_callback_handler(
    ctx: Context<CreditInsuranceCallback>,
    output: SignedComputationOutputs<CreditInsuranceOutput>,
) -> Result<()> {
    let CreditInsuranceOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let clearing = &mut ctx.accounts.clearing;
    let receipt = &mut ctx.accounts.receipt;
    require!(
        clearing.status == ClearingStatus::Crediting,
        ErrorCode::WrongClearingStatus
    );
    require!(
        receipt.status == DepositStatus::Crediting,
        ErrorCode::WrongDepositStatus
    );
    require_keys_eq!(
        clearing.market,
        ctx.accounts.market.key(),
        ErrorCode::WrongMarket
    );
    require_keys_eq!(
        receipt.owner,
        ctx.accounts.protocol.authority,
        ErrorCode::WrongPendingReceipt
    );
    require_keys_eq!(
        clearing.pending_receipt,
        receipt.key(),
        ErrorCode::WrongPendingReceipt
    );
    require_keys_eq!(
        clearing.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require!(
        clearing.pending_amount == receipt.amount,
        ErrorCode::WrongPendingReceipt
    );
    if result.field_3 && ctx.accounts.market.pending_orders == 0 {
        require!(
            result.field_1.encryption_key == clearing.recovery_key,
            ErrorCode::WrongRecoveryKey
        );
        ctx.accounts.protocol.pending_total = ctx
            .accounts
            .protocol
            .pending_total
            .checked_sub(receipt.amount)
            .ok_or(ErrorCode::PendingUnderflow)?;
        ctx.accounts.protocol.credited_total = ctx
            .accounts
            .protocol
            .credited_total
            .checked_add(receipt.amount)
            .ok_or(ErrorCode::CreditedOverflow)?;
        clearing.ciphertexts = result.field_0.ciphertexts;
        clearing.nonce = result.field_0.nonce.to_le_bytes();
        clearing.recovery_ciphertexts = result.field_1.ciphertexts;
        clearing.recovery_nonce = result.field_1.nonce.to_le_bytes();
        clearing.commitment = result.field_2;
        clearing.version = clearing
            .version
            .checked_add(1)
            .ok_or(ErrorCode::RevisionOverflow)?;
        receipt.status = DepositStatus::Credited;
    } else {
        receipt.status = DepositStatus::Pending;
    }
    clearing.pending_computation = Pubkey::default();
    clearing.pending_receipt = Pubkey::default();
    clearing.pending_amount = 0;
    clearing.status = ClearingStatus::Ready;
    Ok(())
}

pub fn cancel_insurance_credit_handler(ctx: Context<CancelInsuranceCredit>) -> Result<()> {
    require!(
        ctx.accounts.clearing.status == ClearingStatus::Crediting,
        ErrorCode::WrongClearingStatus
    );
    require!(
        ctx.accounts.receipt.status == DepositStatus::Crediting,
        ErrorCode::WrongDepositStatus
    );
    require_keys_eq!(
        ctx.accounts.clearing.pending_receipt,
        ctx.accounts.receipt.key(),
        ErrorCode::WrongPendingReceipt
    );
    ctx.accounts.clearing.pending_computation = Pubkey::default();
    ctx.accounts.clearing.pending_receipt = Pubkey::default();
    ctx.accounts.clearing.pending_amount = 0;
    ctx.accounts.clearing.status = ClearingStatus::Ready;
    ctx.accounts.receipt.status = DepositStatus::Pending;
    Ok(())
}

pub fn recover_clearing_handler(
    ctx: Context<RecoverClearing>,
    insurance: u64,
    salt: u128,
) -> Result<()> {
    require!(
        !ctx.accounts.protocol.trading_enabled && ctx.accounts.market.status == MarketStatus::Draft,
        ErrorCode::TradingActive
    );
    require!(
        ctx.accounts.clearing.status == ClearingStatus::Ready,
        ErrorCode::WrongClearingStatus
    );
    require_keys_eq!(
        ctx.accounts.clearing.market,
        ctx.accounts.market.key(),
        ErrorCode::WrongMarket
    );
    let mut preimage = [0u8; 104];
    preimage[..16].copy_from_slice(b"depth.clear.v2\0\0");
    preimage[16..48].copy_from_slice(ctx.accounts.market.key().as_ref());
    preimage[48..56].copy_from_slice(&ctx.accounts.clearing.version.to_le_bytes());
    preimage[56..64].copy_from_slice(&insurance.to_le_bytes());
    preimage[64..72].copy_from_slice(&0u64.to_le_bytes());
    preimage[72..88].copy_from_slice(&[0; 16]);
    preimage[88..104].copy_from_slice(&salt.to_le_bytes());
    require!(
        Sha3_256::digest(preimage).as_slice() == ctx.accounts.clearing.commitment,
        ErrorCode::InvalidRecoveryState
    );
    let credited = ctx
        .accounts
        .protocol
        .credited_total
        .checked_sub(insurance)
        .ok_or(ErrorCode::InsufficientCreditedTotal)?;
    let bump = [ctx.accounts.protocol.bump];
    let seeds: &[&[u8]] = &[b"protocol", &bump];
    if insurance > 0 {
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
            insurance,
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
