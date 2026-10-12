use crate::circuits::{FeeRecovery, MarketState, OrderInput, QuoteBalance, QuoteCurve, TradePlan};
use arcis::testing::{get_instruction, ArcisInstructionWithInfo};
use arcis::*;

type MarketOutput = (
    Enc<Mxe, Pack<MarketState>>,
    Enc<Shared, Pack<MarketState>>,
    [u8; 32],
    bool,
);

fn market_result(
    instruction: &ArcisInstructionWithInfo,
    funding: i128,
    position: i64,
    collateral: u64,
    wire: bool,
) -> bool {
    let state = MarketState {
        collateral,
        reserved: 100_000_000,
        position,
        entry_price: if position == 0 { 0 } else { 11_600_519_367 },
        funding_checkpoint: 15_177_602,
        salt: 123,
    };
    let encrypted = Mxe::get().from_arcis(Pack::new(state));
    let input = (
        encrypted,
        50_000_000u64,
        11_600_519_367u64,
        funding,
        1_000u16,
        [1u8; 32],
        30u64,
        ArcisX25519Pubkey::from_base58(b"test"),
    );
    let mut values = Vec::new();
    input.handle_outputs(&mut values);
    if wire {
        let raw: Number = (funding as u128).into();
        values[6] = EvalValue::arcis(raw.into());
    }
    let result: MarketOutput = instruction.eval(values);
    result.3
}

#[test]
fn market_funding_wire() {
    for name in ["reserve_quote_v2", "offer_backstop_v2", "debit_market_v2"] {
        let instruction = get_instruction(name);
        for funding in [0i128, -24_309_545, 24_309_545] {
            for wire in [false, true] {
                assert!(
                    market_result(&instruction, funding, 0, 300_307_042, wire),
                    "circuit={name}, funding={funding}, wire={wire}"
                );
            }
        }
    }
}

#[test]
fn quote_funding_bounds() {
    for name in ["reserve_quote_v2", "offer_backstop_v2"] {
        let instruction = get_instruction(name);
        for (funding, accepted) in [
            (-1_000_000_000_000_000_000i128, true),
            (1_000_000_000_000_000_000, true),
            (-1_000_000_000_000_000_001, false),
            (1_000_000_000_000_000_001, false),
            (i128::MIN, false),
            (i128::MAX, false),
        ] {
            for wire in [false, true] {
                assert_eq!(
                    market_result(&instruction, funding, 0, 300_307_042, wire),
                    accepted,
                    "circuit={name}, funding={funding}, wire={wire}"
                );
            }
        }
    }
}

#[test]
fn market_funding_equity() {
    for name in ["reserve_quote_v2", "offer_backstop_v2", "debit_market_v2"] {
        let instruction = get_instruction(name);
        for (position, funding, accepted) in [
            (-1_000_000_000i64, -24_309_545i128, false),
            (-1_000_000_000, 0, false),
            (-1_000_000_000, 24_309_545, true),
            (1_000_000_000, -24_309_545, true),
            (1_000_000_000, 0, true),
            (1_000_000_000, 24_309_545, false),
        ] {
            for wire in [false, true] {
                assert_eq!(
                    market_result(&instruction, funding, position, 161_600_520, wire),
                    accepted,
                    "circuit={name}, position={position}, funding={funding}, wire={wire}"
                );
            }
        }
    }
}

#[test]
fn close_limits_and_position_version_remain_binding() {
    let instruction = get_instruction("match_order");
    for position in [-1_000_000_000i64, 1_000_000_000] {
        for (slippage, version, expected) in [(50u64, 7u64, false), (75, 7, true), (75, 8, false)] {
            let side = if position > 0 { -1 } else { 1 };
            let limit = if side == 1 {
                10_000 + slippage
            } else {
                10_000 - slippage
            };
            let input = OrderInput {
                side,
                amount: 0,
                margin: 20_000_000,
                limit_price: 1_000_000 * limit,
                max_fee: 100_000,
                intent: 2,
                version,
            };
            let state = MarketState {
                collateral: input.margin,
                reserved: 0,
                position,
                entry_price: 10_000_000_000,
                funding_checkpoint: 0,
                salt: 1,
            };
            let curve = QuoteCurve {
                bid: [9_940_000_000; 4],
                ask: [10_060_000_000; 4],
                bid_reciprocal: [0; 4],
                ask_reciprocal: [0; 4],
            };
            let capacity = QuoteBalance {
                remaining_capacity: 200_000_000,
                remaining_margin: 20_000_000,
            };
            let quote = || Mxe::get().from_arcis(Pack::new(curve));
            let balance = || Mxe::get().from_arcis(Pack::new(capacity));
            let key = ArcisX25519Pubkey::from_base58(b"test");
            let mut values = Vec::new();
            (
                Shared::new(key).from_arcis(Pack::new(input)),
                Mxe::get().from_arcis(Pack::new(state)),
                7u64,
            )
                .handle_outputs(&mut values);
            (quote(), quote(), quote(), quote()).handle_outputs(&mut values);
            (balance(), balance(), balance(), balance()).handle_outputs(&mut values);
            (
                1u8,
                [200_000_000u64; 4],
                [4u8; 4],
                [false; 4],
                [1_000_000u64, 10_000_000, 100_000_000, 1_000_000_000],
                10_000_000_000u64,
                1000u16,
                5u16,
                1u16,
                1u16,
                500u16,
                1_000_000_000u64,
            )
            .handle_outputs(&mut values);
            (false, [1u8; 32], key).handle_outputs(&mut values);
            let result: (
                Enc<Mxe, Pack<TradePlan>>,
                Enc<Shared, FeeRecovery>,
                [u8; 32],
                u8,
                bool,
            ) = instruction.eval(values);
            assert_eq!(
                result.4, expected,
                "position={position}, slippage={slippage}, version={version}"
            );
            assert_eq!(result.3, if expected { 0 } else { 255 });
            let plan = result.0.to_arcis().unpack();
            assert_eq!(plan.size, if expected { 1_000_000_000 } else { 0 });
        }
    }
}
