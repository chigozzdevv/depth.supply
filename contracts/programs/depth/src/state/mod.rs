use anchor_lang::prelude::*;

use crate::error::ErrorCode;

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub market_id: [u8; 32],
    pub settlement_mint: Pubkey,
    pub vault: Pubkey,
    pub oracle_account: Pubkey,
    pub config: MarketConfig,
    pub revision: u64,
    pub funding_index: i128,
    pub last_funding_timestamp: i64,
    pub oracle_price_e8: u64,
    pub oracle_ema_e8: u64,
    pub oracle_confidence_e8: u64,
    pub oracle_timestamp: i64,
    pub oracle_slot: u64,
    pub active_quotes: [Pubkey; 4],
    pub active_quote_count: u8,
    pub quoted_notional: u64,
    pub backstop_offer: Pubkey,
    pub pending_orders: u16,
    pub pending_order: Pubkey,
    pub status: MarketStatus,
    pub incident: MarketIncident,
    pub bump: u8,
}

impl Market {
    pub fn pause(&mut self, incident: MarketIncident) {
        if self.status != MarketStatus::Paused {
            self.incident = incident;
        }
        self.status = MarketStatus::Paused;
    }

    pub fn begin_pending(&mut self, order: Pubkey) -> Result<()> {
        require!(
            order != Pubkey::default()
                && self.pending_orders == 0
                && self.pending_order == Pubkey::default(),
            ErrorCode::WrongOrderStatus
        );
        self.pending_orders = 1;
        self.pending_order = order;
        Ok(())
    }

    pub fn has_pending(&self, order: Pubkey) -> bool {
        self.pending_orders == 1 && self.pending_order == order
    }

