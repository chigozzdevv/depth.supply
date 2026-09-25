use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{
        COMP_DEF_OFFSET_CLAIM_TRADE_FEES, COMP_DEF_OFFSET_SEAL_TRADE_FEES, SOL_USD_FEED_ID,
    },
    error::ErrorCode,
    state::{
        BalanceAccount, BalanceStatus, ClearingAccount, ClearingStatus, FeeClaimStage, Market,
        OrderKind, OrderRecord, OrderStatus, Protocol,
    },
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("claim_trade_fees", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ClaimTradeFees<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(
        mut,
        seeds = [b"balance", protocol_balance.owner.as_ref()],
        bump = protocol_balance.bump,
    )]
    pub protocol_balance: Box<Account<'info, BalanceAccount>>,
    #[account(
        mut,
        seeds = [b"balance", order.app.as_ref()],
        bump = app_balance.bump,
        constraint = app_balance.owner == order.app @ ErrorCode::InvalidOrder,
    )]
    pub app_balance: Box<Account<'info, BalanceAccount>>,
    #[account(
        mut,
        seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()],
        bump = order.bump,
    )]
    pub order: Box<Account<'info, OrderRecord>>,
    #[account(init_if_needed, space = 9, payer = payer, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CLAIM_TRADE_FEES))]
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

#[callback_accounts("claim_trade_fees")]
#[derive(Accounts)]
pub struct ClaimTradeFeesCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CLAIM_TRADE_FEES))]
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
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(mut, seeds = [b"balance", protocol.authority.as_ref()], bump = protocol_balance.bump)]
    pub protocol_balance: Box<Account<'info, BalanceAccount>>,
    #[account(mut, seeds = [b"balance", order.app.as_ref()], bump = app_balance.bump)]
    pub app_balance: Box<Account<'info, BalanceAccount>>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
}

#[init_computation_definition_accounts("claim_trade_fees", payer)]
#[derive(Accounts)]
pub struct InitClaimTradeFeesCompDef<'info> {
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
    /// CHECK: The lookup table program is fixed.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("seal_trade_fees", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SealTradeFees<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(
        mut,
        seeds = [b"balance", protocol_balance.owner.as_ref()],
        bump = protocol_balance.bump,
    )]
    pub protocol_balance: Box<Account<'info, BalanceAccount>>,
    #[account(
        mut,
        seeds = [b"balance", order.app.as_ref()],
        bump = app_balance.bump,
        constraint = app_balance.owner == order.app @ ErrorCode::InvalidOrder,
    )]
    pub app_balance: Box<Account<'info, BalanceAccount>>,
    #[account(
        mut,
        seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()],
        bump = order.bump,
    )]
    pub order: Box<Account<'info, OrderRecord>>,
    #[account(init_if_needed, space = 9, payer = payer, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SEAL_TRADE_FEES))]
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

#[callback_accounts("seal_trade_fees")]
#[derive(Accounts)]
pub struct SealTradeFeesCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SEAL_TRADE_FEES))]
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
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(mut, seeds = [b"balance", protocol.authority.as_ref()], bump = protocol_balance.bump)]
    pub protocol_balance: Box<Account<'info, BalanceAccount>>,
    #[account(mut, seeds = [b"balance", order.app.as_ref()], bump = app_balance.bump)]
    pub app_balance: Box<Account<'info, BalanceAccount>>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
}

#[init_computation_definition_accounts("seal_trade_fees", payer)]
#[derive(Accounts)]
pub struct InitSealTradeFeesCompDef<'info> {
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
    /// CHECK: The lookup table program is fixed.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelFeeClaim<'info> {
    pub actor: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(
        mut,
        seeds = [b"balance", protocol.authority.as_ref()],
        bump = protocol_balance.bump,
        constraint = protocol_balance.owner == protocol.authority @ ErrorCode::InvalidOrder,
    )]
    pub protocol_balance: Box<Account<'info, BalanceAccount>>,
    #[account(mut, seeds = [b"balance", order.app.as_ref()], bump = app_balance.bump)]
    pub app_balance: Box<Account<'info, BalanceAccount>>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
}

