use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{COMP_DEF_OFFSET_LIQUIDATE, SOL_USD_FEED_ID},
    error::ErrorCode,
    state::{
        BackstopOffer, BackstopStatus, ClearingAccount, ClearingStatus, Market, MarketAccount,
        MarketAccountStatus, MarketStatus, OrderKind, OrderRecord, OrderStatus, Protocol,
    },
    ArciumSignerAccount, ID, ID_CONST,
};

#[init_computation_definition_accounts("liquidate", payer)]
#[derive(Accounts)]
pub struct InitLiquidateCompDef<'info> {
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

#[queue_computation_accounts("liquidate", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, target_owner: Pubkey, nonce: u64)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), target_owner.as_ref()], bump = target_account.bump)]
    pub target_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), backstop_account.owner.as_ref()], bump = backstop_account.bump)]
    pub backstop_account: Box<Account<'info, MarketAccount>>,
    #[account(mut)]
    /// CHECK: The handler validates and deserializes the market's backstop offer.
    pub offer: UncheckedAccount<'info>,
    #[account(init, payer = payer, space = 8 + OrderRecord::INIT_SPACE, seeds = [b"order", market.key().as_ref(), target_owner.as_ref(), nonce.to_le_bytes().as_ref()], bump)]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_LIQUIDATE))]
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

#[callback_accounts("liquidate")]
#[derive(Accounts)]
pub struct LiquidateCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_LIQUIDATE))]
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
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.trader.as_ref()], bump = target_account.bump)]
    pub target_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.maker.as_ref()], bump = backstop_account.bump)]
    pub backstop_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, address = order.selected_quote)]
    pub offer: Box<Account<'info, BackstopOffer>>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
}

#[derive(Accounts)]
pub struct CancelLiquidation<'info> {
    pub actor: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.trader.as_ref()], bump = target_account.bump)]
    pub target_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.maker.as_ref()], bump = backstop_account.bump)]
    pub backstop_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, address = order.selected_quote)]
    pub offer: Box<Account<'info, BackstopOffer>>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
}

