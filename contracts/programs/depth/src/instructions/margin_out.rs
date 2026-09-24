use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{COMP_DEF_OFFSET_DEBIT_FREE, COMP_DEF_OFFSET_DEBIT_MARKET, SOL_USD_FEED_ID},
    error::ErrorCode,
    state::{
        BalanceAccount, BalanceStatus, MarginTransfer, MarginTransferStatus, Market, MarketAccount,
        MarketAccountStatus, Protocol,
    },
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("debit_free", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, nonce: u64)]
pub struct BeginAllocation<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        constraint = balance.owner == payer.key(),
        seeds = [b"balance", payer.key().as_ref()],
        bump = balance.bump,
    )]
    pub balance: Box<Account<'info, BalanceAccount>>,
    #[account(
        init,
        payer = payer,
        space = 8 + MarginTransfer::INIT_SPACE,
        seeds = [b"margin-transfer", payer.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEBIT_FREE))]
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

#[callback_accounts("debit_free")]
#[derive(Accounts)]
pub struct DebitFreeCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEBIT_FREE))]
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
    #[account(mut, seeds = [b"balance", balance.owner.as_ref()], bump = balance.bump)]
    pub balance: Box<Account<'info, BalanceAccount>>,
    #[account(
        mut,
        seeds = [b"margin-transfer", transfer.owner.as_ref(), transfer.nonce.to_le_bytes().as_ref()],
        bump = transfer.bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
}

#[init_computation_definition_accounts("debit_free", payer)]
#[derive(Accounts)]
pub struct InitDebitFreeCompDef<'info> {
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

#[queue_computation_accounts("debit_market", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, nonce: u64)]
pub struct BeginRelease<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        constraint = market_account.owner == payer.key(),
        constraint = market_account.market == market.key() @ ErrorCode::WrongMarket,
        seeds = [b"market-account", market.key().as_ref(), payer.key().as_ref()],
        bump = market_account.bump,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(
        init,
        payer = payer,
        space = 8 + MarginTransfer::INIT_SPACE,
        seeds = [b"margin-transfer", payer.key().as_ref(), nonce.to_le_bytes().as_ref()],
        bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEBIT_MARKET))]
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

#[callback_accounts("debit_market")]
#[derive(Accounts)]
pub struct DebitMarketCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DEBIT_MARKET))]
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
        seeds = [b"market-account", market_account.market.as_ref(), market_account.owner.as_ref()],
        bump = market_account.bump,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(
        mut,
        seeds = [b"margin-transfer", transfer.owner.as_ref(), transfer.nonce.to_le_bytes().as_ref()],
        bump = transfer.bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
}

#[init_computation_definition_accounts("debit_market", payer)]
#[derive(Accounts)]
pub struct InitDebitMarketCompDef<'info> {
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
pub struct CancelFreeDebit<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        constraint = balance.owner == owner.key(),
        seeds = [b"balance", owner.key().as_ref()],
        bump = balance.bump,
    )]
    pub balance: Box<Account<'info, BalanceAccount>>,
    #[account(
        mut,
        constraint = transfer.owner == owner.key(),
        seeds = [b"margin-transfer", owner.key().as_ref(), transfer.nonce.to_le_bytes().as_ref()],
        bump = transfer.bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
}

#[derive(Accounts)]
pub struct CancelMarketDebit<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        constraint = market_account.owner == owner.key(),
        seeds = [b"market-account", market_account.market.as_ref(), owner.key().as_ref()],
        bump = market_account.bump,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(
        mut,
        constraint = transfer.owner == owner.key(),
        seeds = [b"margin-transfer", owner.key().as_ref(), transfer.nonce.to_le_bytes().as_ref()],
        bump = transfer.bump,
    )]
    pub transfer: Box<Account<'info, MarginTransfer>>,
}

