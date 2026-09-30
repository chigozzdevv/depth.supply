pub mod constants;
pub mod error;
pub mod instructions;
pub mod oracle;
pub mod state;

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
pub use constants::*;
pub use instructions::*;
#[allow(unused_imports)]
pub use state::*;

declare_id!("5cE5Kc42mwvg931PfNfs224RuBr47JRk3VqgTSyEV7MS");

#[arcium_program]
pub mod depth {
    use super::*;

    pub fn register_app(ctx: Context<RegisterApp>, fee_bps: u16) -> Result<()> {
        app::register_app_handler(ctx, fee_bps)
    }

    pub fn set_app_fee(ctx: Context<SetAppFee>, fee_bps: u16, active: bool) -> Result<()> {
        app::set_app_fee_handler(ctx, fee_bps, active)
    }

    pub fn grant_operator(
        ctx: Context<GrantOperator>,
        max_capacity: u64,
        expires_at: i64,
        can_view: bool,
    ) -> Result<()> {
        operator::grant_operator_handler(ctx, max_capacity, expires_at, can_view)
    }

    pub fn revoke_operator(ctx: Context<RevokeOperator>) -> Result<()> {
        operator::revoke_operator_handler(ctx)
    }

    pub fn init_claim_trade_fees_comp_def(ctx: Context<InitClaimTradeFeesCompDef>) -> Result<()> {
        fees::init_claim_trade_fees_comp_def_handler(ctx)
    }

    pub fn init_seal_trade_fees_comp_def(ctx: Context<InitSealTradeFeesCompDef>) -> Result<()> {
        fees::init_seal_trade_fees_comp_def_handler(ctx)
    }

