use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{COMP_DEF_OFFSET_SEAL_CLEARING, COMP_DEF_OFFSET_SEAL_MARKET, SOL_USD_FEED_ID},
    error::ErrorCode,
    state::{
        BackstopOffer, BackstopStatus, ClearingAccount, ClearingStatus, Market, MarketAccount,
        MarketAccountStatus, MarketStatus, OrderKind, OrderRecord, OrderStatus, Protocol,
        QuoteRecord, QuoteStatus,
    },
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("seal_market", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SealMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.trader.as_ref()], bump = trader_account.bump)]
    pub trader_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.maker.as_ref()], bump = maker_account.bump)]
    pub maker_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SEAL_MARKET))]
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

#[callback_accounts("seal_market")]
#[derive(Accounts)]
pub struct SealMarketCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SEAL_MARKET))]
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
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.trader.as_ref()], bump = trader_account.bump)]
    pub trader_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.maker.as_ref()], bump = maker_account.bump)]
    pub maker_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
}

#[init_computation_definition_accounts("seal_market", payer)]
#[derive(Accounts)]
pub struct InitSealMarketCompDef<'info> {
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

#[queue_computation_accounts("seal_clearing", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct SealClearing<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(mut, seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.trader.as_ref()], bump = trader_account.bump)]
    pub trader_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.maker.as_ref()], bump = maker_account.bump)]
    pub maker_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SEAL_CLEARING))]
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

#[callback_accounts("seal_clearing")]
#[derive(Accounts)]
pub struct SealClearingCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_SEAL_CLEARING))]
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
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.trader.as_ref()], bump = trader_account.bump)]
    pub trader_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"market-account", market.key().as_ref(), order.maker.as_ref()], bump = maker_account.bump)]
    pub maker_account: Box<Account<'info, MarketAccount>>,
    #[account(mut)]
    /// CHECK: The callback validates the selected quote or backstop account.
    pub source: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"order", market.key().as_ref(), order.trader.as_ref(), order.nonce.to_le_bytes().as_ref()], bump = order.bump)]
    pub order: Box<Account<'info, OrderRecord>>,
}

#[init_computation_definition_accounts("seal_clearing", payer)]
#[derive(Accounts)]
pub struct InitSealClearingCompDef<'info> {
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

