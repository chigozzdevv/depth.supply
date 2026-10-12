use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;
use sha3::{Digest, Sha3_256};

use crate::{
    constants::{MAX_ORACLE_AGE_SECONDS, SOL_USD_FEED_ID},
    error::ErrorCode,
    oracle::{read_price, OraclePrice},
    state::{
        BackstopOffer, BackstopStatus, ClearingAccount, ClearingStatus, Market, MarketConfig,
        MarketIncident, MarketStatus, Protocol, QuoteQueue, RecoveryConfig,
    },
};

#[derive(Accounts)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = authority,
    )]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", SOL_USD_FEED_ID.as_ref()],
        bump,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(init, payer = authority, space = 8 + QuoteQueue::INIT_SPACE, seeds = [b"quote-queue", market.key().as_ref()], bump)]
    pub quote_queue: Box<Account<'info, QuoteQueue>>,
    #[account(init, payer = authority, space = 8 + RecoveryConfig::INIT_SPACE, seeds = [b"recovery-config", market.key().as_ref()], bump)]
    pub recovery_config: Box<Account<'info, RecoveryConfig>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReviseMarket<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"protocol"],
        bump = protocol.bump,
        has_one = authority,
    )]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        mut,
        seeds = [b"market", SOL_USD_FEED_ID.as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,
}

#[derive(Accounts)]
pub struct RefreshOracle<'info> {
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        mut,
        seeds = [b"market", SOL_USD_FEED_ID.as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,
    /// CHECK: The key is pinned by the market and the oracle reader verifies the account data.
    #[account(address = market.oracle_account @ ErrorCode::InvalidOracleAccount)]
    pub price_update: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SetOracleAccount<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump, has_one = authority)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    /// CHECK: The oracle reader verifies the account owner, discriminator, and price fields.
    pub price_update: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ActivateMarket<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = authority, has_one = vault)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(address = market.backstop_offer)]
    pub backstop_offer: Box<Account<'info, BackstopOffer>>,
    #[account(token::mint = protocol.settlement_mint, token::authority = protocol)]
    pub vault: Box<Account<'info, TokenAccount>>,
}

#[derive(Accounts)]
pub struct PauseMarket<'info> {
    pub actor: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
}

#[derive(Accounts)]
pub struct ReportIncident<'info> {
    pub actor: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = vault)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(token::mint = protocol.settlement_mint, token::authority = protocol)]
    pub vault: Box<Account<'info, TokenAccount>>,
}

#[derive(Accounts)]
pub struct ResumeMarket<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"protocol"], bump = protocol.bump, has_one = authority, has_one = vault)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(seeds = [b"clearing", market.key().as_ref()], bump = clearing.bump)]
    pub clearing: Box<Account<'info, ClearingAccount>>,
    #[account(address = market.backstop_offer)]
    pub backstop_offer: Box<Account<'info, BackstopOffer>>,
    #[account(token::mint = protocol.settlement_mint, token::authority = protocol)]
    pub vault: Box<Account<'info, TokenAccount>>,
}

pub fn create_market_handler(
    ctx: Context<CreateMarket>,
    config: MarketConfig,
    oracle_account: Pubkey,
    recovery_key: [u8; 32],
    recovery_signers: [Pubkey; 5],
) -> Result<()> {
    validate_config(&config)?;
    require_keys_neq!(
        oracle_account,
        Pubkey::default(),
        ErrorCode::InvalidOracleAccount
    );
    require!(recovery_key != [0; 32], ErrorCode::InvalidRecoveryKey);
    for (index, signer) in recovery_signers.iter().enumerate() {
        require!(
            *signer != Pubkey::default(),
            ErrorCode::InvalidRecoveryCommittee
        );
        require!(
            !recovery_signers[..index].contains(signer),
            ErrorCode::InvalidRecoveryCommittee
        );
    }
    let market = &mut ctx.accounts.market;
    market.market_id = SOL_USD_FEED_ID;
    market.settlement_mint = ctx.accounts.protocol.settlement_mint;
    market.vault = ctx.accounts.protocol.vault;
    market.oracle_account = oracle_account;
    market.config = config;
    market.revision = 1;
    market.funding_index = 0;
    market.last_funding_timestamp = 0;
    market.oracle_price_e8 = 0;
    market.oracle_ema_e8 = 0;
    market.oracle_confidence_e8 = 0;
    market.oracle_timestamp = 0;
    market.oracle_slot = 0;
    market.active_quotes = [Pubkey::default(); 4];
    market.active_quote_count = 0;
    market.quoted_notional = 0;
    market.backstop_offer = Pubkey::default();
    market.pending_orders = 0;
    market.pending_order = Pubkey::default();
    market.status = MarketStatus::Draft;
    market.incident = MarketIncident::None;
    market.bump = ctx.bumps.market;
    ctx.accounts.quote_queue.market = market.key();
    ctx.accounts.quote_queue.entries = [Pubkey::default(); 8];
    ctx.accounts.quote_queue.count = 0;
    ctx.accounts.quote_queue.bump = ctx.bumps.quote_queue;
    let recovery = &mut ctx.accounts.recovery_config;
    recovery.market = market.key();
    recovery.recovery_key = recovery_key;
    recovery.signers = recovery_signers;
    recovery.account_count = 0;
    recovery.bump = ctx.bumps.recovery_config;
    Ok(())
}

