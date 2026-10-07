use crate::circuits::MarketState;
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