    pub fn claim_trade_fees<'info>(
        ctx: Context<'info, ClaimTradeFees<'info>>,
        computation_offset: u64,
    ) -> Result<()> {
        fees::claim_trade_fees_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "claim_trade_fees")]
    pub fn claim_trade_fees_callback(
        ctx: Context<ClaimTradeFeesCallback>,
        output: SignedComputationOutputs<ClaimTradeFeesOutput>,
    ) -> Result<()> {
        fees::claim_trade_fees_callback_handler(ctx, output)
    }

    pub fn seal_trade_fees<'info>(
        ctx: Context<'info, SealTradeFees<'info>>,
        computation_offset: u64,
    ) -> Result<()> {
        fees::seal_trade_fees_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "seal_trade_fees")]
    pub fn seal_trade_fees_callback(
        ctx: Context<SealTradeFeesCallback>,
        output: SignedComputationOutputs<SealTradeFeesOutput>,
    ) -> Result<()> {
        fees::seal_trade_fees_callback_handler(ctx, output)
    }

    pub fn cancel_fee_claim(ctx: Context<CancelFeeClaim>) -> Result<()> {
        fees::cancel_fee_claim_handler(ctx)
    }

    pub fn create_market(
        ctx: Context<CreateMarket>,
        config: MarketConfig,
        oracle_account: Pubkey,
        recovery_key: [u8; 32],
        recovery_signers: [Pubkey; 5],
    ) -> Result<()> {
        market::create_market_handler(ctx, config, oracle_account, recovery_key, recovery_signers)
    }

    pub fn revise_market(ctx: Context<ReviseMarket>, config: MarketConfig) -> Result<()> {
        market::revise_market_handler(ctx, config)
    }

    pub fn refresh_oracle(ctx: Context<RefreshOracle>) -> Result<()> {
        market::refresh_oracle_handler(ctx)
    }

    pub fn set_oracle_account(ctx: Context<SetOracleAccount>) -> Result<()> {
        market::set_oracle_account_handler(ctx)
    }

    pub fn activate_market(ctx: Context<ActivateMarket>, insurance: u64, salt: u128) -> Result<()> {
        market::activate_market_handler(ctx, insurance, salt)
    }

    pub fn pause_market(ctx: Context<PauseMarket>) -> Result<()> {
        market::pause_market_handler(ctx)
    }

    pub fn report_incident(ctx: Context<ReportIncident>, incident: MarketIncident) -> Result<()> {
        market::report_incident_handler(ctx, incident)
    }

    pub fn resume_market(ctx: Context<ResumeMarket>) -> Result<()> {
        market::resume_market_handler(ctx)
    }

    pub fn enqueue_quote(ctx: Context<EnqueueQuote>) -> Result<()> {
        reserve::enqueue_quote_handler(ctx)
    }

    pub fn offer_backstop(
        ctx: Context<OfferBackstop>,
        computation_offset: u64,
        nonce: u64,
        capacity: u64,
        expiry: i64,
    ) -> Result<()> {
        backstop::offer_backstop_handler(ctx, computation_offset, nonce, capacity, expiry)
    }

    pub fn init_offer_backstop_comp_def(ctx: Context<InitOfferBackstopCompDef>) -> Result<()> {
        backstop::init_offer_backstop_comp_def_handler(ctx)
    }

    pub fn init_release_backstop_comp_def(ctx: Context<InitReleaseBackstopCompDef>) -> Result<()> {
        backstop::init_release_backstop_comp_def_handler(ctx)
    }

    #[arcium_callback(encrypted_ix = "offer_backstop")]
    pub fn offer_backstop_callback(
        ctx: Context<OfferBackstopCallback>,
        output: SignedComputationOutputs<OfferBackstopOutput>,
    ) -> Result<()> {
        backstop::offer_backstop_callback_handler(ctx, output)
    }

    pub fn release_backstop(ctx: Context<ReleaseBackstop>, computation_offset: u64) -> Result<()> {
        backstop::release_backstop_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "release_backstop")]
    pub fn release_backstop_callback(
        ctx: Context<ReleaseBackstopCallback>,
        output: SignedComputationOutputs<ReleaseBackstopOutput>,
    ) -> Result<()> {
        backstop::release_backstop_callback_handler(ctx, output)
    }

    pub fn close_backstop(ctx: Context<CloseBackstop>) -> Result<()> {
        backstop::close_backstop_handler(ctx)
    }

    pub fn initialize_protocol(ctx: Context<InitializeProtocol>) -> Result<()> {
        vault::initialize_protocol_handler(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, nonce: u64, amount: u64) -> Result<()> {
        vault::deposit_handler(ctx, nonce, amount)
    }

    pub fn refund_deposit(ctx: Context<RefundDeposit>) -> Result<()> {
        vault::refund_deposit_handler(ctx)
    }

    pub fn init_open_balance_comp_def(ctx: Context<InitOpenBalanceCompDef>) -> Result<()> {
        balance::init_open_balance_comp_def_handler(ctx)
    }

    pub fn open_balance(
        ctx: Context<OpenBalance>,
        computation_offset: u64,
        recovery_key: [u8; 32],
    ) -> Result<()> {
        balance::open_balance_handler(ctx, computation_offset, recovery_key)
    }

    pub fn cancel_open_balance(ctx: Context<CancelOpenBalance>) -> Result<()> {
        balance::cancel_open_balance_handler(ctx)
    }

    #[arcium_callback(encrypted_ix = "open_balance")]
    pub fn open_balance_callback(
        ctx: Context<OpenBalanceCallback>,
        output: SignedComputationOutputs<OpenBalanceOutput>,
    ) -> Result<()> {
        balance::open_balance_callback_handler(ctx, output)
    }

    pub fn init_credit_balance_comp_def(ctx: Context<InitCreditBalanceCompDef>) -> Result<()> {
        credit::init_credit_balance_comp_def_handler(ctx)
    }

    pub fn credit_deposit(ctx: Context<CreditDeposit>, computation_offset: u64) -> Result<()> {
        credit::credit_deposit_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "credit_balance")]
    pub fn credit_balance_callback(
        ctx: Context<CreditBalanceCallback>,
        output: SignedComputationOutputs<CreditBalanceOutput>,
    ) -> Result<()> {
        credit::credit_deposit_callback_handler(ctx, output)
    }

    pub fn cancel_credit(ctx: Context<CancelCredit>) -> Result<()> {
        credit::cancel_credit_handler(ctx)
    }

    pub fn init_debit_balance_comp_def(ctx: Context<InitDebitBalanceCompDef>) -> Result<()> {
        withdraw::init_debit_balance_comp_def_handler(ctx)
    }

    pub fn request_withdrawal(
        ctx: Context<RequestWithdrawal>,
        computation_offset: u64,
        nonce: u64,
        amount: u64,
    ) -> Result<()> {
        withdraw::request_withdrawal_handler(ctx, computation_offset, nonce, amount)
    }

    #[arcium_callback(encrypted_ix = "debit_balance")]
    pub fn debit_balance_callback(
        ctx: Context<DebitBalanceCallback>,
        output: SignedComputationOutputs<DebitBalanceOutput>,
    ) -> Result<()> {
        withdraw::debit_balance_callback_handler(ctx, output)
    }

    pub fn cancel_withdrawal(ctx: Context<CancelWithdrawal>) -> Result<()> {
        withdraw::cancel_withdrawal_handler(ctx)
    }

    pub fn init_view_balance_comp_def(ctx: Context<InitViewBalanceCompDef>) -> Result<()> {
        view::init_view_balance_comp_def_handler(ctx)
    }

    pub fn request_balance_view(
        ctx: Context<RequestBalanceView>,
        computation_offset: u64,
        nonce: u64,
        view_key: [u8; 32],
    ) -> Result<()> {
        view::request_balance_view_handler(ctx, computation_offset, nonce, view_key)
    }

    #[arcium_callback(encrypted_ix = "view_balance")]
    pub fn view_balance_callback(
        ctx: Context<ViewBalanceCallback>,
        output: SignedComputationOutputs<ViewBalanceOutput>,
    ) -> Result<()> {
        view::view_balance_callback_handler(ctx, output)
    }

    pub fn close_balance_view(ctx: Context<CloseBalanceView>) -> Result<()> {
        view::close_balance_view_handler(ctx)
    }

    pub fn recover_balance(ctx: Context<RecoverBalance>, amount: u64, salt: u128) -> Result<()> {
        recovery::recover_balance_handler(ctx, amount, salt)
    }

    pub fn recover_market(
        ctx: Context<RecoverMarket>,
        collateral: u64,
        reserved: u64,
        position: i64,
        entry_price: u64,
        funding_checkpoint: i128,
        salt: u128,
    ) -> Result<()> {
        recovery::recover_market_handler(
            ctx,
            collateral,
            reserved,
            position,
            entry_price,
            funding_checkpoint,
            salt,
        )
    }

    pub fn start_winddown(
        ctx: Context<StartWinddown>,
        insurance: u64,
        open_interest: u64,
        protocol_fees: u64,
        app_fees: u64,
        salt: u128,
    ) -> Result<()> {
        winddown::start_winddown_handler(
            ctx,
            insurance,
            open_interest,
            protocol_fees,
            app_fees,
            salt,
        )
    }

    pub fn reveal_winddown(
        ctx: Context<RevealWinddown>,
        collateral: u64,
        reserved: u64,
        position: i64,
        entry_price: u64,
        funding_checkpoint: i128,
        salt: u128,
    ) -> Result<()> {
        winddown::reveal_winddown_handler(
            ctx,
            collateral,
            reserved,
            position,
            entry_price,
            funding_checkpoint,
            salt,
        )
    }

    pub fn reveal_winddown_fee(
        ctx: Context<RevealWinddownFee>,
        protocol_fee: u64,
        app_fee: u64,
        salt: u128,
    ) -> Result<()> {
        winddown::reveal_winddown_fee_handler(ctx, protocol_fee, app_fee, salt)
    }

    pub fn finalize_winddown(ctx: Context<FinalizeWinddown>) -> Result<()> {
        winddown::finalize_winddown_handler(ctx)
    }

    pub fn claim_winddown(ctx: Context<ClaimWinddown>) -> Result<()> {
        winddown::claim_winddown_handler(ctx)
    }

    pub fn claim_winddown_app_fee(ctx: Context<ClaimWinddownAppFee>) -> Result<()> {
        winddown::claim_winddown_app_fee_handler(ctx)
    }

    pub fn claim_winddown_protocol_fees(ctx: Context<ClaimWinddownProtocolFees>) -> Result<()> {
        winddown::claim_winddown_protocol_fees_handler(ctx)
    }

    pub fn sweep_winddown(ctx: Context<SweepWinddown>) -> Result<()> {
        winddown::sweep_winddown_handler(ctx)
    }

    pub fn init_open_market_comp_def(ctx: Context<InitOpenMarketCompDef>) -> Result<()> {
        margin::init_open_market_comp_def_handler(ctx)
    }

    pub fn open_market_account(
        ctx: Context<OpenMarketAccount>,
        computation_offset: u64,
        recovery_key: [u8; 32],
    ) -> Result<()> {
        margin::open_market_account_handler(ctx, computation_offset, recovery_key)
    }

    #[arcium_callback(encrypted_ix = "open_market")]
    pub fn open_market_callback(
        ctx: Context<OpenMarketCallback>,
        output: SignedComputationOutputs<OpenMarketOutput>,
    ) -> Result<()> {
        margin::open_market_callback_handler(ctx, output)
    }

    pub fn cancel_open_market(ctx: Context<CancelOpenMarket>) -> Result<()> {
        margin::cancel_open_market_handler(ctx)
    }

    pub fn init_debit_free_comp_def(ctx: Context<InitDebitFreeCompDef>) -> Result<()> {
        margin_out::init_debit_free_comp_def_handler(ctx)
    }

    pub fn init_debit_market_comp_def(ctx: Context<InitDebitMarketCompDef>) -> Result<()> {
        margin_out::init_debit_market_comp_def_handler(ctx)
    }

    pub fn begin_allocation(
        ctx: Context<BeginAllocation>,
        computation_offset: u64,
        nonce: u64,
        amount: u64,
    ) -> Result<()> {
        margin_out::begin_allocation_handler(ctx, computation_offset, nonce, amount)
    }

    pub fn begin_release(
        ctx: Context<BeginRelease>,
        computation_offset: u64,
        nonce: u64,
        amount: u64,
    ) -> Result<()> {
        margin_out::begin_release_handler(ctx, computation_offset, nonce, amount)
    }

    #[arcium_callback(encrypted_ix = "debit_free")]
    pub fn debit_free_callback(
        ctx: Context<DebitFreeCallback>,
        output: SignedComputationOutputs<DebitFreeOutput>,
    ) -> Result<()> {
        margin_out::debit_free_callback_handler(ctx, output)
    }

    #[arcium_callback(encrypted_ix = "debit_market")]
    pub fn debit_market_callback(
        ctx: Context<DebitMarketCallback>,
        output: SignedComputationOutputs<DebitMarketOutput>,
    ) -> Result<()> {
        margin_out::debit_market_callback_handler(ctx, output)
    }

    pub fn cancel_free_debit(ctx: Context<CancelFreeDebit>) -> Result<()> {
        margin_out::cancel_free_debit_handler(ctx)
    }

    pub fn cancel_market_debit(ctx: Context<CancelMarketDebit>) -> Result<()> {
        margin_out::cancel_market_debit_handler(ctx)
    }

    pub fn init_credit_market_comp_def(ctx: Context<InitCreditMarketCompDef>) -> Result<()> {
        margin_in::init_credit_market_comp_def_handler(ctx)
    }

    pub fn init_credit_free_comp_def(ctx: Context<InitCreditFreeCompDef>) -> Result<()> {
        margin_in::init_credit_free_comp_def_handler(ctx)
    }

    pub fn settle_allocation(
        ctx: Context<SettleAllocation>,
        computation_offset: u64,
    ) -> Result<()> {
        margin_in::settle_allocation_handler(ctx, computation_offset)
    }

    pub fn settle_release(ctx: Context<SettleRelease>, computation_offset: u64) -> Result<()> {
        margin_in::settle_release_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "credit_market")]
    pub fn credit_market_callback(
        ctx: Context<CreditMarketCallback>,
        output: SignedComputationOutputs<CreditMarketOutput>,
    ) -> Result<()> {
        margin_in::credit_market_callback_handler(ctx, output)
    }

    #[arcium_callback(encrypted_ix = "credit_free")]
    pub fn credit_free_callback(
        ctx: Context<CreditFreeCallback>,
        output: SignedComputationOutputs<CreditFreeOutput>,
    ) -> Result<()> {
        margin_in::credit_free_callback_handler(ctx, output)
    }

    pub fn cancel_market_credit(ctx: Context<CancelMarketCredit>) -> Result<()> {
        margin_in::cancel_market_credit_handler(ctx)
    }

    pub fn cancel_free_credit(ctx: Context<CancelFreeCredit>) -> Result<()> {
        margin_in::cancel_free_credit_handler(ctx)
    }

    pub fn refund_escrow(ctx: Context<RefundEscrow>) -> Result<()> {
        margin_in::refund_escrow_handler(ctx)
    }

    pub fn init_prepare_quote_comp_def(ctx: Context<InitPrepareQuoteCompDef>) -> Result<()> {
        quote::init_prepare_quote_comp_def_handler(ctx)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn submit_quote(
        ctx: Context<SubmitQuote>,
        computation_offset: u64,
        nonce: u64,
        capacity: u64,
        tier_count: u8,
        expiry: i64,
        expected_revision: u64,
        expected_oracle_timestamp: i64,
        ciphertexts: [[u8; 32]; 6],
        input_key: [u8; 32],
        input_nonce: u128,
    ) -> Result<()> {
        quote::submit_quote_handler(
            ctx,
            computation_offset,
            nonce,
            capacity,
            tier_count,
            expiry,
            expected_revision,
            expected_oracle_timestamp,
            ciphertexts,
            input_key,
            input_nonce,
        )
    }

    #[arcium_callback(encrypted_ix = "prepare_quote")]
    pub fn prepare_quote_callback(
        ctx: Context<PrepareQuoteCallback>,
        output: SignedComputationOutputs<PrepareQuoteOutput>,
    ) -> Result<()> {
        quote::prepare_quote_callback_handler(ctx, output)
    }

    pub fn cancel_prepared_quote(ctx: Context<CancelPreparedQuote>) -> Result<()> {
        quote::cancel_prepared_quote_handler(ctx)
    }

    pub fn close_quote(ctx: Context<CloseQuote>) -> Result<()> {
        quote::close_quote_handler(ctx)
    }

    pub fn init_reserve_quote_comp_def(ctx: Context<InitReserveQuoteCompDef>) -> Result<()> {
        reserve::init_reserve_quote_comp_def_handler(ctx)
    }

    pub fn init_release_quote_comp_def(ctx: Context<InitReleaseQuoteCompDef>) -> Result<()> {
        reserve::init_release_quote_comp_def_handler(ctx)
    }

    pub fn reserve_quote(ctx: Context<ReserveQuote>, computation_offset: u64) -> Result<()> {
        reserve::reserve_quote_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "reserve_quote")]
    pub fn reserve_quote_callback(
        ctx: Context<ReserveQuoteCallback>,
        output: SignedComputationOutputs<ReserveQuoteOutput>,
    ) -> Result<()> {
        reserve::reserve_quote_callback_handler(ctx, output)
    }

    pub fn stop_quote(ctx: Context<StopQuote>) -> Result<()> {
        reserve::stop_quote_handler(ctx)
    }

    pub fn release_quote(ctx: Context<ReleaseQuote>, computation_offset: u64) -> Result<()> {
        reserve::release_quote_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "release_quote")]
    pub fn release_quote_callback(
        ctx: Context<ReleaseQuoteCallback>,
        output: SignedComputationOutputs<ReleaseQuoteOutput>,
    ) -> Result<()> {
        reserve::release_quote_callback_handler(ctx, output)
    }

    pub fn cancel_quote_reserve(ctx: Context<CancelQuoteReserve>) -> Result<()> {
        reserve::cancel_quote_reserve_handler(ctx)
    }

    pub fn cancel_quote_release(ctx: Context<CancelQuoteRelease>) -> Result<()> {
        reserve::cancel_quote_release_handler(ctx)
    }

    pub fn init_match_order_comp_def(ctx: Context<InitMatchOrderCompDef>) -> Result<()> {
        order::init_match_order_comp_def_handler(ctx)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn submit_order<'info>(
        ctx: Context<'info, SubmitOrder<'info>>,
        computation_offset: u64,
        nonce: u64,
        app: Pubkey,
        app_fee_bps: u16,
        app_fee_version: u64,
        deadline: i64,
        expected_revision: u64,
        expected_oracle_timestamp: i64,
        ciphertexts: [[u8; 32]; 2],
        input_key: [u8; 32],
        input_nonce: u128,
    ) -> Result<()> {
        order::submit_order_handler(
            ctx,
            computation_offset,
            nonce,
            app,
            app_fee_bps,
            app_fee_version,
            deadline,
            expected_revision,
            expected_oracle_timestamp,
            ciphertexts,
            input_key,
            input_nonce,
        )
    }

    #[arcium_callback(encrypted_ix = "match_order")]
    pub fn match_order_callback(
        ctx: Context<MatchOrderCallback>,
        output: SignedComputationOutputs<MatchOrderOutput>,
    ) -> Result<()> {
        order::match_order_callback_handler(ctx, output)
    }

    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        order::cancel_order_handler(ctx)
    }

    pub fn init_open_clearing_comp_def(ctx: Context<InitOpenClearingCompDef>) -> Result<()> {
        clearing::init_open_clearing_comp_def_handler(ctx)
    }

    pub fn open_clearing(
        ctx: Context<OpenClearing>,
        computation_offset: u64,
        recovery_key: [u8; 32],
    ) -> Result<()> {
        clearing::open_clearing_handler(ctx, computation_offset, recovery_key)
    }

    #[arcium_callback(encrypted_ix = "open_clearing")]
    pub fn open_clearing_callback(
        ctx: Context<OpenClearingCallback>,
        output: SignedComputationOutputs<OpenClearingOutput>,
    ) -> Result<()> {
        clearing::open_clearing_callback_handler(ctx, output)
    }

    pub fn cancel_open_clearing(ctx: Context<CancelOpenClearing>) -> Result<()> {
        clearing::cancel_open_clearing_handler(ctx)
    }

    pub fn init_credit_insurance_comp_def(ctx: Context<InitCreditInsuranceCompDef>) -> Result<()> {
        clearing::init_credit_insurance_comp_def_handler(ctx)
    }

    pub fn credit_insurance(ctx: Context<CreditInsurance>, computation_offset: u64) -> Result<()> {
        clearing::credit_insurance_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "credit_insurance")]
    pub fn credit_insurance_callback(
        ctx: Context<CreditInsuranceCallback>,
        output: SignedComputationOutputs<CreditInsuranceOutput>,
    ) -> Result<()> {
        clearing::credit_insurance_callback_handler(ctx, output)
    }

    pub fn cancel_insurance_credit(ctx: Context<CancelInsuranceCredit>) -> Result<()> {
        clearing::cancel_insurance_credit_handler(ctx)
    }

    pub fn recover_clearing(
        ctx: Context<RecoverClearing>,
        insurance: u64,
        salt: u128,
    ) -> Result<()> {
        clearing::recover_clearing_handler(ctx, insurance, salt)
    }

    pub fn init_settle_trade_comp_def(ctx: Context<InitSettleTradeCompDef>) -> Result<()> {
        settlement::init_settle_trade_comp_def_handler(ctx)
    }

    pub fn init_liquidate_comp_def(ctx: Context<InitLiquidateCompDef>) -> Result<()> {
        liquidation::init_liquidate_comp_def_handler(ctx)
    }

    pub fn liquidate(
        ctx: Context<Liquidate>,
        computation_offset: u64,
        target_owner: Pubkey,
        nonce: u64,
        deadline: i64,
    ) -> Result<()> {
        liquidation::liquidate_handler(ctx, computation_offset, target_owner, nonce, deadline)
    }

    #[arcium_callback(encrypted_ix = "liquidate")]
    pub fn liquidate_callback(
        ctx: Context<LiquidateCallback>,
        output: SignedComputationOutputs<LiquidateOutput>,
    ) -> Result<()> {
        liquidation::liquidate_callback_handler(ctx, output)
    }

    pub fn cancel_liquidation(ctx: Context<CancelLiquidation>) -> Result<()> {
        liquidation::cancel_liquidation_handler(ctx)
    }

    pub fn settle_trade<'info>(
        ctx: Context<'info, SettleTrade<'info>>,
        computation_offset: u64,
    ) -> Result<()> {
        settlement::settle_trade_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "settle_trade")]
    pub fn settle_trade_callback(
        ctx: Context<SettleTradeCallback>,
        output: SignedComputationOutputs<SettleTradeOutput>,
    ) -> Result<()> {
        settlement::settle_trade_callback_handler(ctx, output)
    }

    pub fn cancel_trade(ctx: Context<CancelTrade>) -> Result<()> {
        settlement::cancel_trade_handler(ctx)
    }

    pub fn init_seal_market_comp_def(ctx: Context<InitSealMarketCompDef>) -> Result<()> {
        commit::init_seal_market_comp_def_handler(ctx)
    }

    pub fn seal_market(ctx: Context<SealMarket>, computation_offset: u64) -> Result<()> {
        commit::seal_market_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "seal_market")]
    pub fn seal_market_callback(
        ctx: Context<SealMarketCallback>,
        output: SignedComputationOutputs<SealMarketOutput>,
    ) -> Result<()> {
        commit::seal_market_callback_handler(ctx, output)
    }

    pub fn init_seal_clearing_comp_def(ctx: Context<InitSealClearingCompDef>) -> Result<()> {
        commit::init_seal_clearing_comp_def_handler(ctx)
    }

    pub fn seal_clearing<'info>(
        ctx: Context<'info, SealClearing<'info>>,
        computation_offset: u64,
    ) -> Result<()> {
        commit::seal_clearing_handler(ctx, computation_offset)
    }

    #[arcium_callback(encrypted_ix = "seal_clearing")]
    pub fn seal_clearing_callback(
        ctx: Context<SealClearingCallback>,
        output: SignedComputationOutputs<SealClearingOutput>,
    ) -> Result<()> {
        commit::seal_clearing_callback_handler(ctx, output)
    }

    pub fn init_view_market_comp_def(ctx: Context<InitViewMarketCompDef>) -> Result<()> {
        market_view::init_view_market_comp_def_handler(ctx)
    }

    pub fn request_market_view(
        ctx: Context<RequestMarketView>,
        computation_offset: u64,
        nonce: u64,
        view_key: [u8; 32],
    ) -> Result<()> {
        market_view::request_market_view_handler(ctx, computation_offset, nonce, view_key)
    }

    #[arcium_callback(encrypted_ix = "view_market")]
    pub fn view_market_callback(
        ctx: Context<ViewMarketCallback>,
        output: SignedComputationOutputs<ViewMarketOutput>,
    ) -> Result<()> {
        market_view::view_market_callback_handler(ctx, output)
    }

    pub fn close_market_view(ctx: Context<CloseMarketView>) -> Result<()> {
        market_view::close_market_view_handler(ctx)
    }

    pub fn init_view_quote_comp_def(ctx: Context<InitViewQuoteCompDef>) -> Result<()> {
        quote_view::init_view_quote_comp_def_handler(ctx)
    }

    pub fn request_quote_view(
        ctx: Context<RequestQuoteView>,
        computation_offset: u64,
        nonce: u64,
        view_key: [u8; 32],
    ) -> Result<()> {
        quote_view::request_quote_view_handler(ctx, computation_offset, nonce, view_key)
    }

    #[arcium_callback(encrypted_ix = "view_quote")]
    pub fn view_quote_callback(
        ctx: Context<ViewQuoteCallback>,
        output: SignedComputationOutputs<ViewQuoteOutput>,
    ) -> Result<()> {
        quote_view::view_quote_callback_handler(ctx, output)
    }

    pub fn close_quote_view(ctx: Context<CloseQuoteView>) -> Result<()> {
        quote_view::close_quote_view_handler(ctx)
    }

    pub fn init_view_fill_comp_def(ctx: Context<InitViewFillCompDef>) -> Result<()> {
        fill_view::init_view_fill_comp_def_handler(ctx)
    }

    pub fn request_fill_view(
        ctx: Context<RequestFillView>,
        computation_offset: u64,
        nonce: u64,
        view_key: [u8; 32],
    ) -> Result<()> {
        fill_view::request_fill_view_handler(ctx, computation_offset, nonce, view_key)
    }

    #[arcium_callback(encrypted_ix = "view_fill")]
    pub fn view_fill_callback(
        ctx: Context<ViewFillCallback>,
        output: SignedComputationOutputs<ViewFillOutput>,
    ) -> Result<()> {
        fill_view::view_fill_callback_handler(ctx, output)
    }

    pub fn close_fill_view(ctx: Context<CloseFillView>) -> Result<()> {
        fill_view::close_fill_view_handler(ctx)
    }
}
