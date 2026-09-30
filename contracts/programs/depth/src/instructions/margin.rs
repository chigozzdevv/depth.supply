use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{COMP_DEF_OFFSET_OPEN_MARKET, SOL_USD_FEED_ID},
    error::ErrorCode,
    state::{Market, MarketAccount, MarketAccountStatus, Protocol, RecoveryConfig},
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("open_market", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct OpenMarketAccount<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(seeds = [b"recovery-config", market.key().as_ref()], bump = recovery_config.bump)]
    pub recovery_config: Box<Account<'info, RecoveryConfig>>,
    #[account(
        init,
        payer = payer,
        space = 8 + MarketAccount::INIT_SPACE,
        seeds = [b"market-account", market.key().as_ref(), payer.key().as_ref()],
        bump,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_OPEN_MARKET))]
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

#[callback_accounts("open_market")]
#[derive(Accounts)]
pub struct OpenMarketCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_OPEN_MARKET))]
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
    #[account(mut, seeds = [b"recovery-config", market.key().as_ref()], bump = recovery_config.bump)]
    pub recovery_config: Box<Account<'info, RecoveryConfig>>,
    #[account(seeds = [b"protocol"], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(
        mut,
        seeds = [b"market-account", market_account.market.as_ref(), market_account.owner.as_ref()],
        bump = market_account.bump,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,
}

#[init_computation_definition_accounts("open_market", payer)]
#[derive(Accounts)]
pub struct InitOpenMarketCompDef<'info> {
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

#[derive(Accounts)]
pub struct CancelOpenMarket<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        close = owner,
        constraint = market_account.owner == owner.key(),
        seeds = [b"market-account", market_account.market.as_ref(), owner.key().as_ref()],
        bump = market_account.bump,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,
}

pub fn init_open_market_comp_def_handler(ctx: Context<InitOpenMarketCompDef>) -> Result<()> {
    init_depth_comp_def!(ctx.accounts, "open_market")?;
    Ok(())
}

pub fn open_market_account_handler(
    ctx: Context<OpenMarketAccount>,
    computation_offset: u64,
    recovery_key: [u8; 32],
) -> Result<()> {
    require!(
        ctx.accounts.market.status != crate::state::MarketStatus::Settling,
        ErrorCode::MarketNotActive
    );
    require!(
        recovery_key == ctx.accounts.recovery_config.recovery_key,
        ErrorCode::WrongRecoveryKey
    );
    let account = &mut ctx.accounts.market_account;
    account.owner = ctx.accounts.payer.key();
    account.market = ctx.accounts.market.key();
    account.recovery_key = recovery_key;
    account.status = MarketAccountStatus::Opening;
    account.pending_computation = ctx.accounts.computation_account.key();
    account.bump = ctx.bumps.market_account;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let mut args = ArgBuilder::new();
    for byte in account.key().to_bytes() {
        args = args.plaintext_u8(byte);
    }
    let args = args.x25519_pubkey(account.recovery_key).build();
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![OpenMarketCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.market.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.recovery_config.key(),
                    is_writable: true,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.protocol.key(),
                    is_writable: false,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.market_account.key(),
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

pub fn open_market_callback_handler(
    ctx: Context<OpenMarketCallback>,
    output: SignedComputationOutputs<OpenMarketOutput>,
) -> Result<()> {
    let OpenMarketOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let account = &mut ctx.accounts.market_account;
    require!(
        ctx.accounts.market.status != crate::state::MarketStatus::Settling,
        ErrorCode::MarketNotActive
    );
    require_keys_eq!(
        account.market,
        ctx.accounts.market.key(),
        ErrorCode::WrongMarket
    );
    require!(
        account.status == MarketAccountStatus::Opening,
        ErrorCode::WrongMarketAccountStatus
    );
    require_keys_eq!(
        account.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    require!(
        result.field_1.encryption_key == account.recovery_key,
        ErrorCode::WrongRecoveryKey
    );
    account.ciphertexts = result.field_0.ciphertexts;
    account.nonce = result.field_0.nonce.to_le_bytes();
    account.recovery_ciphertexts = result.field_1.ciphertexts;
    account.recovery_nonce = result.field_1.nonce.to_le_bytes();
    account.commitment = result.field_2;
    account.pending_computation = Pubkey::default();
    account.status = MarketAccountStatus::Ready;
    ctx.accounts.recovery_config.account_count = ctx
        .accounts
        .recovery_config
        .account_count
        .checked_add(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    Ok(())
}

pub fn cancel_open_market_handler(ctx: Context<CancelOpenMarket>) -> Result<()> {
    require!(
        ctx.accounts.market_account.status == MarketAccountStatus::Opening,
        ErrorCode::WrongMarketAccountStatus
    );
    Ok(())
}