pub fn init_debit_free_comp_def_handler(ctx: Context<InitDebitFreeCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn init_debit_market_comp_def_handler(ctx: Context<InitDebitMarketCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn begin_allocation_handler(
    ctx: Context<BeginAllocation>,
    computation_offset: u64,
    nonce: u64,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidDeposit);
    require!(
        ctx.accounts.balance.status == BalanceStatus::Ready,
        ErrorCode::WrongBalanceStatus
    );
    require!(
        ctx.accounts.balance.version < u64::MAX,
        ErrorCode::RevisionOverflow
    );
    let transfer = &mut ctx.accounts.transfer;
    transfer.owner = ctx.accounts.payer.key();
    transfer.market = ctx.accounts.market.key();
    transfer.nonce = nonce;
    transfer.amount = amount;
    transfer.to_market = true;
    transfer.pending_computation = ctx.accounts.computation_account.key();
    transfer.status = MarginTransferStatus::Debiting;
    transfer.bump = ctx.bumps.transfer;
    let balance = &mut ctx.accounts.balance;
    balance.status = BalanceStatus::Moving;
    balance.pending_computation = ctx.accounts.computation_account.key();
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
        .x25519_pubkey(balance.recovery_key)
        .build();
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![DebitFreeCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.protocol.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.balance.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.transfer.key(),
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

pub fn begin_release_handler(
    ctx: Context<BeginRelease>,
    computation_offset: u64,
    nonce: u64,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidDeposit);
    require!(
        ctx.accounts.market_account.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(
        ctx.accounts.market_account.version < u64::MAX,
        ErrorCode::RevisionOverflow
    );
    let transfer = &mut ctx.accounts.transfer;
    transfer.owner = ctx.accounts.payer.key();
    transfer.market = ctx.accounts.market.key();
    transfer.nonce = nonce;
    transfer.amount = amount;
    transfer.to_market = false;
    transfer.pending_computation = ctx.accounts.computation_account.key();
    transfer.status = MarginTransferStatus::Debiting;
    transfer.bump = ctx.bumps.transfer;
    let account = &mut ctx.accounts.market_account;
    account.status = MarketAccountStatus::Moving;
    account.pending_computation = ctx.accounts.computation_account.key();
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let mut args = ArgBuilder::new()
        .plaintext_u128(u128::from_le_bytes(account.nonce))
        .encrypted_u64(account.ciphertexts[0])
        .encrypted_u64(account.ciphertexts[1])
        .encrypted_u64(account.ciphertexts[2])
        .plaintext_u64(amount);
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
        vec![DebitMarketCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.protocol.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.market_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.transfer.key(),
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

pub fn debit_free_callback_handler(
    ctx: Context<DebitFreeCallback>,
    output: SignedComputationOutputs<DebitFreeOutput>,
) -> Result<()> {
    let DebitFreeOutput { field_0: result } = output
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
        transfer.status == MarginTransferStatus::Debiting && transfer.to_market,
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
            .checked_add(transfer.amount)
            .ok_or(ErrorCode::EscrowOverflow)?;
        balance.ciphertexts = result.field_0.ciphertexts;
        balance.nonce = result.field_0.nonce.to_le_bytes();
        balance.recovery_ciphertexts = result.field_1.ciphertexts;
        balance.recovery_nonce = result.field_1.nonce.to_le_bytes();
        balance.commitment = result.field_2;
        balance.version = balance
            .version
            .checked_add(1)
            .ok_or(ErrorCode::RevisionOverflow)?;
        transfer.status = MarginTransferStatus::Escrow;
    } else {
        transfer.status = MarginTransferStatus::Rejected;
    }
    balance.status = BalanceStatus::Ready;
    balance.pending_computation = Pubkey::default();
    transfer.pending_computation = Pubkey::default();
    Ok(())
}

pub fn debit_market_callback_handler(
    ctx: Context<DebitMarketCallback>,
    output: SignedComputationOutputs<DebitMarketOutput>,
) -> Result<()> {
    let DebitMarketOutput { field_0: result } = output
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
        transfer.status == MarginTransferStatus::Debiting && !transfer.to_market,
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
            .checked_add(transfer.amount)
            .ok_or(ErrorCode::EscrowOverflow)?;
        account.ciphertexts = result.field_0.ciphertexts;
        account.nonce = result.field_0.nonce.to_le_bytes();
        account.recovery_ciphertexts = result.field_1.ciphertexts;
        account.recovery_nonce = result.field_1.nonce.to_le_bytes();
        account.commitment = result.field_2;
        account.version = account
            .version
            .checked_add(1)
            .ok_or(ErrorCode::RevisionOverflow)?;
        transfer.status = MarginTransferStatus::Escrow;
    } else {
        transfer.status = MarginTransferStatus::Rejected;
    }
    account.status = MarketAccountStatus::Ready;
    account.pending_computation = Pubkey::default();
    transfer.pending_computation = Pubkey::default();
    Ok(())
}

pub fn cancel_free_debit_handler(ctx: Context<CancelFreeDebit>) -> Result<()> {
    require!(
        ctx.accounts.balance.status == BalanceStatus::Moving,
        ErrorCode::WrongBalanceStatus
    );
    require!(
        ctx.accounts.transfer.status == MarginTransferStatus::Debiting
            && ctx.accounts.transfer.to_market,
        ErrorCode::WrongMarginTransferStatus
    );
    require_keys_eq!(
        ctx.accounts.balance.pending_computation,
        ctx.accounts.transfer.pending_computation,
        ErrorCode::WrongPendingComputation
    );
    ctx.accounts.balance.status = BalanceStatus::Ready;
    ctx.accounts.balance.pending_computation = Pubkey::default();
    ctx.accounts.transfer.status = MarginTransferStatus::Rejected;
    ctx.accounts.transfer.pending_computation = Pubkey::default();
    Ok(())
}

pub fn cancel_market_debit_handler(ctx: Context<CancelMarketDebit>) -> Result<()> {
    require!(
        ctx.accounts.market_account.status == MarketAccountStatus::Moving,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(
        ctx.accounts.transfer.status == MarginTransferStatus::Debiting
            && !ctx.accounts.transfer.to_market,
        ErrorCode::WrongMarginTransferStatus
    );
    require_keys_eq!(
        ctx.accounts.transfer.market,
        ctx.accounts.market_account.market,
        ErrorCode::WrongMarket
    );
    require_keys_eq!(
        ctx.accounts.market_account.pending_computation,
        ctx.accounts.transfer.pending_computation,
        ErrorCode::WrongPendingComputation
    );
    ctx.accounts.market_account.status = MarketAccountStatus::Ready;
    ctx.accounts.market_account.pending_computation = Pubkey::default();
    ctx.accounts.transfer.status = MarginTransferStatus::Rejected;
    ctx.accounts.transfer.pending_computation = Pubkey::default();
    Ok(())
}
