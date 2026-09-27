use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    #[derive(Copy, Clone)]
    pub struct BalanceState {
        pub amount: u64,
        pub salt: u128,
    }

    #[derive(Copy, Clone)]
    pub struct MarketState {
        pub collateral: u64,
        pub reserved: u64,
        pub position: i64,
        pub entry_price: u64,
        pub funding_checkpoint: i128,
        pub salt: u128,
    }

    #[derive(Copy, Clone)]
    pub struct QuoteCurve {
        pub bid: [u64; 4],
        pub ask: [u64; 4],
    }

    #[derive(Copy, Clone)]
    pub struct OrderInput {
        pub side: i8,
        pub size: u64,
        pub margin: u64,
        pub limit_price: u64,
        pub max_fee: u64,
        pub intent: u8,
        pub version: u64,
    }

    #[derive(Copy, Clone)]
    pub struct TradePlan {
        pub side: i8,
        pub size: u64,
        pub margin: u64,
        pub execution_price: u64,
        pub fee: u64,
        pub insurance_fee: u64,
        pub app_fee: u64,
        pub maker_rebate: u64,
    }

    #[derive(Copy, Clone)]
    pub struct FeeRecovery {
        pub protocol_fee: u64,
        pub app_fee: u64,
        pub salt: u128,
    }

    fn fee_hash(state: FeeRecovery, order: [u8; 32]) -> [u8; 32] {
        let mut bytes = [0u8; 80];
        let domain = b"depth.fees.v1\0\0\0";
        let protocol_bytes = state.protocol_fee.to_le_bytes();
        let app_bytes = state.app_fee.to_le_bytes();
        let salt_bytes = state.salt.to_le_bytes();
        for i in 0..16 {
            bytes[i] = domain[i];
            bytes[64 + i] = salt_bytes[i];
        }
        for i in 0..32 {
            bytes[16 + i] = order[i];
        }
        for i in 0..8 {
            bytes[48 + i] = protocol_bytes[i];
            bytes[56 + i] = app_bytes[i];
        }
        SHA3_256::new().digest(&bytes)
    }

    #[derive(Copy, Clone)]
    pub struct ClearingState {
        pub insurance: u64,
        pub open_interest: u64,
        pub protocol_fees: u64,
        pub app_fees: u64,
        pub salt: u128,
    }

    fn clearing_hash(state: ClearingState, market: [u8; 32], version: u64) -> [u8; 32] {
        let mut bytes = [0u8; 104];
        let domain = b"depth.clear.v2\0\0";
        let version_bytes = version.to_le_bytes();
        let insurance_bytes = state.insurance.to_le_bytes();
        let open_interest_bytes = state.open_interest.to_le_bytes();
        let protocol_fees_bytes = state.protocol_fees.to_le_bytes();
        let app_fees_bytes = state.app_fees.to_le_bytes();
        let salt_bytes = state.salt.to_le_bytes();
        for i in 0..16 {
            bytes[i] = domain[i];
            bytes[88 + i] = salt_bytes[i];
        }
        for i in 0..32 {
            bytes[16 + i] = market[i];
        }
        for i in 0..8 {
            bytes[48 + i] = version_bytes[i];
            bytes[56 + i] = insurance_bytes[i];
            bytes[64 + i] = open_interest_bytes[i];
            bytes[72 + i] = protocol_fees_bytes[i];
            bytes[80 + i] = app_fees_bytes[i];
        }
        SHA3_256::new().digest(&bytes)
    }

    fn balance_hash(state: BalanceState, owner: [u8; 32], version: u64) -> [u8; 32] {
        let mut bytes = [0u8; 80];
        let domain = b"depth.balance.v1";
        let version_bytes = version.to_le_bytes();
        let amount_bytes = state.amount.to_le_bytes();
        let salt_bytes = state.salt.to_le_bytes();
        for i in 0..16 {
            bytes[i] = domain[i];
            bytes[64 + i] = salt_bytes[i];
        }
        for i in 0..32 {
            bytes[16 + i] = owner[i];
        }
        for i in 0..8 {
            bytes[48 + i] = version_bytes[i];
            bytes[56 + i] = amount_bytes[i];
        }
        SHA3_256::new().digest(&bytes)
    }

    fn market_hash(state: MarketState, account: [u8; 32], version: u64) -> [u8; 32] {
        let mut bytes = [0u8; 120];
        let domain = b"depth.market.v1\0";
        let version_bytes = version.to_le_bytes();
        let collateral_bytes = state.collateral.to_le_bytes();
        let reserved_bytes = state.reserved.to_le_bytes();
        let position_bytes = state.position.to_le_bytes();
        let entry_bytes = state.entry_price.to_le_bytes();
        let funding_bytes = state.funding_checkpoint.to_le_bytes();
        let salt_bytes = state.salt.to_le_bytes();
        for i in 0..16 {
            bytes[i] = domain[i];
            bytes[88 + i] = funding_bytes[i];
            bytes[104 + i] = salt_bytes[i];
        }
        for i in 0..32 {
            bytes[16 + i] = account[i];
        }
        for i in 0..8 {
            bytes[48 + i] = version_bytes[i];
            bytes[56 + i] = collateral_bytes[i];
            bytes[64 + i] = reserved_bytes[i];
            bytes[72 + i] = position_bytes[i];
            bytes[80 + i] = entry_bytes[i];
        }
        SHA3_256::new().digest(&bytes)
    }

    #[instruction]
    pub fn open_balance(
        owner: [u8; 32],
        recovery_key: ArcisX25519Pubkey,
    ) -> (Enc<Mxe, BalanceState>, Enc<Shared, BalanceState>, [u8; 32]) {
        let state = BalanceState {
            amount: 0,
            salt: ArcisRNG::gen_uniform::<u128>(),
        };
        let digest = balance_hash(state, owner, 0);
        (
            Mxe::get().from_arcis(state),
            Shared::new(recovery_key).from_arcis(state),
            digest.reveal(),
        )
    }

    #[instruction]
    pub fn credit_balance(
        encrypted: Enc<Mxe, BalanceState>,
        amount: u64,
        owner: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, BalanceState>,
        Enc<Shared, BalanceState>,
        [u8; 32],
        bool,
    ) {
        let current = encrypted.to_arcis();
        let sum = current.amount + amount;
        let valid = amount > 0 && sum >= current.amount;
        let state = BalanceState {
            amount: if valid { sum } else { current.amount },
            salt: ArcisRNG::gen_uniform::<u128>(),
        };
        let digest = balance_hash(state, owner, version + 1);
        (
            encrypted.owner.from_arcis(state),
            Shared::new(recovery_key).from_arcis(state),
            digest.reveal(),
            valid.reveal(),
        )
    }

    #[instruction]
    pub fn debit_balance(
        encrypted: Enc<Mxe, BalanceState>,
        amount: u64,
        owner: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, BalanceState>,
        Enc<Shared, BalanceState>,
        [u8; 32],
        bool,
    ) {
        let current = encrypted.to_arcis();
        let valid = amount > 0 && current.amount >= amount;
        let state = BalanceState {
            amount: if valid {
                current.amount - amount
            } else {
                current.amount
            },
            salt: ArcisRNG::gen_uniform::<u128>(),
        };
        let digest = balance_hash(state, owner, version + 1);
        (
            encrypted.owner.from_arcis(state),
            Shared::new(recovery_key).from_arcis(state),
            digest.reveal(),
            valid.reveal(),
        )
    }

    #[instruction]
    pub fn view_balance(
        encrypted: Enc<Mxe, BalanceState>,
        view_key: ArcisX25519Pubkey,
    ) -> Enc<Shared, u64> {
        Shared::new(view_key).from_arcis(encrypted.to_arcis().amount)
    }

    #[instruction]
    pub fn open_market(
        account: [u8; 32],
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, Pack<MarketState>>,
        Enc<Shared, Pack<MarketState>>,
        [u8; 32],
    ) {
        let state = MarketState {
            collateral: 0,
            reserved: 0,
            position: 0,
            entry_price: 0,
            funding_checkpoint: 0,
            salt: ArcisRNG::gen_uniform::<u128>(),
        };
        let digest = market_hash(state, account, 0);
        (
            Mxe::get().from_arcis(Pack::new(state)),
            Shared::new(recovery_key).from_arcis(Pack::new(state)),
            digest.reveal(),
        )
    }

    #[instruction]
    pub fn view_market(
        encrypted: Enc<Mxe, Pack<MarketState>>,
        view_key: ArcisX25519Pubkey,
    ) -> Enc<Shared, Pack<MarketState>> {
        Shared::new(view_key).from_arcis(encrypted.to_arcis())
    }

    #[instruction]
    pub fn view_fill(
        encrypted: Enc<Mxe, Pack<TradePlan>>,
        view_key: ArcisX25519Pubkey,
    ) -> Enc<Shared, Pack<TradePlan>> {
        Shared::new(view_key).from_arcis(encrypted.to_arcis())
    }

    #[instruction]
    pub fn open_clearing(
        market: [u8; 32],
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, Pack<ClearingState>>,
        Enc<Shared, Pack<ClearingState>>,
        [u8; 32],
    ) {
        let state = ClearingState {
            insurance: 0,
            open_interest: 0,
            protocol_fees: 0,
            app_fees: 0,
            salt: ArcisRNG::gen_uniform::<u128>(),
        };
        let digest = clearing_hash(state, market, 0);
        (
            Mxe::get().from_arcis(Pack::new(state)),
            Shared::new(recovery_key).from_arcis(Pack::new(state)),
            digest.reveal(),
        )
    }

    #[instruction]
    pub fn credit_insurance(
        encrypted: Enc<Mxe, Pack<ClearingState>>,
        amount: u64,
        market: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, Pack<ClearingState>>,
        Enc<Shared, Pack<ClearingState>>,
        [u8; 32],
        bool,
    ) {
        let current = encrypted.to_arcis().unpack();
        let sum = current.insurance + amount;
        let valid = amount > 0 && sum >= current.insurance;
        let mut state = current;
        if valid {
            state.insurance = sum;
        }
        state.salt = ArcisRNG::gen_uniform::<u128>();
        let digest = clearing_hash(state, market, version + 1);
        (
            encrypted.owner.from_arcis(Pack::new(state)),
            Shared::new(recovery_key).from_arcis(Pack::new(state)),
            digest.reveal(),
            valid.reveal(),
        )
    }

    #[instruction]
    pub fn debit_free(
        encrypted: Enc<Mxe, BalanceState>,
        amount: u64,
        owner: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, BalanceState>,
        Enc<Shared, BalanceState>,
        [u8; 32],
        bool,
    ) {
        let current = encrypted.to_arcis();
        let valid = amount > 0 && current.amount >= amount;
        let state = BalanceState {
            amount: if valid {
                current.amount - amount
            } else {
                current.amount
            },
            salt: ArcisRNG::gen_uniform::<u128>(),
        };
        let digest = balance_hash(state, owner, version + 1);
        (
            encrypted.owner.from_arcis(state),
            Shared::new(recovery_key).from_arcis(state),
            digest.reveal(),
            valid.reveal(),
        )
    }

    #[instruction]
    pub fn credit_free(
        encrypted: Enc<Mxe, BalanceState>,
        amount: u64,
        owner: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, BalanceState>,
        Enc<Shared, BalanceState>,
        [u8; 32],
        bool,
    ) {
        let current = encrypted.to_arcis();
        let sum = current.amount + amount;
        let valid = amount > 0 && sum >= current.amount;
        let state = BalanceState {
            amount: if valid { sum } else { current.amount },
            salt: ArcisRNG::gen_uniform::<u128>(),
        };
        let digest = balance_hash(state, owner, version + 1);
        (
            encrypted.owner.from_arcis(state),
            Shared::new(recovery_key).from_arcis(state),
            digest.reveal(),
            valid.reveal(),
        )
    }

    #[instruction]
    pub fn debit_market(
        encrypted: Enc<Mxe, Pack<MarketState>>,
        amount: u64,
        oracle_price: u64,
        funding_index: i128,
        initial_margin_bps: u16,
        account: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, Pack<MarketState>>,
        Enc<Shared, Pack<MarketState>>,
        [u8; 32],
        bool,
    ) {
        let current = encrypted.to_arcis().unpack();
        let position = current.position as i128;
        let absolute = if position < 0 { -position } else { position } as u128;
        let unrealised =
            position * (oracle_price as i128 - current.entry_price as i128) / 100_000_000_000i128;
        let funding = position * (funding_index - current.funding_checkpoint) / 100_000_000_000i128;
        let loss = if unrealised < 0 { unrealised } else { 0 };
        let equity = current.collateral as i128 - amount as i128 + loss - funding;
        let required = (absolute * oracle_price as u128 * initial_margin_bps as u128
            + 999_999_999_999_999u128)
            / 1_000_000_000_000_000u128
            + current.reserved as u128;
        let healthy = current.position == 0 && current.reserved == 0
            || oracle_price > 0
                && initial_margin_bps > 0
                && initial_margin_bps <= 10_000
                && equity >= 0
                && equity as u128 >= required;
        let valid = amount > 0 && current.collateral >= amount && healthy;
        let mut state = current;
        if valid {
            state.collateral = current.collateral - amount;
        }
        state.salt = ArcisRNG::gen_uniform::<u128>();
        let digest = market_hash(state, account, version + 1);
        (
            encrypted.owner.from_arcis(Pack::new(state)),
            Shared::new(recovery_key).from_arcis(Pack::new(state)),
            digest.reveal(),
            valid.reveal(),
        )
    }

    #[instruction]
    pub fn credit_market(
        encrypted: Enc<Mxe, Pack<MarketState>>,
        amount: u64,
        account: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, Pack<MarketState>>,
        Enc<Shared, Pack<MarketState>>,
        [u8; 32],
        bool,
    ) {
        let current = encrypted.to_arcis().unpack();
        let sum = current.collateral + amount;
        let valid = amount > 0 && sum >= current.collateral;
        let mut state = current;
        if valid {
            state.collateral = sum;
        }
        state.salt = ArcisRNG::gen_uniform::<u128>();
        let digest = market_hash(state, account, version + 1);
        (
            encrypted.owner.from_arcis(Pack::new(state)),
            Shared::new(recovery_key).from_arcis(Pack::new(state)),
            digest.reveal(),
            valid.reveal(),
        )
    }

    #[instruction]
    pub fn prepare_quote(
        input: Enc<Shared, QuoteCurve>,
        oracle_price: u64,
        deviation_bps: u16,
        tier_count: u8,
    ) -> (Enc<Mxe, Pack<QuoteCurve>>, bool) {
        let quote = input.to_arcis();
        let mut valid =
            oracle_price > 0 && deviation_bps <= 1_000 && tier_count > 0 && tier_count <= 4;
        let lower = oracle_price as u128 * (10_000u128 - deviation_bps as u128);
        let upper = oracle_price as u128 * (10_000u128 + deviation_bps as u128);
        for i in 0..4 {
            if i < tier_count as usize {
                valid = valid
                    && quote.bid[i] > 0
                    && quote.ask[i] > quote.bid[i]
                    && quote.bid[i] as u128 * 10_000u128 >= lower
                    && quote.ask[i] as u128 * 10_000u128 <= upper;
                if i > 0 {
                    valid = valid
                        && quote.bid[i] <= quote.bid[i - 1]
                        && quote.ask[i] >= quote.ask[i - 1];
                }
            } else {
                valid = valid && quote.bid[i] == 0 && quote.ask[i] == 0;
            }
        }
        (Mxe::get().from_arcis(Pack::new(quote)), valid.reveal())
    }

    #[instruction]
    pub fn match_order(
        order_input: Enc<Shared, Pack<OrderInput>>,
        trader_cipher: Enc<Mxe, Pack<MarketState>>,
        trader_version: u64,
        quote_0: Enc<Mxe, Pack<QuoteCurve>>,
        quote_1: Enc<Mxe, Pack<QuoteCurve>>,
        quote_2: Enc<Mxe, Pack<QuoteCurve>>,
        quote_3: Enc<Mxe, Pack<QuoteCurve>>,
        active_count: u8,
        capacities: [u64; 4],
        tier_counts: [u8; 4],
        self_matches: [bool; 4],
        size_tiers: [u64; 4],
        oracle_price: u64,
        initial_margin_bps: u16,
        trade_fee_bps: u16,
        insurance_fee_bps: u16,
        app_fee_bps: u16,
        max_deviation_bps: u16,
        max_account_notional: u64,
        order_key: [u8; 32],
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, Pack<TradePlan>>,
        Enc<Shared, FeeRecovery>,
        [u8; 32],
        u8,
        bool,
    ) {
        let order = order_input.to_arcis().unpack();
        let trader = trader_cipher.to_arcis().unpack();
        let position = trader.position as i128;
        let absolute = if position < 0 { -position } else { position } as u64;
        let opposite = (position > 0 && order.side == -1) || (position < 0 && order.side == 1);
        let intent_valid = if order.intent == 0 {
            position == 0 || !opposite
        } else if order.intent == 1 {
            opposite && order.size <= absolute
        } else if order.intent == 2 {
            opposite && order.size == absolute
        } else if order.intent == 3 {
            opposite && order.size > absolute
        } else {
            false
        };
        let quotes = [
            quote_0.to_arcis().unpack(),
            quote_1.to_arcis().unpack(),
            quote_2.to_arcis().unpack(),
            quote_3.to_arcis().unpack(),
        ];
        let reference_notional = order.size as u128 * oracle_price as u128 / 100_000_000_000u128;
        let mut tier = 4usize;
        for index in 0..4 {
            if tier == 4 && reference_notional <= size_tiers[index] as u128 {
                tier = index;
            }
        }
        let valid_order = intent_valid
            && order.version == trader_version
            && (order.side == 1 || order.side == -1)
            && order.size > 0
            && order.margin > 0
            && order.limit_price > 0
            && oracle_price > 0
            && active_count > 0
            && active_count <= 4
            && tier < 4
            && initial_margin_bps > 0
            && initial_margin_bps <= 10_000
            && trade_fee_bps == 5
            && insurance_fee_bps == 1
            && app_fee_bps <= 2
            && max_deviation_bps <= 1_000;
        let mut selected = 255u8;
        let mut execution_price = 0u64;
        let mut execution_fee = 0u64;
        let mut execution_insurance_fee = 0u64;
        let mut execution_app_fee = 0u64;
        let mut execution_maker_rebate = 0u64;
        for index in 0..4 {
            let mut price = 0u64;
            for price_tier in 0..4 {
                if tier == price_tier {
                    price = if order.side == 1 {
                        quotes[index].ask[price_tier]
                    } else {
                        quotes[index].bid[price_tier]
                    };
                }
            }
            let notional = order.size as u128 * price as u128 / 100_000_000_000u128;
            let fee = (notional * (trade_fee_bps + app_fee_bps) as u128 + 9_999u128) / 10_000u128;
            let insurance_fee = notional * insurance_fee_bps as u128 / 10_000u128;
            let app_fee = notional * app_fee_bps as u128 / 10_000u128;
            let maker_rebate = notional / 10_000u128;
            let opening_size = if order.intent == 1 || order.intent == 2 {
                0u64
            } else if order.intent == 3 {
                if order.size > absolute {
                    order.size - absolute
                } else {
                    0
                }
            } else {
                order.size
            };
            let opening_notional = opening_size as u128 * price as u128 / 100_000_000_000u128;
            let initial_margin =
                (opening_notional * initial_margin_bps as u128 + 9_999u128) / 10_000u128;
            let lower = oracle_price as u128 * (10_000u128 - max_deviation_bps as u128);
            let upper = oracle_price as u128 * (10_000u128 + max_deviation_bps as u128);
            let eligible = valid_order
                && index < active_count as usize
                && !self_matches[index]
                && tier < tier_counts[index] as usize
                && price > 0
                && price as u128 * 10_000u128 >= lower
                && price as u128 * 10_000u128 <= upper
                && notional > 0
                && notional <= capacities[index] as u128
                && notional <= max_account_notional as u128
                && fee <= order.max_fee as u128
                && fee <= u64::MAX as u128
                && insurance_fee + app_fee + maker_rebate <= fee
                && initial_margin + fee <= order.margin as u128
                && if order.side == 1 {
                    price <= order.limit_price
                } else {
                    price >= order.limit_price
                };
            let better = selected == 255
                || if order.side == 1 {
                    price < execution_price
                } else {
                    price > execution_price
                };
            if eligible && better {
                selected = index as u8;
                execution_price = price;
                execution_fee = fee as u64;
                execution_insurance_fee = insurance_fee as u64;
                execution_app_fee = app_fee as u64;
                execution_maker_rebate = maker_rebate as u64;
            }
        }
        let filled = valid_order && selected < 4;
        let plan = TradePlan {
            side: if filled { order.side } else { 0 },
            size: if filled { order.size } else { 0 },
            margin: if filled { order.margin } else { 0 },
            execution_price: if filled { execution_price } else { 0 },
            fee: if filled { execution_fee } else { 0 },
            insurance_fee: if filled { execution_insurance_fee } else { 0 },
            app_fee: if filled { execution_app_fee } else { 0 },
            maker_rebate: if filled { execution_maker_rebate } else { 0 },
        };
        let allocated =
            plan.insurance_fee as u128 + plan.app_fee as u128 + plan.maker_rebate as u128;
        let receipt = FeeRecovery {
            protocol_fee: if filled && allocated <= plan.fee as u128 {
                (plan.fee as u128 - allocated) as u64
            } else {
                0
            },
            app_fee: plan.app_fee,
            salt: ArcisRNG::gen_uniform::<u128>(),
        };
        (
            Mxe::get().from_arcis(Pack::new(plan)),
            Shared::new(recovery_key).from_arcis(receipt),
            fee_hash(receipt, order_key).reveal(),
            selected.reveal(),
            filled.reveal(),
        )
    }

    fn weighted_price(numerator: u128, denominator: u128) -> u64 {
        let mut remainder = numerator;
        let mut probe = denominator << 46;
        let mut quotient = 0u64;
        let mut bit = 1u64 << 46;
        for _ in 0..47 {
            if remainder >= probe {
                remainder -= probe;
                quotient |= bit;
            }
            probe >>= 1;
            bit >>= 1;
        }
        quotient
    }

    fn enter_leg(
        current: MarketState,
        plan: TradePlan,
        delta: i128,
    ) -> (MarketState, i128, i128, bool) {
        let old = current.position as i128;
        let next = old + delta;
        let size = plan.size as i128;
        let old_size = if old < 0 { -old } else { old };
        let next_size = if next < 0 { -next } else { next };
        let closing = if old != 0 && ((old > 0 && delta < 0) || (old < 0 && delta > 0)) {
            if size < old_size {
                size
            } else {
                old_size
            }
        } else {
            0i128
        };
        let price_delta = plan.execution_price as i128 - current.entry_price as i128;
        let realised = if old > 0 {
            closing * price_delta / 100_000_000_000i128
        } else {
            -closing * price_delta / 100_000_000_000i128
        };
        let entry = if next == 0 {
            0u64
        } else if old == 0 || (old > 0 && next < 0) || (old < 0 && next > 0) {
            plan.execution_price
        } else if closing > 0 {
            current.entry_price
        } else {
            let basis = old_size as u128 * current.entry_price as u128
                + size as u128 * plan.execution_price as u128;
            weighted_price(basis, next_size as u128)
        };
        let mut updated = current;
        updated.position = next as i64;
        updated.entry_price = entry;
        let valid = (plan.side == 1 || plan.side == -1)
            && plan.size > 0
            && plan.execution_price > 0
            && (plan.insurance_fee as u128 + plan.app_fee as u128 + plan.maker_rebate as u128)
                <= plan.fee as u128
            && next >= -1_000_000_000_000_000_000i128
            && next <= 1_000_000_000_000_000_000i128;
        (updated, realised, next_size - old_size, valid)
    }

    #[instruction]
    pub fn settle_trade(
        plan_cipher: Enc<Mxe, Pack<TradePlan>>,
        trader_cipher: Enc<Mxe, Pack<MarketState>>,
        maker_cipher: Enc<Mxe, Pack<MarketState>>,
        clearing_cipher: Enc<Mxe, Pack<ClearingState>>,
        quote_reserve: u64,
        oracle_price: u64,
        funding_index: i128,
        initial_margin_bps: u16,
        max_account_notional: u64,
        max_market_notional: u64,
    ) -> (
        Enc<Mxe, Pack<MarketState>>,
        Enc<Mxe, Pack<MarketState>>,
        Enc<Mxe, Pack<ClearingState>>,
        bool,
    ) {
        let plan = plan_cipher.to_arcis().unpack();
        let trader = trader_cipher.to_arcis().unpack();
        let maker = maker_cipher.to_arcis().unpack();
        let clearing = clearing_cipher.to_arcis().unpack();
        let (mut trader_next, trader_realised, trader_oi, trader_valid) =
            enter_leg(trader, plan, plan.size as i128 * plan.side as i128);
        let (mut maker_next, maker_realised, maker_oi, maker_valid) =
            enter_leg(maker, plan, -(plan.size as i128 * plan.side as i128));
        let trader_funding = trader.position as i128 * (funding_index - trader.funding_checkpoint)
            / 100_000_000_000i128;
        let maker_funding = maker.position as i128 * (funding_index - maker.funding_checkpoint)
            / 100_000_000_000i128;
        let trader_cash = trader_realised - trader_funding - plan.fee as i128;
        let maker_cash = maker_realised - maker_funding + plan.maker_rebate as i128;
        let trader_balance = trader.collateral as i128 + trader_cash;
        let maker_balance = maker.collateral as i128 + maker_cash;
        let allocated =
            plan.insurance_fee as u128 + plan.app_fee as u128 + plan.maker_rebate as u128;
        let protocol_fee = if allocated <= plan.fee as u128 {
            plan.fee as u128 - allocated
        } else {
            0
        };
        let insurance_balance = clearing.insurance as i128
            - trader_cash
            - maker_cash
            - protocol_fee as i128
            - plan.app_fee as i128;
        let protocol_fees = clearing.protocol_fees as u128 + protocol_fee;
        let app_fees = clearing.app_fees as u128 + plan.app_fee as u128;
        let reserve_valid = maker.reserved >= quote_reserve;
        trader_next.collateral = trader_balance as u64;
        trader_next.funding_checkpoint = funding_index;
        maker_next.collateral = maker_balance as u64;
        maker_next.reserved = if reserve_valid {
            maker.reserved - quote_reserve
        } else {
            maker.reserved
        };
        maker_next.funding_checkpoint = funding_index;
        let mut valid = trader_valid
            && maker_valid
            && reserve_valid
            && trader_balance >= 0
            && trader_balance <= u64::MAX as i128
            && maker_balance >= 0
            && maker_balance <= u64::MAX as i128
            && insurance_balance >= 0
            && insurance_balance <= u64::MAX as i128
            && allocated <= plan.fee as u128
            && protocol_fees <= u64::MAX as u128
            && app_fees <= u64::MAX as u128
            && plan.margin <= trader.collateral;
        for state in [trader_next, maker_next] {
            let position = state.position as i128;
            let absolute = if position < 0 { -position } else { position } as u128;
            let marked_value = absolute * oracle_price as u128;
            let unrealised =
                position * (oracle_price as i128 - state.entry_price as i128) / 100_000_000_000i128;
            let equity = state.collateral as i128 + unrealised;
            let required = (marked_value * initial_margin_bps as u128 + 999_999_999_999_999u128)
                / 1_000_000_000_000_000u128
                + state.reserved as u128;
            valid = valid
                && marked_value < (max_account_notional as u128 + 1) * 100_000_000_000u128
                && equity >= 0
                && equity as u128 >= required;
        }
        let oi_change = trader_oi + maker_oi;
        let open_interest = clearing.open_interest as i128 + oi_change / 2;
        valid = valid
            && oi_change % 2 == 0
            && open_interest >= 0
            && open_interest <= u64::MAX as i128
            && (open_interest as u128) * (oracle_price as u128)
                < (max_market_notional as u128 + 1) * 100_000_000_000u128;
        let mut clearing_next = clearing;
        if valid {
            clearing_next.insurance = insurance_balance as u64;
            clearing_next.open_interest = open_interest as u64;
            clearing_next.protocol_fees = protocol_fees as u64;
            clearing_next.app_fees = app_fees as u64;
        } else {
            trader_next = trader;
            maker_next = maker;
        }
        (
            trader_cipher.owner.from_arcis(Pack::new(trader_next)),
            maker_cipher.owner.from_arcis(Pack::new(maker_next)),
            clearing_cipher.owner.from_arcis(Pack::new(clearing_next)),
            valid.reveal(),
        )
    }

    #[instruction]
    pub fn claim_trade_fees(
        plan_cipher: Enc<Mxe, Pack<TradePlan>>,
        clearing_cipher: Enc<Mxe, Pack<ClearingState>>,
        protocol_cipher: Enc<Mxe, BalanceState>,
        app_cipher: Enc<Mxe, BalanceState>,
    ) -> (
        Enc<Mxe, Pack<ClearingState>>,
        Enc<Mxe, BalanceState>,
        Enc<Mxe, BalanceState>,
        bool,
    ) {
        let plan = plan_cipher.to_arcis().unpack();
        let mut clearing = clearing_cipher.to_arcis().unpack();
        let mut protocol = protocol_cipher.to_arcis();
        let mut app = app_cipher.to_arcis();
        let allocated =
            plan.insurance_fee as u128 + plan.app_fee as u128 + plan.maker_rebate as u128;
        let protocol_fee = if allocated <= plan.fee as u128 {
            plan.fee as u128 - allocated
        } else {
            0
        };
        let valid_allocation = allocated <= plan.fee as u128;
        let valid_protocol_pool = protocol_fee <= clearing.protocol_fees as u128;
        let valid_app_pool = plan.app_fee <= clearing.app_fees;
        let valid_protocol_capacity = protocol.amount as u128 + protocol_fee <= u64::MAX as u128;
        let valid_app_capacity = app.amount as u128 + plan.app_fee as u128 <= u64::MAX as u128;
        let valid = valid_allocation
            && valid_protocol_pool
            && valid_app_pool
            && valid_protocol_capacity
            && valid_app_capacity;
        if valid {
            clearing.protocol_fees -= protocol_fee as u64;
            clearing.app_fees -= plan.app_fee;
            protocol.amount += protocol_fee as u64;
            app.amount += plan.app_fee;
        }
        clearing.salt = ArcisRNG::gen_uniform::<u128>();
        protocol.salt = ArcisRNG::gen_uniform::<u128>();
        app.salt = ArcisRNG::gen_uniform::<u128>();
        (
            clearing_cipher.owner.from_arcis(Pack::new(clearing)),
            protocol_cipher.owner.from_arcis(protocol),
            app_cipher.owner.from_arcis(app),
            valid.reveal(),
        )
    }

    #[instruction]
    pub fn seal_trade_fees(
        clearing_cipher: Enc<Mxe, Pack<ClearingState>>,
        protocol_cipher: Enc<Mxe, BalanceState>,
        app_cipher: Enc<Mxe, BalanceState>,
        market: [u8; 32],
        clearing_version: u64,
        clearing_recovery_key: ArcisX25519Pubkey,
        protocol_owner: [u8; 32],
        protocol_version: u64,
        protocol_recovery_key: ArcisX25519Pubkey,
        app_owner: [u8; 32],
        app_version: u64,
        app_recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Shared, Pack<ClearingState>>,
        [u8; 32],
        Enc<Shared, BalanceState>,
        [u8; 32],
        Enc<Shared, BalanceState>,
        [u8; 32],
    ) {
        let clearing = clearing_cipher.to_arcis().unpack();
        let protocol = protocol_cipher.to_arcis();
        let app = app_cipher.to_arcis();
        (
            Shared::new(clearing_recovery_key).from_arcis(Pack::new(clearing)),
            clearing_hash(clearing, market, clearing_version + 1).reveal(),
            Shared::new(protocol_recovery_key).from_arcis(protocol),
            balance_hash(protocol, protocol_owner, protocol_version + 1).reveal(),
            Shared::new(app_recovery_key).from_arcis(app),
            balance_hash(app, app_owner, app_version + 1).reveal(),
        )
    }

    #[instruction]
    pub fn liquidate(
        target_cipher: Enc<Mxe, Pack<MarketState>>,
        backstop_cipher: Enc<Mxe, Pack<MarketState>>,
        clearing_cipher: Enc<Mxe, Pack<ClearingState>>,
        offer_margin: u64,
        offer_capacity: u64,
        oracle_price: u64,
        funding_index: i128,
        maintenance_margin_bps: u16,
        initial_margin_bps: u16,
        liquidation_fee_bps: u16,
        max_account_notional: u64,
    ) -> (
        Enc<Mxe, Pack<MarketState>>,
        Enc<Mxe, Pack<MarketState>>,
        Enc<Mxe, Pack<ClearingState>>,
        bool,
        bool,
    ) {
        let target = target_cipher.to_arcis().unpack();
        let backstop = backstop_cipher.to_arcis().unpack();
        let clearing = clearing_cipher.to_arcis().unpack();
        let size = if target.position < 0 {
            -(target.position as i128)
        } else {
            target.position as i128
        };
        let notional = size as u128 * oracle_price as u128;
        let maintenance = (notional * maintenance_margin_bps as u128 + 999_999_999_999_999u128)
            / 1_000_000_000_000_000u128;
        let realised = target.position as i128
            * (oracle_price as i128 - target.entry_price as i128)
            / 100_000_000_000i128;
        let funding = target.position as i128 * (funding_index - target.funding_checkpoint)
            / 100_000_000_000i128;
        let equity = target.collateral as i128 + realised - funding;
        let distressed = target.position != 0 && equity < maintenance as i128;
        let fee = (notional * liquidation_fee_bps as u128 + 999_999_999_999_999u128)
            / 1_000_000_000_000_000u128;
        let residual = equity - fee as i128;
        let target_collateral = if residual > 0 { residual } else { 0 };
        let plan = TradePlan {
            side: if target.position > 0 { 1 } else { -1 },
            size: size as u64,
            margin: 0,
            execution_price: oracle_price,
            fee: 0,
            insurance_fee: 0,
            app_fee: 0,
            maker_rebate: 0,
        };
        let (mut backstop_next, backstop_realised, backstop_oi, backstop_valid) =
            enter_leg(backstop, plan, target.position as i128);
        let backstop_funding = backstop.position as i128
            * (funding_index - backstop.funding_checkpoint)
            / 100_000_000_000i128;
        let backstop_collateral =
            backstop.collateral as i128 + backstop_realised - backstop_funding;
        let reserve_valid = backstop.reserved >= offer_margin;
        backstop_next.reserved = if reserve_valid {
            backstop.reserved - offer_margin
        } else {
            backstop.reserved
        };
        backstop_next.funding_checkpoint = funding_index;
        let backstop_size = if backstop_next.position < 0 {
            -(backstop_next.position as i128)
        } else {
            backstop_next.position as i128
        } as u128;
        let backstop_notional = backstop_size * oracle_price as u128;
        let backstop_unrealised = backstop_next.position as i128
            * (oracle_price as i128 - backstop_next.entry_price as i128)
            / 100_000_000_000i128;
        let backstop_required = (backstop_notional * initial_margin_bps as u128
            + 999_999_999_999_999u128)
            / 1_000_000_000_000_000u128
            + backstop_next.reserved as u128;
        let unsettled_insurance =
            clearing.insurance as i128 + target.collateral as i128 + backstop.collateral as i128
                - target_collateral
                - backstop_collateral;
        let backstop_cover = if unsettled_insurance < 0 {
            -unsettled_insurance
        } else {
            0
        };
        let backstop_after = backstop_collateral - backstop_cover;
        let insurance = unsettled_insurance + backstop_cover;
        backstop_next.collateral = backstop_after as u64;
        let oi_change = backstop_oi - size;
        let open_interest = clearing.open_interest as i128 + oi_change / 2;
        let valid = distressed
            && target.reserved == 0
            && notional <= offer_capacity as u128 * 100_000_000_000u128
            && target_collateral <= u64::MAX as i128
            && backstop_valid
            && reserve_valid
            && backstop_cover <= offer_margin as i128
            && backstop_after >= 0
            && backstop_after <= u64::MAX as i128
            && backstop_notional < (max_account_notional as u128 + 1) * 100_000_000_000u128
            && backstop_after + backstop_unrealised >= 0
            && (backstop_after + backstop_unrealised) as u128 >= backstop_required
            && insurance >= 0
            && insurance <= u64::MAX as i128
            && oi_change % 2 == 0
            && open_interest >= 0
            && open_interest <= u64::MAX as i128;
        let mut target_next = target;
        let mut clearing_next = clearing;
        if valid {
            target_next.collateral = target_collateral as u64;
            target_next.position = 0;
            target_next.entry_price = 0;
            target_next.funding_checkpoint = funding_index;
            clearing_next.insurance = insurance as u64;
            clearing_next.open_interest = open_interest as u64;
        } else {
            backstop_next = backstop;
        }
        (
            target_cipher.owner.from_arcis(Pack::new(target_next)),
            backstop_cipher.owner.from_arcis(Pack::new(backstop_next)),
            clearing_cipher.owner.from_arcis(Pack::new(clearing_next)),
            distressed.reveal(),
            valid.reveal(),
        )
    }

    #[instruction]
    pub fn seal_market(
        encrypted: Enc<Mxe, Pack<MarketState>>,
        account: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, Pack<MarketState>>,
        Enc<Shared, Pack<MarketState>>,
        [u8; 32],
    ) {
        let mut state = encrypted.to_arcis().unpack();
        state.salt = ArcisRNG::gen_uniform::<u128>();
        let digest = market_hash(state, account, version + 1);
        (
            encrypted.owner.from_arcis(Pack::new(state)),
            Shared::new(recovery_key).from_arcis(Pack::new(state)),
            digest.reveal(),
        )
    }

    #[instruction]
    pub fn seal_clearing(
        encrypted: Enc<Mxe, Pack<ClearingState>>,
        market: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, Pack<ClearingState>>,
        Enc<Shared, Pack<ClearingState>>,
        [u8; 32],
    ) {
        let mut state = encrypted.to_arcis().unpack();
        state.salt = ArcisRNG::gen_uniform::<u128>();
        let digest = clearing_hash(state, market, version + 1);
        (
            encrypted.owner.from_arcis(Pack::new(state)),
            Shared::new(recovery_key).from_arcis(Pack::new(state)),
            digest.reveal(),
        )
    }

    #[instruction]
    pub fn reserve_quote(
        encrypted: Enc<Mxe, Pack<MarketState>>,
        required: u64,
        oracle_price: u64,
        funding_index: i128,
        initial_margin_bps: u16,
        account: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, Pack<MarketState>>,
        Enc<Shared, Pack<MarketState>>,
        [u8; 32],
        bool,
    ) {
        let current = encrypted.to_arcis().unpack();
        let signed = current.position as i128;
        let absolute = if signed < 0 { -signed } else { signed } as u128;
        let marked_value = absolute * oracle_price as u128;
        let position_margin = (marked_value * initial_margin_bps as u128 + 999_999_999_999_999u128)
            / 1_000_000_000_000_000u128;
        let new_reserved = current.reserved as u128 + required as u128;
        let unrealised =
            signed * (oracle_price as i128 - current.entry_price as i128) / 100_000_000_000i128;
        let funding_due =
            signed * (funding_index - current.funding_checkpoint) / 100_000_000_000i128;
        let equity = current.collateral as i128 + unrealised - funding_due;
        let valid = required > 0
            && initial_margin_bps > 0
            && initial_margin_bps <= 10_000
            && oracle_price >= 100_000_000
            && oracle_price <= 100_000_000_000_000
            && funding_index >= -1_000_000_000_000_000_000i128
            && funding_index <= 1_000_000_000_000_000_000i128
            && equity >= 0
            && new_reserved + position_margin <= equity as u128
            && new_reserved <= u64::MAX as u128;
        let mut state = current;
        if valid {
            state.reserved = new_reserved as u64;
        }
        state.salt = ArcisRNG::gen_uniform::<u128>();
        let digest = market_hash(state, account, version + 1);
        (
            encrypted.owner.from_arcis(Pack::new(state)),
            Shared::new(recovery_key).from_arcis(Pack::new(state)),
            digest.reveal(),
            valid.reveal(),
        )
    }

    #[instruction]
    pub fn release_quote(
        encrypted: Enc<Mxe, Pack<MarketState>>,
        required: u64,
        account: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, Pack<MarketState>>,
        Enc<Shared, Pack<MarketState>>,
        [u8; 32],
        bool,
    ) {
        let current = encrypted.to_arcis().unpack();
        let valid = required > 0 && current.reserved >= required;
        let mut state = current;
        if valid {
            state.reserved = current.reserved - required;
        }
        state.salt = ArcisRNG::gen_uniform::<u128>();
        let digest = market_hash(state, account, version + 1);
        (
            encrypted.owner.from_arcis(Pack::new(state)),
            Shared::new(recovery_key).from_arcis(Pack::new(state)),
            digest.reveal(),
            valid.reveal(),
        )
    }
    #[instruction]
    pub fn offer_backstop(
        encrypted: Enc<Mxe, Pack<MarketState>>,
        required: u64,
        oracle_price: u64,
        funding_index: i128,
        initial_margin_bps: u16,
        account: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, Pack<MarketState>>,
        Enc<Shared, Pack<MarketState>>,
        [u8; 32],
        bool,
    ) {
        let current = encrypted.to_arcis().unpack();
        let signed = current.position as i128;
        let absolute = if signed < 0 { -signed } else { signed } as u128;
        let marked_value = absolute * oracle_price as u128;
        let position_margin = (marked_value * initial_margin_bps as u128 + 999_999_999_999_999u128)
            / 1_000_000_000_000_000u128;
        let new_reserved = current.reserved as u128 + required as u128;
        let unrealised =
            signed * (oracle_price as i128 - current.entry_price as i128) / 100_000_000_000i128;
        let funding_due =
            signed * (funding_index - current.funding_checkpoint) / 100_000_000_000i128;
        let equity = current.collateral as i128 + unrealised - funding_due;
        let valid = required > 0
            && initial_margin_bps > 0
            && initial_margin_bps <= 10_000
            && oracle_price >= 100_000_000
            && oracle_price <= 100_000_000_000_000
            && funding_index >= -1_000_000_000_000_000_000i128
            && funding_index <= 1_000_000_000_000_000_000i128
            && equity >= 0
            && new_reserved + position_margin <= equity as u128
            && new_reserved <= u64::MAX as u128;
        let mut state = current;
        if valid {
            state.reserved = new_reserved as u64;
        }
        state.salt = ArcisRNG::gen_uniform::<u128>();
        let digest = market_hash(state, account, version + 1);
        (
            encrypted.owner.from_arcis(Pack::new(state)),
            Shared::new(recovery_key).from_arcis(Pack::new(state)),
            digest.reveal(),
            valid.reveal(),
        )
    }

    #[instruction]
    pub fn release_backstop(
        encrypted: Enc<Mxe, Pack<MarketState>>,
        required: u64,
        account: [u8; 32],
        version: u64,
        recovery_key: ArcisX25519Pubkey,
    ) -> (
        Enc<Mxe, Pack<MarketState>>,
        Enc<Shared, Pack<MarketState>>,
        [u8; 32],
        bool,
    ) {
        let current = encrypted.to_arcis().unpack();
        let valid = required > 0 && current.reserved >= required;
        let mut state = current;
        if valid {
            state.reserved = current.reserved - required;
        }
        state.salt = ArcisRNG::gen_uniform::<u128>();
        let digest = market_hash(state, account, version + 1);
        (
            encrypted.owner.from_arcis(Pack::new(state)),
            Shared::new(recovery_key).from_arcis(Pack::new(state)),
            digest.reveal(),
            valid.reveal(),
        )
    }
}
