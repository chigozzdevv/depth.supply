use arcium_client::idl::arcium::types::{CircuitSource, OffChainCircuitSource};

pub(crate) fn circuit_source(name: &str, hash: [u8; 32]) -> Option<CircuitSource> {
    option_env!("DEPTH_CIRCUIT_BASE_URL").map(|base| {
        CircuitSource::OffChain(OffChainCircuitSource {
            source: format!("{}/{name}.arcis", base.trim_end_matches('/')),
            hash,
        })
    })
}

macro_rules! init_depth_comp_def {
    ($accounts:expr, $name:literal) => {
        arcium_anchor::init_computation_def(
            $accounts,
            crate::instructions::circuit_source($name, arcium_macros::circuit_hash!($name)),
        )
    };
}

pub mod app;
pub mod backstop;
pub mod balance;
pub mod clearing;
pub mod commit;
pub mod credit;
pub mod fees;
pub mod fill_view;
pub mod liquidation;
pub mod margin;
pub mod margin_in;
pub mod margin_out;
pub mod market;
pub mod market_view;
pub mod operator;
pub mod order;
pub mod permission;
pub mod quote;
pub mod quote_view;
pub mod recovery;
pub mod reserve;
pub mod settlement;
pub mod vault;
pub mod view;
pub mod winddown;
pub mod withdraw;

pub use app::*;
pub use backstop::*;
pub use balance::*;
pub use clearing::*;
pub use commit::*;
pub use credit::*;
pub use fees::*;
pub use fill_view::*;
pub use liquidation::*;
pub use margin::*;
pub use margin_in::*;
pub use margin_out::*;
pub use market::*;
pub use market_view::*;
pub use operator::*;
pub use order::*;
pub use permission::*;
pub use quote::*;
pub use quote_view::*;
pub use recovery::*;
pub use reserve::*;
pub use settlement::*;
pub use vault::*;
pub use view::*;
pub use winddown::*;
pub use withdraw::*;