pub fn init_seal_market_comp_def_handler(ctx: Context<InitSealMarketCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn init_seal_clearing_comp_def_handler(ctx: Context<InitSealClearingCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

fn eligible(
    market: &Market,
    clearing: &ClearingAccount,
    trader: &MarketAccount,
    maker: &MarketAccount,
    order: &OrderRecord,
    market_key: Pubkey,
    clock: &Clock,
) -> bool {
    (market.status == MarketStatus::Active
        || (order.kind == OrderKind::Liquidation && market.status == MarketStatus::Paused))
        && market.pending_orders == 1
        && clearing.status == ClearingStatus::Trading
        && trader.status == MarketAccountStatus::Trading
        && maker.status == MarketAccountStatus::Trading
        && clearing.market == market_key
        && trader.market == market_key
        && maker.market == market_key
        && order.trader == trader.owner
        && order.maker == maker.owner
        && order.market == market_key
        && order.deadline > clock.unix_timestamp
        && order.market_revision == market.revision
        && order.oracle_timestamp == market.oracle_timestamp
        && order.oracle_price_e8 == market.oracle_price_e8
        && order.funding_index == market.funding_index
        && order.trader_version == trader.version
        && order.maker_version == maker.version
        && order.clearing_version == clearing.version
        && trader.version < u64::MAX
        && maker.version < u64::MAX
        && clearing.version < u64::MAX
        && clock.unix_timestamp >= market.oracle_timestamp
        && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
            <= i64::from(market.config.max_oracle_age_seconds)
        && (match order.kind {
            OrderKind::Trade => market.active_quotes[..usize::from(market.active_quote_count)]
                .contains(&order.selected_quote),
            OrderKind::Liquidation => market.backstop_offer == order.selected_quote,
        })
}

fn reset_locks(
    order: &mut OrderRecord,
    trader: &mut MarketAccount,
    maker: &mut MarketAccount,
    clearing: &mut ClearingAccount,
) {
    order.pending_computation = Pubkey::default();
    trader.pending_computation = Pubkey::default();
    maker.pending_computation = Pubkey::default();
    clearing.pending_computation = Pubkey::default();
}

pub fn seal_market_handler(ctx: Context<SealMarket>, computation_offset: u64) -> Result<()> {
    let market = &ctx.accounts.market;
    let order = &ctx.accounts.order;
    let trader = &ctx.accounts.trader_account;
    let maker = &ctx.accounts.maker_account;
    let clearing = &ctx.accounts.clearing;
    require!(
        order.status == OrderStatus::RiskApproved || order.status == OrderStatus::TraderSealed,
        ErrorCode::WrongOrderStatus
    );
    require!(
        eligible(
            market,
            clearing,
            trader,
            maker,
            order,
            market.key(),
            &Clock::get()?
        ),
        ErrorCode::StaleOracle
    );
    require!(
        order.pending_computation == Pubkey::default()
            && trader.pending_computation == Pubkey::default()
            && maker.pending_computation == Pubkey::default()
            && clearing.pending_computation == Pubkey::default(),
        ErrorCode::WrongPendingComputation
    );
    let is_trader = order.status == OrderStatus::RiskApproved;
    let (candidate, nonce, account) = if is_trader {
        (order.candidate_trader, order.candidate_trader_nonce, trader)
    } else {
        (order.candidate_maker, order.candidate_maker_nonce, maker)
    };
    let mut args = ArgBuilder::new().plaintext_u128(u128::from_le_bytes(nonce));
    for field in candidate {
        args = args.encrypted_u64(field);
    }
    for byte in account.key().to_bytes() {
        args = args.plaintext_u8(byte);
    }
    let args = args
        .plaintext_u64(account.version)
        .x25519_pubkey(account.recovery_key)
        .build();
    ctx.accounts.order.status = if is_trader {
        OrderStatus::SealingTrader
    } else {
        OrderStatus::SealingMaker
    };
    let computation = ctx.accounts.computation_account.key();
    ctx.accounts.order.pending_computation = computation;
    ctx.accounts.trader_account.pending_computation = computation;
    ctx.accounts.maker_account.pending_computation = computation;
    ctx.accounts.clearing.pending_computation = computation;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![SealMarketCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.market.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.clearing.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.trader_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.maker_account.key(),
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

pub fn seal_market_callback_handler(
    ctx: Context<SealMarketCallback>,
    output: SignedComputationOutputs<SealMarketOutput>,
) -> Result<()> {
    let SealMarketOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let order = &mut ctx.accounts.order;
    let trader = &mut ctx.accounts.trader_account;
    let maker = &mut ctx.accounts.maker_account;
    let clearing = &mut ctx.accounts.clearing;
    let market = &mut ctx.accounts.market;
    let is_trader = order.status == OrderStatus::SealingTrader;
    require!(
        is_trader || order.status == OrderStatus::SealingMaker,
        ErrorCode::WrongOrderStatus
    );
    let computation = ctx.accounts.computation_account.key();
    require!(
        order.pending_computation == computation
            && trader.pending_computation == computation
            && maker.pending_computation == computation
            && clearing.pending_computation == computation,
        ErrorCode::WrongPendingComputation
    );
    if eligible(
        market,
        clearing,
        trader,
        maker,
        order,
        market.key(),
        &Clock::get()?,
    ) {
        let key = if is_trader {
            trader.recovery_key
        } else {
            maker.recovery_key
        };
        require!(
            result.field_1.encryption_key == key,
            ErrorCode::WrongRecoveryKey
        );
        if is_trader {
            order.sealed_trader = result.field_0.ciphertexts;
            order.sealed_trader_nonce = result.field_0.nonce.to_le_bytes();
            order.trader_recovery = result.field_1.ciphertexts;
            order.trader_recovery_nonce = result.field_1.nonce.to_le_bytes();
            order.trader_commitment = result.field_2;
            order.status = OrderStatus::TraderSealed;
        } else {
            order.sealed_maker = result.field_0.ciphertexts;
            order.sealed_maker_nonce = result.field_0.nonce.to_le_bytes();
            order.maker_recovery = result.field_1.ciphertexts;
            order.maker_recovery_nonce = result.field_1.nonce.to_le_bytes();
            order.maker_commitment = result.field_2;
            order.status = OrderStatus::MakerSealed;
        }
    } else {
        order.status = OrderStatus::Rejected;
        trader.status = MarketAccountStatus::Ready;
        maker.status = MarketAccountStatus::Ready;
        clearing.status = ClearingStatus::Ready;
        market.pending_orders = 0;
    }
    reset_locks(order, trader, maker, clearing);
    Ok(())
}

pub fn seal_clearing_handler<'info>(
    ctx: Context<'info, SealClearing<'info>>,
    computation_offset: u64,
) -> Result<()> {
    require!(
        ctx.remaining_accounts.len() == 1,
        ErrorCode::WrongQuoteSnapshot
    );
    let market = &ctx.accounts.market;
    let order = &ctx.accounts.order;
    let trader = &ctx.accounts.trader_account;
    let maker = &ctx.accounts.maker_account;
    let clearing = &ctx.accounts.clearing;
    require!(
        order.status == OrderStatus::MakerSealed,
        ErrorCode::WrongOrderStatus
    );
    require_keys_eq!(
        ctx.remaining_accounts[0].key(),
        order.selected_quote,
        ErrorCode::WrongQuoteSnapshot
    );
    let source_valid = match order.kind {
        OrderKind::Trade => {
            let quote = Account::<QuoteRecord>::try_from(&ctx.remaining_accounts[0])?;
            quote.market == market.key()
                && quote.status == QuoteStatus::Active
                && quote.expiry > Clock::get()?.unix_timestamp
                && quote.maker == maker.owner
        }
        OrderKind::Liquidation => {
            let offer = Account::<BackstopOffer>::try_from(&ctx.remaining_accounts[0])?;
            offer.market == market.key()
                && offer.status == BackstopStatus::Locked
                && offer.expiry > Clock::get()?.unix_timestamp
                && offer.maker == maker.owner
        }
    };
    require!(
        source_valid
            && eligible(
                market,
                clearing,
                trader,
                maker,
                order,
                market.key(),
                &Clock::get()?
            ),
        ErrorCode::StaleOracle
    );
    require!(
        order.pending_computation == Pubkey::default()
            && trader.pending_computation == Pubkey::default()
            && maker.pending_computation == Pubkey::default()
            && clearing.pending_computation == Pubkey::default(),
        ErrorCode::WrongPendingComputation
    );
    let mut args =
        ArgBuilder::new().plaintext_u128(u128::from_le_bytes(order.candidate_clearing_nonce));
    for field in order.candidate_clearing {
        args = args.encrypted_u64(field);
    }
    for byte in market.key().to_bytes() {
        args = args.plaintext_u8(byte);
    }
    let args = args
        .plaintext_u64(clearing.version)
        .x25519_pubkey(clearing.recovery_key)
        .build();
    ctx.accounts.order.status = OrderStatus::SealingClearing;
    let computation = ctx.accounts.computation_account.key();
    ctx.accounts.order.pending_computation = computation;
    ctx.accounts.trader_account.pending_computation = computation;
    ctx.accounts.maker_account.pending_computation = computation;
    ctx.accounts.clearing.pending_computation = computation;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![SealClearingCallback::callback_ix(
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
                    pubkey: ctx.accounts.trader_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.maker_account.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.remaining_accounts[0].key(),
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

fn read_quote(source: &UncheckedAccount<'_>) -> Result<QuoteRecord> {
    require_keys_eq!(*source.owner, ID, ErrorCode::WrongQuoteSnapshot);
    let data = source.try_borrow_data()?;
    QuoteRecord::try_deserialize(&mut &data[..])
}

fn read_offer(source: &UncheckedAccount<'_>) -> Result<BackstopOffer> {
    require_keys_eq!(*source.owner, ID, ErrorCode::WrongBackstopStatus);
    let data = source.try_borrow_data()?;
    BackstopOffer::try_deserialize(&mut &data[..])
}

fn write_quote(source: &UncheckedAccount<'_>, quote: &QuoteRecord) -> Result<()> {
    let mut data = source.try_borrow_mut_data()?;
    quote.try_serialize(&mut &mut data[..])
}

fn write_offer(source: &UncheckedAccount<'_>, offer: &BackstopOffer) -> Result<()> {
    let mut data = source.try_borrow_mut_data()?;
    offer.try_serialize(&mut &mut data[..])
}

pub fn seal_clearing_callback_handler(
    ctx: Context<SealClearingCallback>,
    output: SignedComputationOutputs<SealClearingOutput>,
) -> Result<()> {
    let SealClearingOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let order = &mut ctx.accounts.order;
    let trader = &mut ctx.accounts.trader_account;
    let maker = &mut ctx.accounts.maker_account;
    let clearing = &mut ctx.accounts.clearing;
    let market = &mut ctx.accounts.market;
    require!(
        order.status == OrderStatus::SealingClearing,
        ErrorCode::WrongOrderStatus
    );
    let computation = ctx.accounts.computation_account.key();
    require!(
        order.pending_computation == computation
            && trader.pending_computation == computation
            && maker.pending_computation == computation
            && clearing.pending_computation == computation,
        ErrorCode::WrongPendingComputation
    );
    require_keys_eq!(
        ctx.accounts.source.key(),
        order.selected_quote,
        ErrorCode::WrongQuoteSnapshot
    );
    let source_valid = match order.kind {
        OrderKind::Trade => {
            let quote = read_quote(&ctx.accounts.source)?;
            quote.market == market.key()
                && quote.status == QuoteStatus::Active
                && quote.expiry > Clock::get()?.unix_timestamp
                && quote.maker == maker.owner
        }
        OrderKind::Liquidation => {
            let offer = read_offer(&ctx.accounts.source)?;
            offer.market == market.key()
                && offer.status == BackstopStatus::Locked
                && offer.expiry > Clock::get()?.unix_timestamp
                && offer.maker == maker.owner
        }
    };
    if source_valid
        && eligible(
            market,
            clearing,
            trader,
            maker,
            order,
            market.key(),
            &Clock::get()?,
        )
    {
        require!(
            result.field_1.encryption_key == clearing.recovery_key,
            ErrorCode::WrongRecoveryKey
        );
        trader.ciphertexts = order.sealed_trader;
        trader.nonce = order.sealed_trader_nonce;
        trader.recovery_ciphertexts = order.trader_recovery;
        trader.recovery_nonce = order.trader_recovery_nonce;
        trader.commitment = order.trader_commitment;
        trader.version = trader
            .version
            .checked_add(1)
            .ok_or(ErrorCode::RevisionOverflow)?;
        maker.ciphertexts = order.sealed_maker;
        maker.nonce = order.sealed_maker_nonce;
        maker.recovery_ciphertexts = order.maker_recovery;
        maker.recovery_nonce = order.maker_recovery_nonce;
        maker.commitment = order.maker_commitment;
        maker.version = maker
            .version
            .checked_add(1)
            .ok_or(ErrorCode::RevisionOverflow)?;
        clearing.ciphertexts = result.field_0.ciphertexts;
        clearing.nonce = result.field_0.nonce.to_le_bytes();
        clearing.recovery_ciphertexts = result.field_1.ciphertexts;
        clearing.recovery_nonce = result.field_1.nonce.to_le_bytes();
        clearing.commitment = result.field_2;
        clearing.version = clearing
            .version
            .checked_add(1)
            .ok_or(ErrorCode::RevisionOverflow)?;
        match order.kind {
            OrderKind::Trade => {
                let mut quote = read_quote(&ctx.accounts.source)?;
                let count = usize::from(market.active_quote_count);
                let index = market.active_quotes[..count]
                    .iter()
                    .position(|key| *key == ctx.accounts.source.key())
                    .ok_or(ErrorCode::WrongQuoteSnapshot)?;
                for i in index..count - 1 {
                    market.active_quotes[i] = market.active_quotes[i + 1];
                }
                market.active_quotes[count - 1] = Pubkey::default();
                market.active_quote_count -= 1;
                market.quoted_notional = market
                    .quoted_notional
                    .checked_sub(quote.capacity)
                    .ok_or(ErrorCode::QuoteCapacityExceeded)?;
                quote.remaining_capacity = 0;
                quote.required_margin = 0;
                quote.status = QuoteStatus::Filled;
                write_quote(&ctx.accounts.source, &quote)?;
            }
            OrderKind::Liquidation => {
                let mut offer = read_offer(&ctx.accounts.source)?;
                offer.status = BackstopStatus::Consumed;
                offer.pending_computation = Pubkey::default();
                write_offer(&ctx.accounts.source, &offer)?;
                market.backstop_offer = Pubkey::default();
                market.status = MarketStatus::Paused;
                ctx.accounts.protocol.trading_enabled = false;
            }
        }
        order.status = OrderStatus::Filled;
    } else {
        order.status = OrderStatus::Rejected;
        if order.kind == OrderKind::Liquidation {
            let mut offer = read_offer(&ctx.accounts.source)?;
            offer.status = BackstopStatus::Active;
            offer.pending_computation = Pubkey::default();
            write_offer(&ctx.accounts.source, &offer)?;
            market.status = MarketStatus::Paused;
            ctx.accounts.protocol.trading_enabled = false;
        }
    }
    reset_locks(order, trader, maker, clearing);
    trader.status = MarketAccountStatus::Ready;
    maker.status = MarketAccountStatus::Ready;
    clearing.status = ClearingStatus::Ready;
    market.pending_orders = 0;
    Ok(())
}