pub fn init_claim_trade_fees_comp_def_handler(
    ctx: Context<InitClaimTradeFeesCompDef>,
) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn init_seal_trade_fees_comp_def_handler(ctx: Context<InitSealTradeFeesCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn claim_trade_fees_handler<'info>(
    ctx: Context<'info, ClaimTradeFees<'info>>,
    computation_offset: u64,
) -> Result<()> {
    require!(ctx.remaining_accounts.len() == 1, ErrorCode::InvalidOrder);
    require_keys_eq!(
        ctx.remaining_accounts[0].key(),
        Pubkey::find_program_address(&[b"protocol"], &ID).0,
        ErrorCode::InvalidOrder
    );
    let protocol = Account::<Protocol>::try_from(&ctx.remaining_accounts[0])?;
    let order = &ctx.accounts.order;
    let clearing = &ctx.accounts.clearing;
    let protocol_balance = &ctx.accounts.protocol_balance;
    let app_balance = &ctx.accounts.app_balance;
    require!(
        order.kind == OrderKind::Trade
            && order.status == OrderStatus::Filled
            && !order.fees_claimed
            && order.claim_stage == FeeClaimStage::Idle
            && order.pending_computation == Pubkey::default()
            && order.market == ctx.accounts.market.key()
            && ctx.accounts.market.pending_orders == 0,
        ErrorCode::WrongOrderStatus
    );
    require!(
        order.app != protocol.authority && protocol_balance.owner == protocol.authority,
        ErrorCode::InvalidOrder
    );
    require!(
        clearing.status == ClearingStatus::Ready,
        ErrorCode::WrongClearingStatus
    );
    require!(
        protocol_balance.status == BalanceStatus::Ready
            && app_balance.status == BalanceStatus::Ready,
        ErrorCode::WrongBalanceStatus
    );
    require!(
        clearing.version < u64::MAX
            && protocol_balance.version < u64::MAX
            && app_balance.version < u64::MAX,
        ErrorCode::RevisionOverflow
    );
    let mut args = ArgBuilder::new().plaintext_u128(u128::from_le_bytes(order.plan_nonce));
    for field in order.plan_ciphertexts {
        args = args.encrypted_u64(field);
    }
    args = args.plaintext_u128(u128::from_le_bytes(clearing.nonce));
    for field in clearing.ciphertexts {
        args = args.encrypted_u64(field);
    }
    for balance in [protocol_balance, app_balance] {
        args = args
            .plaintext_u128(u128::from_le_bytes(balance.nonce))
            .encrypted_u64(balance.ciphertexts[0])
            .encrypted_u128(balance.ciphertexts[1]);
    }
    let args = args.build();
    let computation = ctx.accounts.computation_account.key();
    ctx.accounts.order.pending_computation = computation;
    ctx.accounts.order.claim_stage = FeeClaimStage::Computing;
    ctx.accounts.order.claim_deadline = Clock::get()?.unix_timestamp.saturating_add(120);
    ctx.accounts.market.pending_orders = 1;
    ctx.accounts.clearing.status = ClearingStatus::Claiming;
    ctx.accounts.clearing.pending_computation = computation;
    ctx.accounts.protocol_balance.status = BalanceStatus::Claiming;
    ctx.accounts.protocol_balance.pending_computation = computation;
    ctx.accounts.app_balance.status = BalanceStatus::Claiming;
    ctx.accounts.app_balance.pending_computation = computation;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![ClaimTradeFeesCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.remaining_accounts[0].key(),
                    is_writable: false,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.market.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.clearing.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.protocol_balance.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.app_balance.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.order.key(),
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

pub fn claim_trade_fees_callback_handler(
    ctx: Context<ClaimTradeFeesCallback>,
    output: SignedComputationOutputs<ClaimTradeFeesOutput>,
) -> Result<()> {
    let ClaimTradeFeesOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let computation = ctx.accounts.computation_account.key();
    let order = &mut ctx.accounts.order;
    let clearing = &mut ctx.accounts.clearing;
    let protocol_balance = &mut ctx.accounts.protocol_balance;
    let app_balance = &mut ctx.accounts.app_balance;
    require!(
        order.status == OrderStatus::Filled
            && !order.fees_claimed
            && order.pending_computation == computation,
        ErrorCode::WrongOrderStatus
    );
    require!(
        ctx.accounts.market.pending_orders == 1
            && clearing.status == ClearingStatus::Claiming
            && clearing.pending_computation == computation,
        ErrorCode::WrongClearingStatus
    );
    require!(
        protocol_balance.status == BalanceStatus::Claiming
            && app_balance.status == BalanceStatus::Claiming
            && protocol_balance.pending_computation == computation
            && app_balance.pending_computation == computation,
        ErrorCode::WrongBalanceStatus
    );
    require_keys_eq!(order.app, app_balance.owner, ErrorCode::InvalidOrder);
    require_keys_eq!(
        ctx.accounts.protocol.authority,
        protocol_balance.owner,
        ErrorCode::InvalidOrder
    );
    require!(order.app != protocol_balance.owner, ErrorCode::InvalidOrder);
    require!(
        order.claim_stage == FeeClaimStage::Computing,
        ErrorCode::WrongOrderStatus
    );
    order.pending_computation = Pubkey::default();
    clearing.pending_computation = Pubkey::default();
    protocol_balance.pending_computation = Pubkey::default();
    app_balance.pending_computation = Pubkey::default();
    if result.field_3 {
        order.candidate_clearing = result.field_0.ciphertexts;
        order.candidate_clearing_nonce = result.field_0.nonce.to_le_bytes();
        order.candidate_primary = [
            result.field_1.ciphertexts[0],
            result.field_1.ciphertexts[1],
            [0; 32],
        ];
        order.candidate_primary_nonce = result.field_1.nonce.to_le_bytes();
        order.candidate_secondary = [
            result.field_2.ciphertexts[0],
            result.field_2.ciphertexts[1],
            [0; 32],
        ];
        order.candidate_secondary_nonce = result.field_2.nonce.to_le_bytes();
        order.claim_stage = FeeClaimStage::Ready;
        order.claim_deadline = Clock::get()?.unix_timestamp.saturating_add(120);
    } else {
        order.claim_stage = FeeClaimStage::Idle;
        order.claim_deadline = 0;
        clearing.status = ClearingStatus::Ready;
        protocol_balance.status = BalanceStatus::Ready;
        app_balance.status = BalanceStatus::Ready;
        ctx.accounts.market.pending_orders = 0;
    }
    Ok(())
}

pub fn seal_trade_fees_handler<'info>(
    ctx: Context<'info, SealTradeFees<'info>>,
    computation_offset: u64,
) -> Result<()> {
    require!(ctx.remaining_accounts.len() == 1, ErrorCode::InvalidOrder);
    require_keys_eq!(
        ctx.remaining_accounts[0].key(),
        Pubkey::find_program_address(&[b"protocol"], &ID).0,
        ErrorCode::InvalidOrder
    );
    let protocol = Account::<Protocol>::try_from(&ctx.remaining_accounts[0])?;
    let order = &ctx.accounts.order;
    let clearing = &ctx.accounts.clearing;
    let protocol_balance = &ctx.accounts.protocol_balance;
    let app_balance = &ctx.accounts.app_balance;
    require!(
        order.kind == OrderKind::Trade
            && order.status == OrderStatus::Filled
            && !order.fees_claimed
            && order.claim_stage == FeeClaimStage::Ready
            && order.pending_computation == Pubkey::default()
            && order.market == ctx.accounts.market.key()
            && ctx.accounts.market.pending_orders == 1,
        ErrorCode::WrongOrderStatus
    );
    require!(
        order.app != protocol.authority
            && protocol_balance.owner == protocol.authority
            && app_balance.owner == order.app,
        ErrorCode::InvalidOrder
    );
    require!(
        clearing.status == ClearingStatus::Claiming
            && clearing.pending_computation == Pubkey::default(),
        ErrorCode::WrongClearingStatus
    );
    require!(
        protocol_balance.status == BalanceStatus::Claiming
            && app_balance.status == BalanceStatus::Claiming
            && protocol_balance.pending_computation == Pubkey::default()
            && app_balance.pending_computation == Pubkey::default(),
        ErrorCode::WrongBalanceStatus
    );
    require!(
        clearing.version < u64::MAX
            && protocol_balance.version < u64::MAX
            && app_balance.version < u64::MAX,
        ErrorCode::RevisionOverflow
    );
    let mut args =
        ArgBuilder::new().plaintext_u128(u128::from_le_bytes(order.candidate_clearing_nonce));
    for field in order.candidate_clearing {
        args = args.encrypted_u64(field);
    }
    args = args.plaintext_u128(u128::from_le_bytes(order.candidate_primary_nonce));
    args = args
        .encrypted_u64(order.candidate_primary[0])
        .encrypted_u128(order.candidate_primary[1])
        .plaintext_u128(u128::from_le_bytes(order.candidate_secondary_nonce))
        .encrypted_u64(order.candidate_secondary[0])
        .encrypted_u128(order.candidate_secondary[1]);
    for byte in ctx.accounts.market.key().to_bytes() {
        args = args.plaintext_u8(byte);
    }
    args = args
        .plaintext_u64(clearing.version)
        .x25519_pubkey(clearing.recovery_key);
    for balance in [protocol_balance, app_balance] {
        for byte in balance.owner.to_bytes() {
            args = args.plaintext_u8(byte);
        }
        args = args
            .plaintext_u64(balance.version)
            .x25519_pubkey(balance.recovery_key);
    }
    let computation = ctx.accounts.computation_account.key();
    ctx.accounts.order.claim_stage = FeeClaimStage::Sealing;
    ctx.accounts.order.pending_computation = computation;
    ctx.accounts.order.claim_deadline = Clock::get()?.unix_timestamp.saturating_add(120);
    ctx.accounts.clearing.pending_computation = computation;
    ctx.accounts.protocol_balance.pending_computation = computation;
    ctx.accounts.app_balance.pending_computation = computation;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    queue_computation(
        ctx.accounts,
        computation_offset,
        args.build(),
        vec![SealTradeFeesCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.remaining_accounts[0].key(),
                    is_writable: false,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.market.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.clearing.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.protocol_balance.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.app_balance.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.order.key(),
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

pub fn seal_trade_fees_callback_handler(
    ctx: Context<SealTradeFeesCallback>,
    output: SignedComputationOutputs<SealTradeFeesOutput>,
) -> Result<()> {
    let SealTradeFeesOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let computation = ctx.accounts.computation_account.key();
    let order = &mut ctx.accounts.order;
    let clearing = &mut ctx.accounts.clearing;
    let protocol_balance = &mut ctx.accounts.protocol_balance;
    let app_balance = &mut ctx.accounts.app_balance;
    require!(
        order.kind == OrderKind::Trade
            && order.status == OrderStatus::Filled
            && !order.fees_claimed
            && order.claim_stage == FeeClaimStage::Sealing
            && order.pending_computation == computation
            && ctx.accounts.market.pending_orders == 1,
        ErrorCode::WrongOrderStatus
    );
    require!(
        clearing.status == ClearingStatus::Claiming && clearing.pending_computation == computation,
        ErrorCode::WrongClearingStatus
    );
    require!(
        protocol_balance.status == BalanceStatus::Claiming
            && app_balance.status == BalanceStatus::Claiming
            && protocol_balance.pending_computation == computation
            && app_balance.pending_computation == computation,
        ErrorCode::WrongBalanceStatus
    );
    require_keys_eq!(
        ctx.accounts.protocol.authority,
        protocol_balance.owner,
        ErrorCode::InvalidOrder
    );
    require_keys_eq!(order.app, app_balance.owner, ErrorCode::InvalidOrder);
    require!(order.app != protocol_balance.owner, ErrorCode::InvalidOrder);
    require!(
        result.field_0.encryption_key == clearing.recovery_key
            && result.field_2.encryption_key == protocol_balance.recovery_key
            && result.field_4.encryption_key == app_balance.recovery_key,
        ErrorCode::WrongRecoveryKey
    );
    clearing.ciphertexts = order.candidate_clearing;
    clearing.nonce = order.candidate_clearing_nonce;
    clearing.recovery_ciphertexts = result.field_0.ciphertexts;
    clearing.recovery_nonce = result.field_0.nonce.to_le_bytes();
    clearing.commitment = result.field_1;
    clearing.version = clearing
        .version
        .checked_add(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    protocol_balance.ciphertexts = [order.candidate_primary[0], order.candidate_primary[1]];
    protocol_balance.nonce = order.candidate_primary_nonce;
    protocol_balance.recovery_ciphertexts = result.field_2.ciphertexts;
    protocol_balance.recovery_nonce = result.field_2.nonce.to_le_bytes();
    protocol_balance.commitment = result.field_3;
    protocol_balance.version = protocol_balance
        .version
        .checked_add(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    app_balance.ciphertexts = [order.candidate_secondary[0], order.candidate_secondary[1]];
    app_balance.nonce = order.candidate_secondary_nonce;
    app_balance.recovery_ciphertexts = result.field_4.ciphertexts;
    app_balance.recovery_nonce = result.field_4.nonce.to_le_bytes();
    app_balance.commitment = result.field_5;
    app_balance.version = app_balance
        .version
        .checked_add(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    order.fees_claimed = true;
    order.claim_stage = FeeClaimStage::Idle;
    order.pending_computation = Pubkey::default();
    order.claim_deadline = 0;
    clearing.pending_computation = Pubkey::default();
    clearing.status = ClearingStatus::Ready;
    protocol_balance.pending_computation = Pubkey::default();
    protocol_balance.status = BalanceStatus::Ready;
    app_balance.pending_computation = Pubkey::default();
    app_balance.status = BalanceStatus::Ready;
    ctx.accounts.market.pending_orders = 0;
    Ok(())
}

pub fn cancel_fee_claim_handler(ctx: Context<CancelFeeClaim>) -> Result<()> {
    let order = &mut ctx.accounts.order;
    let computation = order.pending_computation;
    require!(
        order.kind == OrderKind::Trade
            && order.status == OrderStatus::Filled
            && order.market == ctx.accounts.market.key()
            && order.app == ctx.accounts.app_balance.owner
            && order.claim_stage != FeeClaimStage::Idle
            && !order.fees_claimed
            && Clock::get()?.unix_timestamp >= order.claim_deadline,
        ErrorCode::WrongOrderStatus
    );
    require!(
        ctx.accounts.market.pending_orders == 1
            && ctx.accounts.clearing.status == ClearingStatus::Claiming
            && ctx.accounts.clearing.pending_computation == computation,
        ErrorCode::WrongClearingStatus
    );
    require!(
        ctx.accounts.protocol_balance.status == BalanceStatus::Claiming
            && ctx.accounts.app_balance.status == BalanceStatus::Claiming
            && ctx.accounts.protocol_balance.pending_computation == computation
            && ctx.accounts.app_balance.pending_computation == computation,
        ErrorCode::WrongBalanceStatus
    );
    order.pending_computation = Pubkey::default();
    order.claim_deadline = 0;
    order.claim_stage = FeeClaimStage::Idle;
    ctx.accounts.clearing.pending_computation = Pubkey::default();
    ctx.accounts.clearing.status = ClearingStatus::Ready;
    ctx.accounts.protocol_balance.pending_computation = Pubkey::default();
    ctx.accounts.protocol_balance.status = BalanceStatus::Ready;
    ctx.accounts.app_balance.pending_computation = Pubkey::default();
    ctx.accounts.app_balance.status = BalanceStatus::Ready;
    ctx.accounts.market.pending_orders = 0;
    Ok(())
}