    pub fn clear_pending(&mut self, order: Pubkey) -> Result<()> {
        require!(self.has_pending(order), ErrorCode::WrongOrderStatus);
        self.pending_orders = 0;
        self.pending_order = Pubkey::default();
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct QuoteQueue {
    pub market: Pubkey,
    pub entries: [Pubkey; 8],
    pub count: u8,
    pub bump: u8,
}

impl QuoteQueue {
    pub fn enqueue(&mut self, key: Pubkey) -> Result<()> {
        let count = usize::from(self.count);
        require!(count < self.entries.len(), ErrorCode::QuoteSnapshotFull);
        require!(
            !self.entries[..count].contains(&key),
            ErrorCode::InvalidQuote
        );
        self.entries[count] = key;
        self.count += 1;
        Ok(())
    }

    pub fn remove(&mut self, key: Pubkey) -> Result<()> {
        let count = usize::from(self.count);
        let index = self.entries[..count]
            .iter()
            .position(|entry| *entry == key)
            .ok_or(ErrorCode::InvalidQuote)?;
        for current in index..count - 1 {
            self.entries[current] = self.entries[current + 1];
        }
        self.entries[count - 1] = Pubkey::default();
        self.count -= 1;
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub struct MarketConfig {
    pub initial_margin_bps: u16,
    pub maintenance_margin_bps: u16,
    pub liquidation_fee_bps: u16,
    pub trade_fee_bps: u16,
    pub insurance_fee_bps: u16,
    pub max_account_notional: u64,
    pub max_market_notional: u64,
    pub max_oracle_age_seconds: u32,
    pub max_confidence_bps: u16,
    pub max_quote_deviation_bps: u16,
    pub max_quote_lifetime_seconds: u32,
    pub max_order_queue_seconds: u32,
    pub funding_interval_seconds: u32,
    pub funding_rate_cap_bps: u16,
    pub quote_tiers: [u64; 4],
    pub backstop_min_collateral: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    Draft,
    Active,
    Paused,
    Settling,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketIncident {
    None,
    ManualPause,
    StaleOracle,
    MissedFunding,
    ClusterUnavailable,
    CollateralDeficit,
    CallbackFailure,
    BackstopUnavailable,
}

#[account]
#[derive(InitSpace)]
pub struct RecoveryConfig {
    pub market: Pubkey,
    pub recovery_key: [u8; 32],
    pub signers: [Pubkey; 5],
    pub account_count: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Winddown {
    pub market: Pubkey,
    pub price_e8: u64,
    pub funding_index: i128,
    pub expected_accounts: u32,
    pub revealed_accounts: u32,
    pub paid_accounts: u32,
    pub open_interest: u64,
    pub insurance: u64,
    pub protocol_fees: u64,
    pub app_fees: u64,
    pub revealed_protocol_fees: u64,
    pub revealed_app_fees: u64,
    pub app_claims: u32,
    pub paid_app_claims: u32,
    pub protocol_fees_paid: bool,
    pub total_collateral: u128,
    pub gross_positive: u128,
    pub net_position: i128,
    pub absolute_position: u128,
    pub payout_pool: u64,
    pub remaining_pool: u64,
    pub finalized: bool,
    pub swept: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct WinddownClaim {
    pub winddown: Pubkey,
    pub market_account: Pubkey,
    pub owner: Pubkey,
    pub positive_equity: u128,
    pub paid: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct WinddownFeeClaim {
    pub winddown: Pubkey,
    pub order: Pubkey,
    pub app: Pubkey,
    pub amount: u64,
    pub paid: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Protocol {
    pub authority: Pubkey,
    pub settlement_mint: Pubkey,
    pub vault: Pubkey,
    pub pending_total: u64,
    pub credited_total: u64,
    pub escrow_total: u64,
    pub trading_enabled: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct AppConfig {
    pub app: Pubkey,
    pub fee_bps: u16,
    pub version: u64,
    pub active: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct OperatorGrant {
    pub maker: Pubkey,
    pub operator: Pubkey,
    pub market: Pubkey,
    pub max_capacity: u64,
    pub expires_at: i64,
    pub can_view: bool,
    pub active: bool,
    pub version: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DepositReceipt {
    pub owner: Pubkey,
    pub nonce: u64,
    pub amount: u64,
    pub status: DepositStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum DepositStatus {
    Pending,
    Crediting,
    Credited,
    Refunded,
}

#[account]
#[derive(InitSpace)]
pub struct WithdrawalReceipt {
    pub owner: Pubkey,
    pub balance: Pubkey,
    pub destination: Pubkey,
    pub computation: Pubkey,
    pub nonce: u64,
    pub amount: u64,
    pub version: u64,
    pub status: WithdrawalStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum WithdrawalStatus {
    Queued,
    Paid,
    Rejected,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct BalanceAccount {
    pub owner: Pubkey,
    pub recovery_key: [u8; 32],
    pub ciphertexts: [[u8; 32]; 2],
    pub nonce: [u8; 16],
    pub recovery_ciphertexts: [[u8; 32]; 2],
    pub recovery_nonce: [u8; 16],
    pub commitment: [u8; 32],
    pub version: u64,
    pub pending_computation: Pubkey,
    pub pending_receipt: Pubkey,
    pub pending_amount: u64,
    pub pending_destination: Pubkey,
    pub status: BalanceStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BalanceStatus {
    Opening,
    Ready,
    Crediting,
    Withdrawing,
    Moving,
    Claiming,
}

#[account]
#[derive(InitSpace)]
pub struct MarketAccount {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub recovery_key: [u8; 32],
    pub ciphertexts: [[u8; 32]; 3],
    pub nonce: [u8; 16],
    pub recovery_ciphertexts: [[u8; 32]; 3],
    pub recovery_nonce: [u8; 16],
    pub commitment: [u8; 32],
    pub version: u64,
    pub last_liquidation_timestamp: i64,
    pub pending_computation: Pubkey,
    pub status: MarketAccountStatus,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ClearingAccount {
    pub market: Pubkey,
    pub recovery_key: [u8; 32],
    pub ciphertexts: [[u8; 32]; 2],
    pub nonce: [u8; 16],
    pub recovery_ciphertexts: [[u8; 32]; 2],
    pub recovery_nonce: [u8; 16],
    pub commitment: [u8; 32],
    pub version: u64,
    pub pending_computation: Pubkey,
    pub pending_receipt: Pubkey,
    pub pending_amount: u64,
    pub status: ClearingStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ClearingStatus {
    Opening,
    Ready,
    Crediting,
    Trading,
    Claiming,
}

#[account]
#[derive(InitSpace)]
pub struct MarginTransfer {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub nonce: u64,
    pub amount: u64,
    pub to_market: bool,
    pub pending_computation: Pubkey,
    pub status: MarginTransferStatus,
    pub bump: u8,
    pub market_revision: u64,
    pub oracle_timestamp: i64,
    pub oracle_price_e8: u64,
    pub funding_index: i128,
    pub account_version: u64,
    pub deadline: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarginTransferStatus {
    Debiting,
    Escrow,
    Crediting,
    Settled,
    Refunded,
    Rejected,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketAccountStatus {
    Opening,
    Ready,
    Moving,
    Reserving,
    Releasing,
    Matching,
    Trading,
}

#[account]
#[derive(InitSpace)]
pub struct QuoteRecord {
    pub maker: Pubkey,
    pub operator: Pubkey,
    pub operator_version: u64,
    pub market: Pubkey,
    pub nonce: u64,
    pub capacity: u64,
    pub required_margin: u64,
    pub expiry: i64,
    pub tier_count: u8,
    pub market_revision: u64,
    pub oracle_timestamp: i64,
    pub funding_index: i128,
    pub ciphertexts: [[u8; 32]; 6],
    pub cipher_nonce: [u8; 16],
    pub balance_ciphertext: [u8; 32],
    pub balance_nonce: [u8; 16],
    pub pending_balance_ciphertext: [u8; 32],
    pub pending_balance_nonce: [u8; 16],
    pub pending_computation: Pubkey,
    pub attached_orders: u16,
    pub status: QuoteStatus,
    pub bump: u8,
    pub replacement_nonce: Option<u64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum QuoteStatus {
    Validating,
    Validated,
    Waiting,
    Reserving,
    Active,
    Closing,
    Releasing,
    Cancelled,
    Filled,
    Rejected,
}

#[account]
#[derive(InitSpace)]
pub struct BackstopOffer {
    pub maker: Pubkey,
    pub market: Pubkey,
    pub nonce: u64,
    pub capacity: u64,
    pub margin: u64,
    pub expiry: i64,
    pub market_revision: u64,
    pub oracle_timestamp: i64,
    pub funding_index: i128,
    pub pending_computation: Pubkey,
    pub status: BackstopStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BackstopStatus {
    Reserving,
    Active,
    Locked,
    Releasing,
    Consumed,
    Cancelled,
    Rejected,
}

#[account]
#[derive(InitSpace)]
pub struct OrderRecord {
    pub trader: Pubkey,
    pub maker: Pubkey,
    pub market: Pubkey,
    pub app: Pubkey,
    pub app_fee_bps: u16,
    pub app_fee_version: u64,
    pub reduce_only: bool,
    pub nonce: u64,
    pub deadline: i64,
    pub quote_keys: [Pubkey; 4],
    pub quote_count: u8,
    pub market_revision: u64,
    pub oracle_timestamp: i64,
    pub oracle_price_e8: u64,
    pub trader_version: u64,
    pub maker_version: u64,
    pub clearing_version: u64,
    pub funding_index: i128,
    pub plan_ciphertexts: [[u8; 32]; 3],
    pub plan_nonce: [u8; 16],
    pub candidate_primary: [[u8; 32]; 3],
    pub candidate_primary_nonce: [u8; 16],
    pub candidate_secondary: [[u8; 32]; 3],
    pub candidate_secondary_nonce: [u8; 16],
    pub candidate_clearing: [[u8; 32]; 2],
    pub candidate_clearing_nonce: [u8; 16],
    pub sealed_trader: [[u8; 32]; 3],
    pub sealed_trader_nonce: [u8; 16],
    pub trader_recovery: [[u8; 32]; 3],
    pub trader_recovery_nonce: [u8; 16],
    pub trader_commitment: [u8; 32],
    pub sealed_maker: [[u8; 32]; 3],
    pub sealed_maker_nonce: [u8; 16],
    pub maker_recovery: [[u8; 32]; 3],
    pub maker_recovery_nonce: [u8; 16],
    pub maker_commitment: [u8; 32],
    pub selected_quote: Pubkey,
    pub pending_computation: Pubkey,
    pub fees_claimed: bool,
    pub claim_deadline: i64,
    pub claim_stage: FeeClaimStage,
    pub kind: OrderKind,
    pub status: OrderStatus,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct FeeRecoveryRecord {
    pub order: Pubkey,
    pub recovery_key: [u8; 32],
    pub ciphertexts: [[u8; 32]; 3],
    pub nonce: [u8; 16],
    pub commitment: [u8; 32],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum FeeClaimStage {
    Idle,
    Computing,
    Ready,
    Sealing,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderKind {
    Trade,
    Liquidation,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OrderStatus {
    Matching,
    Matched,
    Settling,
    RiskApproved,
    SealingTrader,
    TraderSealed,
    SealingMaker,
    MakerSealed,
    SealingClearing,
    Filled,
    Rejected,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct BalanceView {
    pub owner: Pubkey,
    pub balance: Pubkey,
    pub version: u64,
    pub nonce: u64,
    pub view_key: [u8; 32],
    pub pending_computation: Pubkey,
    pub ciphertext: [u8; 32],
    pub output_nonce: [u8; 16],
    pub status: ViewStatus,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MarketView {
    pub owner: Pubkey,
    pub market_account: Pubkey,
    pub version: u64,
    pub nonce: u64,
    pub view_key: [u8; 32],
    pub pending_computation: Pubkey,
    pub ciphertexts: [[u8; 32]; 3],
    pub output_nonce: [u8; 16],
    pub status: ViewStatus,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct QuoteView {
    pub owner: Pubkey,
    pub quote: Pubkey,
    pub nonce: u64,
    pub source_nonce: [u8; 16],
    pub view_key: [u8; 32],
    pub pending_computation: Pubkey,
    pub ciphertext: [u8; 32],
    pub output_nonce: [u8; 16],
    pub status: ViewStatus,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct FillView {
    pub owner: Pubkey,
    pub order: Pubkey,
    pub nonce: u64,
    pub view_key: [u8; 32],
    pub pending_computation: Pubkey,
    pub ciphertexts: [[u8; 32]; 3],
    pub output_nonce: [u8; 16],
    pub status: ViewStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ViewStatus {
    Pending,
    Ready,
    Stale,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn market_locks_queue_and_incident_reason_remain_consistent() {
        let mut market = Market {
            market_id: [0; 32],
            settlement_mint: Pubkey::default(),
            vault: Pubkey::default(),
            oracle_account: Pubkey::default(),
            config: MarketConfig {
                initial_margin_bps: 0,
                maintenance_margin_bps: 0,
                liquidation_fee_bps: 0,
                trade_fee_bps: 0,
                insurance_fee_bps: 0,
                max_account_notional: 0,
                max_market_notional: 0,
                max_oracle_age_seconds: 0,
                max_confidence_bps: 0,
                max_quote_deviation_bps: 0,
                max_quote_lifetime_seconds: 0,
                max_order_queue_seconds: 0,
                funding_interval_seconds: 0,
                funding_rate_cap_bps: 0,
                quote_tiers: [0; 4],
                backstop_min_collateral: 0,
            },
            revision: 0,
            funding_index: 0,
            last_funding_timestamp: 0,
            oracle_price_e8: 0,
            oracle_ema_e8: 0,
            oracle_confidence_e8: 0,
            oracle_timestamp: 0,
            oracle_slot: 0,
            active_quotes: [Pubkey::default(); 4],
            active_quote_count: 0,
            quoted_notional: 0,
            backstop_offer: Pubkey::default(),
            pending_orders: 0,
            pending_order: Pubkey::default(),
            status: MarketStatus::Draft,
            incident: MarketIncident::None,
            bump: 0,
        };
        let first = Pubkey::new_unique();
        let second = Pubkey::new_unique();
        market.begin_pending(first).unwrap();
        assert!(!market.has_pending(second));
        assert!(market.begin_pending(second).is_err());
        assert!(market.clear_pending(second).is_err());
        assert!(market.has_pending(first));
        market.clear_pending(first).unwrap();
        market.begin_pending(second).unwrap();
        assert!(market.has_pending(second));
        market.status = MarketStatus::Active;
        market.pause(MarketIncident::CollateralDeficit);
        market.pause(MarketIncident::ManualPause);
        assert!(market.incident == MarketIncident::CollateralDeficit);
        let mut queue = QuoteQueue {
            market: Pubkey::default(),
            entries: [Pubkey::default(); 8],
            count: 0,
            bump: 0,
        };
        queue.enqueue(first).unwrap();
        queue.enqueue(second).unwrap();
        assert!(queue.enqueue(first).is_err());
        queue.remove(first).unwrap();
        assert_eq!(queue.entries[0], second);
        assert_eq!(queue.count, 1);
    }

    #[test]
    fn quote_waiting_queue_preserves_order_across_removal_and_reuse() {
        let mut queue = QuoteQueue {
            market: Pubkey::new_unique(),
            entries: [Pubkey::default(); 8],
            count: 0,
            bump: 0,
        };
        let keys: Vec<_> = (0..9).map(|_| Pubkey::new_unique()).collect();
        for key in &keys[..8] {
            queue.enqueue(*key).unwrap();
        }
        assert!(queue.enqueue(keys[8]).is_err());
        queue.remove(keys[3]).unwrap();
        queue.enqueue(keys[8]).unwrap();
        assert_eq!(queue.count, 8);
        assert_eq!(
            queue.entries[..8],
            [keys[0], keys[1], keys[2], keys[4], keys[5], keys[6], keys[7], keys[8],]
        );
        queue.remove(keys[0]).unwrap();
        assert_eq!(queue.entries[0], keys[1]);
        assert_eq!(queue.entries[7], Pubkey::default());
    }
}
