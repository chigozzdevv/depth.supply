use anchor_lang::prelude::*;

use crate::{
    constants::{MAX_SOL_PRICE_E8, MIN_SOL_PRICE_E8, SOL_USD_FEED_ID},
    error::ErrorCode,
    state::MarketConfig,
};

const PYTH_RECEIVER: Pubkey = Pubkey::new_from_array([
    12, 183, 250, 187, 82, 247, 166, 72, 187, 91, 49, 125, 154, 1, 139, 144, 87, 203, 2, 71, 116,
    250, 254, 1, 230, 196, 223, 152, 204, 56, 88, 129,
]);
const PRICE_UPDATE_DISCRIMINATOR: [u8; 8] = [0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd];

#[derive(AnchorSerialize, AnchorDeserialize)]
enum VerificationLevel {
    Partial { num_signatures: u8 },
    Full,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
struct PriceFeedMessage {
    feed_id: [u8; 32],
    price: i64,
    conf: u64,
    exponent: i32,
    publish_time: i64,
    prev_publish_time: i64,
    ema_price: i64,
    ema_conf: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
struct PriceUpdateV2 {
    write_authority: Pubkey,
    verification_level: VerificationLevel,
    price_message: PriceFeedMessage,
    posted_slot: u64,
}

pub struct OraclePrice {
    pub price_e8: u64,
    pub ema_price_e8: u64,
    pub confidence_e8: u64,
    pub publish_time: i64,
    pub posted_slot: u64,
}

pub fn read_price(
    account: &AccountInfo,
    config: &MarketConfig,
    clock: &Clock,
) -> Result<OraclePrice> {
    require_keys_eq!(
        *account.owner,
        PYTH_RECEIVER,
        ErrorCode::InvalidOracleAccount
    );
    let data = account.try_borrow_data()?;
    require!(
        data.len() == 134 && data[..8] == PRICE_UPDATE_DISCRIMINATOR,
        ErrorCode::InvalidOracleAccount
    );
    let update = PriceUpdateV2::deserialize(&mut &data[8..])
        .map_err(|_| error!(ErrorCode::InvalidOracleAccount))?;
    require!(
        matches!(update.verification_level, VerificationLevel::Full),
        ErrorCode::UnverifiedOracle
    );
    require!(
        update.price_message.feed_id == SOL_USD_FEED_ID,
        ErrorCode::WrongOracleFeed
    );
    require!(
        update.posted_slot <= clock.slot
            && update.price_message.publish_time <= clock.unix_timestamp
            && update.price_message.publish_time > 0
            && clock
                .unix_timestamp
                .saturating_sub(update.price_message.publish_time)
                <= i64::from(config.max_oracle_age_seconds),
        ErrorCode::StaleOracle
    );
    require!(
        update.price_message.price > 0,
        ErrorCode::InvalidOraclePrice
    );
    let price_e8 = normalize_e8(
        update.price_message.price as u64,
        update.price_message.exponent,
    )?;
    let confidence_e8 = normalize_e8(update.price_message.conf, update.price_message.exponent)?;
    require!(
        update.price_message.ema_price > 0,
        ErrorCode::InvalidOraclePrice
    );
    let ema_price_e8 = normalize_e8(
        update.price_message.ema_price as u64,
        update.price_message.exponent,
    )?;
    require!(
        (MIN_SOL_PRICE_E8..=MAX_SOL_PRICE_E8).contains(&price_e8),
        ErrorCode::InvalidOraclePrice
    );
    require!(
        (MIN_SOL_PRICE_E8..=MAX_SOL_PRICE_E8).contains(&ema_price_e8),
        ErrorCode::InvalidOraclePrice
    );
    require!(
        u128::from(update.price_message.conf) * 10_000
            <= (update.price_message.price as u128) * u128::from(config.max_confidence_bps),
        ErrorCode::WideOracleConfidence
    );
    Ok(OraclePrice {
        price_e8,
        ema_price_e8,
        confidence_e8,
        publish_time: update.price_message.publish_time,
        posted_slot: update.posted_slot,
    })
}

fn normalize_e8(value: u64, exponent: i32) -> Result<u64> {
    let shift = exponent
        .checked_add(8)
        .ok_or(ErrorCode::InvalidOraclePrice)?;
    require!(shift.unsigned_abs() <= 18, ErrorCode::InvalidOraclePrice);
    let scale = 10u128
        .checked_pow(shift.unsigned_abs())
        .ok_or(ErrorCode::InvalidOraclePrice)?;
    let normalized = if shift >= 0 {
        u128::from(value)
            .checked_mul(scale)
            .ok_or(ErrorCode::InvalidOraclePrice)?
    } else {
        u128::from(value) / scale
    };
    u64::try_from(normalized).map_err(|_| error!(ErrorCode::InvalidOraclePrice))
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::state::MarketConfig;

    fn config() -> MarketConfig {
        MarketConfig {
            initial_margin_bps: 1_000,
            maintenance_margin_bps: 500,
            liquidation_fee_bps: 50,
            trade_fee_bps: 5,
            insurance_fee_bps: 2,
            max_account_notional: 1_000_000_000,
            max_market_notional: 10_000_000_000,
            max_oracle_age_seconds: 30,
            max_confidence_bps: 100,
            max_quote_deviation_bps: 500,
            max_quote_lifetime_seconds: 30,
            max_order_queue_seconds: 30,
            funding_interval_seconds: 3_600,
            funding_rate_cap_bps: 50,
            quote_tiers: [1_000_000, 10_000_000, 100_000_000, 1_000_000_000],
            backstop_min_collateral: 100_000_000,
        }
    }

    fn update() -> PriceUpdateV2 {
        PriceUpdateV2 {
            write_authority: Pubkey::new_unique(),
            verification_level: VerificationLevel::Full,
            price_message: PriceFeedMessage {
                feed_id: SOL_USD_FEED_ID,
                price: 20_000_000_000,
                conf: 20_000_000,
                exponent: -8,
                publish_time: 990,
                prev_publish_time: 989,
                ema_price: 20_000_000_000,
                ema_conf: 20_000_000,
            },
            posted_slot: 40,
        }
    }

    fn read_update(update: &PriceUpdateV2, owner: &Pubkey) -> Result<OraclePrice> {
        let key = Pubkey::new_unique();
        let mut lamports = 1;
        let mut data = PRICE_UPDATE_DISCRIMINATOR.to_vec();
        update.serialize(&mut data).unwrap();
        data.resize(134, 0);
        let info = AccountInfo::new(&key, false, false, &mut lamports, &mut data, owner, false);
        read_price(
            &info,
            &config(),
            &Clock {
                slot: 50,
                unix_timestamp: 1_000,
                ..Clock::default()
            },
        )
    }

    #[test]
    fn normalizes_price_exponents_without_overflow() {
        assert_eq!(normalize_e8(12_345, -2).unwrap(), 12_345_000_000);
        assert_eq!(normalize_e8(12_345_000_000, -8).unwrap(), 12_345_000_000);
        assert_eq!(normalize_e8(12_345_000_000, -10).unwrap(), 123_450_000);
        assert!(normalize_e8(u64::MAX, 10).is_err());
        assert!(normalize_e8(1, -30).is_err());
    }

    #[test]
    fn accepts_only_fresh_fully_verified_sol_prices() {
        let good = read_update(&update(), &PYTH_RECEIVER).unwrap();
        assert_eq!(good.price_e8, 20_000_000_000);
        assert_eq!(good.ema_price_e8, 20_000_000_000);
        assert_eq!(good.confidence_e8, 20_000_000);
        assert_eq!(good.publish_time, 990);
        assert_eq!(good.posted_slot, 40);

        assert!(read_update(&update(), &Pubkey::new_unique()).is_err());
        let mut bad = update();
        bad.verification_level = VerificationLevel::Partial { num_signatures: 5 };
        assert!(read_update(&bad, &PYTH_RECEIVER).is_err());
        bad = update();
        bad.price_message.feed_id = [0; 32];
        assert!(read_update(&bad, &PYTH_RECEIVER).is_err());
        bad = update();
        bad.price_message.publish_time = 969;
        assert!(read_update(&bad, &PYTH_RECEIVER).is_err());
        bad = update();
        bad.price_message.conf = 300_000_000;
        assert!(read_update(&bad, &PYTH_RECEIVER).is_err());
        bad = update();
        bad.price_message.price = 0;
        assert!(read_update(&bad, &PYTH_RECEIVER).is_err());
        bad = update();
        bad.price_message.price = 50_000_000;
        assert!(read_update(&bad, &PYTH_RECEIVER).is_err());
        bad = update();
        bad.price_message.price = 9_000_000_000_000_001;
        assert!(read_update(&bad, &PYTH_RECEIVER).is_err());
    }
}