pub fn revise_market_handler(ctx: Context<ReviseMarket>, config: MarketConfig) -> Result<()> {
    require!(
        ctx.accounts.market.status == MarketStatus::Draft,
        ErrorCode::MarketNotDraft
    );
    validate_config(&config)?;
    require!(
        ctx.accounts.market.config != config,
        ErrorCode::UnchangedConfig
    );
    let market = &mut ctx.accounts.market;
    market.config = config;
    market.revision = market
        .revision
        .checked_add(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    Ok(())
}

pub fn set_oracle_age_handler(ctx: Context<ReviseMarket>, max_age_seconds: u32) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(
        market.status == MarketStatus::Paused,
        ErrorCode::MarketNotPaused
    );
    require!(market.pending_orders == 0, ErrorCode::WrongOrderStatus);
    require!(
        market.config.max_oracle_age_seconds != max_age_seconds,
        ErrorCode::UnchangedConfig
    );
    let mut config = market.config;
    config.max_oracle_age_seconds = max_age_seconds;
    validate_config(&config)?;
    market.revision = market
        .revision
        .checked_add(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    market.config = config;
    Ok(())
}

pub fn refresh_oracle_handler(ctx: Context<RefreshOracle>) -> Result<()> {
    require!(
        ctx.accounts.market.status != MarketStatus::Settling,
        ErrorCode::MarketNotActive
    );
    let price = read_price(
        &ctx.accounts.price_update.to_account_info(),
        &ctx.accounts.market.config,
        &Clock::get()?,
    )?;
    require!(
        price.publish_time > ctx.accounts.market.oracle_timestamp
            && price.posted_slot >= ctx.accounts.market.oracle_slot,
        ErrorCode::StaleOracle
    );
    let market = &mut ctx.accounts.market;
    if market.status == MarketStatus::Active {
        match funding_action(
            price.publish_time,
            market.last_funding_timestamp,
            market.config.funding_interval_seconds,
        ) {
            FundingAction::Wait => {}
            FundingAction::Advance => {
                let delta = funding_delta(
                    price.price_e8,
                    price.ema_price_e8,
                    market.config.funding_rate_cap_bps,
                );
                let next = market
                    .funding_index
                    .checked_add(delta)
                    .ok_or(ErrorCode::RevisionOverflow)?;
                require!(
                    (-1_000_000_000_000_000_000i128..=1_000_000_000_000_000_000i128)
                        .contains(&next),
                    ErrorCode::RevisionOverflow
                );
                market.funding_index = next;
                market.last_funding_timestamp += i64::from(market.config.funding_interval_seconds);
            }
            FundingAction::Pause => {
                market.pause(MarketIncident::MissedFunding);
                ctx.accounts.protocol.trading_enabled = false;
            }
        }
    }
    record_oracle(market, price);
    Ok(())
}

pub fn set_oracle_account_handler(ctx: Context<SetOracleAccount>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(
        matches!(market.status, MarketStatus::Draft | MarketStatus::Paused),
        ErrorCode::OracleSourceLocked
    );
    require!(market.pending_orders == 0, ErrorCode::WrongOrderStatus);
    require_keys_neq!(
        ctx.accounts.price_update.key(),
        market.oracle_account,
        ErrorCode::InvalidOracleAccount
    );
    let price = read_price(
        &ctx.accounts.price_update.to_account_info(),
        &market.config,
        &Clock::get()?,
    )?;
    require!(
        price.publish_time > market.oracle_timestamp && price.posted_slot >= market.oracle_slot,
        ErrorCode::StaleOracle
    );
    market.oracle_account = ctx.accounts.price_update.key();
    record_oracle(market, price);
    Ok(())
}

fn record_oracle(market: &mut Market, price: OraclePrice) {
    market.oracle_price_e8 = price.price_e8;
    market.oracle_ema_e8 = price.ema_price_e8;
    market.oracle_confidence_e8 = price.confidence_e8;
    market.oracle_timestamp = price.publish_time;
    market.oracle_slot = price.posted_slot;
}

pub fn activate_market_handler(
    ctx: Context<ActivateMarket>,
    insurance: u64,
    salt: u128,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clearing = &ctx.accounts.clearing;
    let protocol = &mut ctx.accounts.protocol;
    let clock = Clock::get()?;
    require!(
        market.status == MarketStatus::Draft,
        ErrorCode::MarketNotDraft
    );
    require!(
        market.pending_orders == 0 && market.active_quote_count > 0,
        ErrorCode::InvalidMarketConfig
    );
    require!(
        clearing.status == ClearingStatus::Ready,
        ErrorCode::WrongClearingStatus
    );
    require_keys_eq!(clearing.market, market.key(), ErrorCode::WrongMarket);
    require_keys_eq!(
        market.settlement_mint,
        protocol.settlement_mint,
        ErrorCode::WrongMarket
    );
    require_keys_eq!(market.vault, protocol.vault, ErrorCode::WrongMarket);
    require!(
        insurance >= market.config.backstop_min_collateral,
        ErrorCode::InvalidMarketConfig
    );
    require!(
        ctx.accounts.backstop_offer.status == BackstopStatus::Active
            && ctx.accounts.backstop_offer.market == market.key()
            && ctx.accounts.backstop_offer.margin >= market.config.backstop_min_collateral
            && ctx.accounts.backstop_offer.expiry > clock.unix_timestamp,
        ErrorCode::InvalidBackstop
    );
    require!(
        market.oracle_timestamp > 0
            && clock.unix_timestamp >= market.oracle_timestamp
            && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
                <= i64::from(market.config.max_oracle_age_seconds),
        ErrorCode::StaleOracle
    );
    require!(
        u128::from(protocol.pending_total) + u128::from(protocol.credited_total)
            <= u128::from(ctx.accounts.vault.amount),
        ErrorCode::VaultUnderfunded
    );
    let mut preimage = [0u8; 104];
    preimage[..16].copy_from_slice(b"depth.clear.v2\0\0");
    preimage[16..48].copy_from_slice(market.key().as_ref());
    preimage[48..56].copy_from_slice(&clearing.version.to_le_bytes());
    preimage[56..64].copy_from_slice(&insurance.to_le_bytes());
    preimage[64..72].copy_from_slice(&0u64.to_le_bytes());
    preimage[72..88].copy_from_slice(&[0; 16]);
    preimage[88..104].copy_from_slice(&salt.to_le_bytes());
    require!(
        Sha3_256::digest(preimage).as_slice() == clearing.commitment,
        ErrorCode::InvalidRecoveryState
    );
    market.status = MarketStatus::Active;
    market.incident = MarketIncident::None;
    market.last_funding_timestamp = market.oracle_timestamp;
    protocol.trading_enabled = true;
    Ok(())
}

pub fn pause_market_handler(ctx: Context<PauseMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(
        market.status == MarketStatus::Active,
        ErrorCode::MarketNotActive
    );
    let clock = Clock::get()?;
    let stale = clock.unix_timestamp < market.oracle_timestamp
        || clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
            > i64::from(market.config.max_oracle_age_seconds);
    require!(
        ctx.accounts.actor.key() == ctx.accounts.protocol.authority || stale,
        ErrorCode::Unauthorized
    );
    market.pause(if stale {
        MarketIncident::StaleOracle
    } else {
        MarketIncident::ManualPause
    });
    ctx.accounts.protocol.trading_enabled = false;
    Ok(())
}

pub fn report_incident_handler(
    ctx: Context<ReportIncident>,
    incident: MarketIncident,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(
        market.status == MarketStatus::Active,
        ErrorCode::MarketNotActive
    );
    let clock = Clock::get()?;
    let verified = match incident {
        MarketIncident::StaleOracle => {
            clock.unix_timestamp < market.oracle_timestamp
                || clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
                    > i64::from(market.config.max_oracle_age_seconds)
        }
        MarketIncident::CollateralDeficit => {
            u128::from(ctx.accounts.protocol.pending_total)
                + u128::from(ctx.accounts.protocol.credited_total)
                > u128::from(ctx.accounts.vault.amount)
        }
        MarketIncident::ClusterUnavailable | MarketIncident::CallbackFailure => {
            ctx.accounts.actor.key() == ctx.accounts.protocol.authority
        }
        _ => false,
    };
    require!(verified, ErrorCode::Unauthorized);
    market.pause(incident);
    ctx.accounts.protocol.trading_enabled = false;
    Ok(())
}

pub fn resume_market_handler(ctx: Context<ResumeMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(
        market.status == MarketStatus::Paused,
        ErrorCode::MarketNotPaused
    );
    require!(market.pending_orders == 0, ErrorCode::WrongOrderStatus);
    require!(
        ctx.accounts.clearing.status == ClearingStatus::Ready,
        ErrorCode::WrongClearingStatus
    );
    require_keys_eq!(
        ctx.accounts.clearing.market,
        market.key(),
        ErrorCode::WrongMarket
    );
    let clock = Clock::get()?;
    require!(
        ctx.accounts.backstop_offer.status == BackstopStatus::Active
            && ctx.accounts.backstop_offer.market == market.key()
            && ctx.accounts.backstop_offer.margin >= market.config.backstop_min_collateral
            && ctx.accounts.backstop_offer.expiry > clock.unix_timestamp,
        ErrorCode::InvalidBackstop
    );
    require!(
        market.oracle_timestamp > 0
            && clock.unix_timestamp >= market.oracle_timestamp
            && clock.unix_timestamp.saturating_sub(market.oracle_timestamp)
                <= i64::from(market.config.max_oracle_age_seconds),
        ErrorCode::StaleOracle
    );
    require!(
        u128::from(ctx.accounts.protocol.pending_total)
            + u128::from(ctx.accounts.protocol.credited_total)
            <= u128::from(ctx.accounts.vault.amount),
        ErrorCode::VaultUnderfunded
    );
    market.status = MarketStatus::Active;
    market.incident = MarketIncident::None;
    market.last_funding_timestamp = market.oracle_timestamp;
    ctx.accounts.protocol.trading_enabled = true;
    Ok(())
}

#[derive(Debug, PartialEq, Eq)]
enum FundingAction {
    Wait,
    Advance,
    Pause,
}

fn funding_action(
    publish_time: i64,
    last_funding_time: i64,
    interval_seconds: u32,
) -> FundingAction {
    let elapsed = publish_time.saturating_sub(last_funding_time);
    let interval = i64::from(interval_seconds);
    if elapsed >= interval * 2 {
        FundingAction::Pause
    } else if elapsed >= interval {
        FundingAction::Advance
    } else {
        FundingAction::Wait
    }
}

fn funding_delta(price_e8: u64, ema_price_e8: u64, cap_bps: u16) -> i128 {
    let premium =
        (i128::from(price_e8) - i128::from(ema_price_e8)) * 10_000 / i128::from(ema_price_e8);
    let rate = premium.clamp(-i128::from(cap_bps), i128::from(cap_bps));
    i128::from(price_e8) * rate / 10_000
}

#[cfg(test)]
mod tests {
    use super::{funding_action, funding_delta, FundingAction};

    #[test]
    fn missed_funding_interval_pauses_without_back_charging() {
        let last = 1_000;
        let interval = 3_600;
        assert_eq!(funding_action(4_599, last, interval), FundingAction::Wait);
        assert_eq!(
            funding_action(4_600, last, interval),
            FundingAction::Advance
        );
        assert_eq!(
            funding_action(8_199, last, interval),
            FundingAction::Advance
        );
        assert_eq!(funding_action(8_200, last, interval), FundingAction::Pause);
        assert_eq!(funding_action(20_000, last, interval), FundingAction::Pause);
    }

    #[test]
    fn funding_uses_verified_price_premium_and_rate_cap() {
        assert_eq!(funding_delta(20_000_000_000, 20_000_000_000, 50), 0);
        assert_eq!(
            funding_delta(20_100_000_000, 20_000_000_000, 50),
            100_500_000
        );
        assert_eq!(
            funding_delta(19_900_000_000, 20_000_000_000, 50),
            -99_500_000
        );
        assert_eq!(
            funding_delta(22_000_000_000, 20_000_000_000, 50),
            110_000_000
        );
    }
}

fn validate_config(config: &MarketConfig) -> Result<()> {
    require!(
        config.maintenance_margin_bps > 0
            && config.initial_margin_bps > config.maintenance_margin_bps
            && config.initial_margin_bps <= 10_000,
        ErrorCode::InvalidMarketConfig
    );
    require!(
        config.liquidation_fee_bps < config.maintenance_margin_bps
            && config.trade_fee_bps == 5
            && config.insurance_fee_bps == 1,
        ErrorCode::InvalidMarketConfig
    );
    require!(
        config.max_account_notional > 0
            && config.max_account_notional <= 500_000_000_000
            && config.max_market_notional >= config.max_account_notional
            && config.backstop_min_collateral > 0,
        ErrorCode::InvalidMarketConfig
    );
    require!(
        (1..=MAX_ORACLE_AGE_SECONDS).contains(&config.max_oracle_age_seconds)
            && (1..=500).contains(&config.max_confidence_bps)
            && (1..=1_000).contains(&config.max_quote_deviation_bps),
        ErrorCode::InvalidMarketConfig
    );
    require!(
        (1..=120).contains(&config.max_quote_lifetime_seconds)
            && (1..=300).contains(&config.max_order_queue_seconds)
            && (60..=86_400).contains(&config.funding_interval_seconds)
            && config.funding_rate_cap_bps <= 100,
        ErrorCode::InvalidMarketConfig
    );
    require!(
        config.quote_tiers[0] > 0
            && config.quote_tiers[0] < config.quote_tiers[1]
            && config.quote_tiers[1] < config.quote_tiers[2]
            && config.quote_tiers[2] < config.quote_tiers[3]
            && config.quote_tiers[3] <= config.max_account_notional,
        ErrorCode::InvalidMarketConfig
    );
    let minimum_backstop = u128::from(config.max_account_notional)
        .checked_mul(u128::from(config.initial_margin_bps))
        .ok_or(ErrorCode::InvalidMarketConfig)?
        .div_ceil(10_000);
    require!(
        u128::from(config.backstop_min_collateral) >= minimum_backstop,
        ErrorCode::InvalidMarketConfig
    );
    Ok(())
}

#[cfg(test)]
mod age_tests {
    use super::*;

    fn config(age: u32) -> MarketConfig {
        MarketConfig {
            initial_margin_bps: 1_000,
            maintenance_margin_bps: 500,
            liquidation_fee_bps: 50,
            trade_fee_bps: 5,
            insurance_fee_bps: 1,
            max_account_notional: 1_000_000_000,
            max_market_notional: 10_000_000_000,
            max_oracle_age_seconds: age,
            max_confidence_bps: 100,
            max_quote_deviation_bps: 500,
            max_quote_lifetime_seconds: 120,
            max_order_queue_seconds: 300,
            funding_interval_seconds: 3_600,
            funding_rate_cap_bps: 50,
            quote_tiers: [1_000_000, 10_000_000, 100_000_000, 1_000_000_000],
            backstop_min_collateral: 100_000_000,
        }
    }

    #[test]
    fn oracle_age_is_bounded_for_the_selected_build() {
        assert!(validate_config(&config(0)).is_err());
        assert!(validate_config(&config(300)).is_ok());
        assert_eq!(
            validate_config(&config(326)).is_ok(),
            cfg!(feature = "devnet")
        );
        assert_eq!(
            validate_config(&config(600)).is_ok(),
            cfg!(feature = "devnet")
        );
        assert!(validate_config(&config(601)).is_err());
    }
}
