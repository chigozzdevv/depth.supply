use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("The market configuration is invalid")]
    InvalidMarketConfig,
    #[msg("The settlement mint must have six decimals")]
    InvalidSettlementMint,
    #[msg("The actor is not authorized for this market operation")]
    Unauthorized,
    #[msg("The market is no longer a draft")]
    MarketNotDraft,
    #[msg("The market is not active")]
    MarketNotActive,
    #[msg("The market is not paused")]
    MarketNotPaused,
    #[msg("The oracle account is invalid")]
    InvalidOracleAccount,
    #[msg("The oracle update is not fully verified")]
    UnverifiedOracle,
    #[msg("The oracle update is for a different feed")]
    WrongOracleFeed,
    #[msg("The oracle update is stale or from the future")]
    StaleOracle,
    #[msg("The oracle price or exponent is invalid")]
    InvalidOraclePrice,
    #[msg("The oracle confidence exceeds the market limit")]
    WideOracleConfidence,
    #[msg("The quote envelope is invalid")]
    InvalidQuote,
    #[msg("The quote is in the wrong state")]
    WrongQuoteStatus,
    #[msg("The backstop offer is invalid")]
    InvalidBackstop,
    #[msg("The backstop offer is in the wrong state")]
    WrongBackstopStatus,
    #[msg("The market already has an active backstop offer")]
    BackstopAlreadyActive,
    #[msg("The quote snapshot is full")]
    QuoteSnapshotFull,
    #[msg("The quote has attached orders")]
    QuoteHasOrders,
    #[msg("The market quote capacity is exceeded")]
    QuoteCapacityExceeded,
    #[msg("The order envelope is invalid")]
    InvalidOrder,
    #[msg("The order is in the wrong state")]
    WrongOrderStatus,
    #[msg("The order deadline has passed")]
    OrderExpired,
    #[msg("The order deadline has not passed")]
    OrderNotExpired,
    #[msg("The supplied quotes differ from the complete market snapshot")]
    WrongQuoteSnapshot,
    #[msg("The market configuration is unchanged")]
    UnchangedConfig,
    #[msg("The market revision overflowed")]
    RevisionOverflow,
    #[msg("The deposit amount must be positive")]
    InvalidDeposit,
    #[msg("The pending deposit total overflowed")]
    PendingOverflow,
    #[msg("The pending deposit total underflowed")]
    PendingUnderflow,
    #[msg("The deposit has already been refunded")]
    AlreadyRefunded,
    #[msg("The vault received an unexpected amount")]
    DepositAmountMismatch,
    #[msg("The recovery key must be nonzero")]
    InvalidRecoveryKey,
    #[msg("The balance has a different pending computation")]
    WrongPendingComputation,
    #[msg("The balance is in the wrong state")]
    WrongBalanceStatus,
    #[msg("The market account is in the wrong state")]
    WrongMarketAccountStatus,
    #[msg("The clearing account is in the wrong state")]
    WrongClearingStatus,
    #[msg("The market account is bound to a different balance")]
    WrongPendingBalance,
    #[msg("The market account is bound to a different market")]
    WrongMarket,
    #[msg("The margin transfer is in the wrong state")]
    WrongMarginTransferStatus,
    #[msg("The margin transfer is bound to a different account")]
    WrongMarginTransfer,
    #[msg("The escrow total overflowed")]
    EscrowOverflow,
    #[msg("The escrow total underflowed")]
    EscrowUnderflow,
    #[msg("The computation used a different recovery key")]
    WrongRecoveryKey,
    #[msg("The deposit is in the wrong state")]
    WrongDepositStatus,
    #[msg("The balance is bound to a different deposit")]
    WrongPendingReceipt,
    #[msg("The credited balance total overflowed")]
    CreditedOverflow,
    #[msg("The vault does not cover every pending and credited claim")]
    VaultUnderfunded,
    #[msg("The withdrawal amount must be positive")]
    InvalidWithdrawal,
    #[msg("The total credited amount is too small")]
    InsufficientCreditedTotal,
    #[msg("The withdrawal destination differs from the approved destination")]
    WrongWithdrawalDestination,
    #[msg("The view key must be nonzero")]
    InvalidViewKey,
    #[msg("The view request is in the wrong state")]
    WrongViewStatus,
    #[msg("The computation used a different view key")]
    WrongViewKey,
    #[msg("Independent balance recovery is disabled during trading")]
    TradingActive,
    #[msg("The disclosed balance does not match the committed private state")]
    InvalidRecoveryState,
}
