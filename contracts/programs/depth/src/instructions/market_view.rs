use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{COMP_DEF_OFFSET_VIEW_MARKET, SOL_USD_FEED_ID},
    error::ErrorCode,
    state::{Market, MarketAccount, MarketAccountStatus, MarketView, ViewStatus},
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("view_market", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, nonce: u64)]
pub struct RequestMarketView<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(constraint = market_account.owner == payer.key(), constraint = market_account.market == market.key() @ ErrorCode::WrongMarket, seeds = [b"market-account", market.key().as_ref(), payer.key().as_ref()], bump = market_account.bump)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(init, payer = payer, space = 8 + MarketView::INIT_SPACE, seeds = [b"market-view", market_account.key().as_ref(), nonce.to_le_bytes().as_ref()], bump)]
    pub view: Box<Account<'info, MarketView>>,
    #[account(init_if_needed, space = 9, payer = payer, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_VIEW_MARKET))]
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

#[callback_accounts("view_market")]
#[derive(Accounts)]
pub struct ViewMarketCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_VIEW_MARKET))]
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
    #[account(seeds = [b"market-account", market_account.market.as_ref(), market_account.owner.as_ref()], bump = market_account.bump)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    #[account(mut, seeds = [b"market-view", view.market_account.as_ref(), view.nonce.to_le_bytes().as_ref()], bump = view.bump)]
    pub view: Box<Account<'info, MarketView>>,
}

#[init_computation_definition_accounts("view_market", payer)]
#[derive(Accounts)]
pub struct InitViewMarketCompDef<'info> {
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
pub struct CloseMarketView<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, close = owner, constraint = view.owner == owner.key(), seeds = [b"market-view", view.market_account.as_ref(), view.nonce.to_le_bytes().as_ref()], bump = view.bump)]
    pub view: Box<Account<'info, MarketView>>,
}

pub fn init_view_market_comp_def_handler(ctx: Context<InitViewMarketCompDef>) -> Result<()> {
    init_computation_def(ctx.accounts, None)?;
    Ok(())
}

pub fn request_market_view_handler(
    ctx: Context<RequestMarketView>,
    computation_offset: u64,
    nonce: u64,
    view_key: [u8; 32],
) -> Result<()> {
    require!(view_key != [0; 32], ErrorCode::InvalidViewKey);
    require!(
        ctx.accounts.market_account.status == MarketAccountStatus::Ready,
        ErrorCode::WrongMarketAccountStatus
    );
    let view = &mut ctx.accounts.view;
    view.owner = ctx.accounts.payer.key();
    view.market_account = ctx.accounts.market_account.key();
    view.version = ctx.accounts.market_account.version;
    view.nonce = nonce;
    view.view_key = view_key;
    view.pending_computation = ctx.accounts.computation_account.key();
    view.status = ViewStatus::Pending;
    view.bump = ctx.bumps.view;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    let mut args =
        ArgBuilder::new().plaintext_u128(u128::from_le_bytes(ctx.accounts.market_account.nonce));
    for field in ctx.accounts.market_account.ciphertexts {
        args = args.encrypted_u64(field);
    }
    let args = args.x25519_pubkey(view_key).build();
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![ViewMarketCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.market_account.key(),
                    is_writable: false,
                },
                CallbackAccount {
                    pubkey: ctx.accounts.view.key(),
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

pub fn view_market_callback_handler(
    ctx: Context<ViewMarketCallback>,
    output: SignedComputationOutputs<ViewMarketOutput>,
) -> Result<()> {
    let ViewMarketOutput { field_0: result } = output
        .verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        )
        .map_err(|_| ErrorCode::AbortedComputation)?;
    let view = &mut ctx.accounts.view;
    require!(
        view.status == ViewStatus::Pending,
        ErrorCode::WrongViewStatus
    );
    require_keys_eq!(
        view.market_account,
        ctx.accounts.market_account.key(),
        ErrorCode::WrongMarket
    );
    require_keys_eq!(
        view.owner,
        ctx.accounts.market_account.owner,
        ErrorCode::WrongViewKey
    );
    require_keys_eq!(
        view.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    if view.version == ctx.accounts.market_account.version
        && ctx.accounts.market_account.status == MarketAccountStatus::Ready
    {
        require!(
            result.encryption_key == view.view_key,
            ErrorCode::WrongViewKey
        );
        view.ciphertexts = result.ciphertexts;
        view.output_nonce = result.nonce.to_le_bytes();
        view.status = ViewStatus::Ready;
    } else {
        view.status = ViewStatus::Stale;
    }
    view.pending_computation = Pubkey::default();
    Ok(())
}

pub fn close_market_view_handler(_ctx: Context<CloseMarketView>) -> Result<()> {
    Ok(())
}