pub fn init_liquidate_comp_def_handler(ctx: Context<InitLiquidateCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

fn read_offer(source: &UncheckedAccount<'_>) -> Result<BackstopOffer> {
    require_keys_eq!(*source.owner, ID, ErrorCode::WrongBackstopStatus);
    let data = source.try_borrow_data()?;
    BackstopOffer::try_deserialize(&mut &data[..])
}

fn write_offer(source: &UncheckedAccount<'_>, offer: &BackstopOffer) -> Result<()> {
    let mut data = source.try_borrow_mut_data()?;
    offer.try_serialize(&mut &mut data[..])
}

pub fn liquidate_handler(
    ctx: Context<Liquidate>,
    computation_offset: u64,
    target_owner: Pubkey,
    nonce: u64,
    deadline: i64,
) -> Result<()> {
    let market = &ctx.accounts.market;
    let clock = Clock::get()?;
    require!(
        market.oracle_timestamp > 0
            && clock.unix_timestamp >= market.oracle_timestamp
            && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
                <= i64::from(market.config.max_oracle_age_seconds),
        ErrorCode::StaleOracle
    );
    require!(
        market.status == MarketStatus::Active || market.status == MarketStatus::Paused,
        ErrorCode::MarketNotActive
    );
    require!(market.pending_orders == 0, ErrorCode::WrongOrderStatus);
    require!(
        deadline > clock.unix_timestamp
            && deadline.saturating_sub(clock.unix_timestamp)
                <= i64::from(market.config.max_order_queue_seconds),
        ErrorCode::InvalidOrder
    );
    let target = &ctx.accounts.target_account;
    let backstop = &ctx.accounts.backstop_account;
    let clearing = &ctx.accounts.clearing;
    require_keys_eq!(
        ctx.accounts.offer.key(),
        market.backstop_offer,
        ErrorCode::InvalidBackstop
    );
    let mut offer = read_offer(&ctx.accounts.offer)?;
    require!(
        target.status == MarketAccountStatus::Ready
            && backstop.status == MarketAccountStatus::Ready
            && clearing.status == ClearingStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    require!(
        target.version < u64::MAX && backstop.version < u64::MAX && clearing.version < u64::MAX,
        ErrorCode::RevisionOverflow
    );
    require!(
        target.last_liquidation_timestamp < market.oracle_timestamp,
        ErrorCode::InvalidOrder
    );
    require!(
        target.owner == target_owner
            && target.owner != backstop.owner
            && target.market == market.key()
            && backstop.market == market.key()
            && clearing.market == market.key(),
        ErrorCode::WrongMarket
    );
    require!(
        offer.status == BackstopStatus::Active
            && offer.market == market.key()
            && offer.maker == backstop.owner
            && offer.expiry > deadline,
        ErrorCode::InvalidBackstop
    );
    let computation = ctx.accounts.computation_account.key();
    let order = &mut ctx.accounts.order;
    order.trader = target_owner;
    order.maker = backstop.owner;
    order.market = market.key();
    order.nonce = nonce;
    order.deadline = deadline;
    order.selected_quote = ctx.accounts.offer.key();
    order.market_revision = market.revision;
    order.oracle_timestamp = market.oracle_timestamp;
    order.oracle_price_e8 = market.oracle_price_e8;
    order.funding_index = market.funding_index;
    order.trader_version = target.version;
    order.maker_version = backstop.version;
    order.clearing_version = clearing.version;
    order.pending_computation = computation;
    order.kind = OrderKind::Liquidation;
    order.status = OrderStatus::Settling;
    order.bump = ctx.bumps.order;
    let offer_margin = offer.margin;
    let offer_capacity = offer.capacity;
    let oracle_price = market.oracle_price_e8;
    let funding_index = market.funding_index;
    let config = market.config;
    ctx.accounts.target_account.status = MarketAccountStatus::Trading;
    ctx.accounts.target_account.pending_computation = computation;
    ctx.accounts.target_account.last_liquidation_timestamp = market.oracle_timestamp;
    ctx.accounts.backstop_account.status = MarketAccountStatus::Trading;
    ctx.accounts.backstop_account.pending_computation = computation;
    ctx.accounts.clearing.status = ClearingStatus::Trading;
    ctx.accounts.clearing.pending_computation = computation;
    offer.status = BackstopStatus::Locked;
    offer.pending_computation = computation;
    write_offer(&ctx.accounts.offer, &offer)?;
    ctx.accounts.market.pending_orders = 1;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    let mut args = ArgBuilder::new();
    for account in [&ctx.accounts.target_account, &ctx.accounts.backstop_account] {
        args = args.plaintext_u128(u128::from_le_bytes(account.nonce));
        for field in account.ciphertexts {
            args = args.encrypted_u64(field);
        }
    }
    args = args.plaintext_u128(u128::from_le_bytes(ctx.accounts.clearing.nonce));
    for field in ctx.accounts.clearing.ciphertexts {
        args = args.encrypted_u64(field);
    }
    let args = args
        .plaintext_u64(offer_margin)
        .plaintext_u64(offer_capacity)
        .plaintext_u64(oracle_price)
        .plaintext_i128(funding_index)
        .plaintext_u16(config.maintenance_margin_bps)
        .plaintext_u16(config.initial_margin_bps)
        .plaintext_u16(config.liquidation_fee_bps)
        .plaintext_u64(config.max_account_notional)
        .build();
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![LiquidateCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: Pubkey::find_program_address(&[b"protocol"], &ID).0,
                    is_writable: true,
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
                    pubkey: ctx.accounts.target_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.backstop_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.offer.key(),
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

pub fn liquidate_callback_handler(
    ctx: Context<LiquidateCallback>,
    output: SignedComputationOutputs<LiquidateOutput>,
) -> Result<()> {
    let LiquidateOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let order = &mut ctx.accounts.order;
    let target = &mut ctx.accounts.target_account;
    let backstop = &mut ctx.accounts.backstop_account;
    let clearing = &mut ctx.accounts.clearing;
    let offer = &mut ctx.accounts.offer;
    let market = &mut ctx.accounts.market;
    let computation = ctx.accounts.computation_account.key();
    require!(
        order.kind == OrderKind::Liquidation
            && order.status == OrderStatus::Settling
            && market.pending_orders == 1,
        ErrorCode::WrongOrderStatus
    );
    require!(
        order.pending_computation == computation
            && target.pending_computation == computation
            && backstop.pending_computation == computation
            && clearing.pending_computation == computation
            && offer.pending_computation == computation,
        ErrorCode::WrongPendingComputation
    );
    require!(
        target.status == MarketAccountStatus::Trading
            && backstop.status == MarketAccountStatus::Trading
            && clearing.status == ClearingStatus::Trading
            && offer.status == BackstopStatus::Locked,
        ErrorCode::WrongMarketAccountStatus
    );
    let clock = Clock::get()?;
    let fresh = order.deadline > clock.unix_timestamp
        && market.oracle_timestamp == order.oracle_timestamp
        && market.oracle_price_e8 == order.oracle_price_e8
        && market.funding_index == order.funding_index
        && market.revision == order.market_revision
        && target.version == order.trader_version
        && backstop.version == order.maker_version
        && clearing.version == order.clearing_version
        && offer.expiry > clock.unix_timestamp
        && market.backstop_offer == offer.key();
    if result.field_4 && fresh {
        order.candidate_trader = result.field_0.ciphertexts;
        order.candidate_trader_nonce = result.field_0.nonce.to_le_bytes();
        order.candidate_maker = result.field_1.ciphertexts;
        order.candidate_maker_nonce = result.field_1.nonce.to_le_bytes();
        order.candidate_clearing = result.field_2.ciphertexts;
        order.candidate_clearing_nonce = result.field_2.nonce.to_le_bytes();
        order.status = OrderStatus::RiskApproved;
    } else {
        order.status = OrderStatus::Rejected;
        target.status = MarketAccountStatus::Ready;
        backstop.status = MarketAccountStatus::Ready;
        clearing.status = ClearingStatus::Ready;
        offer.status = BackstopStatus::Active;
        offer.pending_computation = Pubkey::default();
        market.pending_orders = 0;
        if result.field_3 && fresh {
            market.status = MarketStatus::Paused;
            ctx.accounts.protocol.trading_enabled = false;
        }
    }
    order.pending_computation = Pubkey::default();
    target.pending_computation = Pubkey::default();
    backstop.pending_computation = Pubkey::default();
    clearing.pending_computation = Pubkey::default();
    Ok(())
}

pub fn cancel_liquidation_handler(ctx: Context<CancelLiquidation>) -> Result<()> {
    let order = &mut ctx.accounts.order;
    require!(
        order.kind == OrderKind::Liquidation,
        ErrorCode::WrongOrderStatus
    );
    require!(
        order.status == OrderStatus::Rejected || Clock::get()?.unix_timestamp >= order.deadline,
        ErrorCode::OrderNotExpired
    );
    require!(
        order.status == OrderStatus::Rejected
            || order.status == OrderStatus::Settling
            || order.status == OrderStatus::RiskApproved
            || order.status == OrderStatus::SealingTrader
            || order.status == OrderStatus::TraderSealed
            || order.status == OrderStatus::SealingMaker
            || order.status == OrderStatus::MakerSealed
            || order.status == OrderStatus::SealingClearing,
        ErrorCode::WrongOrderStatus
    );
    require!(
        ctx.accounts.offer.status == BackstopStatus::Locked,
        ErrorCode::WrongBackstopStatus
    );
    require_keys_eq!(
        order.selected_quote,
        ctx.accounts.offer.key(),
        ErrorCode::WrongBackstopStatus
    );
    if order.status == OrderStatus::Rejected {
        require!(
            ctx.accounts.market.pending_orders == 0,
            ErrorCode::WrongOrderStatus
        );
        ctx.accounts.offer.status = BackstopStatus::Active;
        ctx.accounts.offer.pending_computation = Pubkey::default();
        ctx.accounts.market.status = MarketStatus::Paused;
        ctx.accounts.protocol.trading_enabled = false;
        return Ok(());
    }
    require!(
        ctx.accounts.market.pending_orders == 1,
        ErrorCode::WrongOrderStatus
    );
    let computation = order.pending_computation;
    require!(
        ctx.accounts.target_account.pending_computation == computation
            && ctx.accounts.backstop_account.pending_computation == computation
            && ctx.accounts.clearing.pending_computation == computation,
        ErrorCode::WrongPendingComputation
    );
    order.status = OrderStatus::Cancelled;
    order.pending_computation = Pubkey::default();
    ctx.accounts.target_account.status = MarketAccountStatus::Ready;
    ctx.accounts.target_account.pending_computation = Pubkey::default();
    ctx.accounts.backstop_account.status = MarketAccountStatus::Ready;
    ctx.accounts.backstop_account.pending_computation = Pubkey::default();
    ctx.accounts.clearing.status = ClearingStatus::Ready;
    ctx.accounts.clearing.pending_computation = Pubkey::default();
    ctx.accounts.offer.status = BackstopStatus::Active;
    ctx.accounts.offer.pending_computation = Pubkey::default();
    ctx.accounts.market.pending_orders = 0;
    ctx.accounts.market.status = MarketStatus::Paused;
    ctx.accounts.protocol.trading_enabled = false;
    Ok(())
}
