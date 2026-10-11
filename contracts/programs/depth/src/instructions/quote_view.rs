use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

use crate::{
    constants::{COMP_DEF_OFFSET_VIEW_QUOTE, SOL_USD_FEED_ID},
    error::ErrorCode,
    instructions::operator::authorize_operator,
    instructions::permission::{authorize_view, VIEW_QUOTE},
    state::{Market, OperatorGrant, QuoteRecord, QuoteStatus, QuoteView, ViewStatus},
    ArciumSignerAccount, ID, ID_CONST,
};

#[queue_computation_accounts("view_quote", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, nonce: u64)]
pub struct RequestQuoteView<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    pub grant: Option<Box<Account<'info, OperatorGrant>>>,
    #[account(constraint = quote.market == market.key() @ ErrorCode::WrongMarket, seeds = [b"quote", market.key().as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()], bump = quote.bump)]
    pub quote: Box<Account<'info, QuoteRecord>>,
    #[account(init, payer = payer, space = 8 + QuoteView::INIT_SPACE, seeds = [b"quote-view", quote.key().as_ref(), payer.key().as_ref(), nonce.to_le_bytes().as_ref()], bump)]
    pub view: Box<Account<'info, QuoteView>>,
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
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_VIEW_QUOTE))]
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

#[callback_accounts("view_quote")]
#[derive(Accounts)]
pub struct ViewQuoteCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_VIEW_QUOTE))]
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
    #[account(seeds = [b"quote", quote.market.as_ref(), quote.maker.as_ref(), quote.nonce.to_le_bytes().as_ref()], bump = quote.bump)]
    pub quote: Box<Account<'info, QuoteRecord>>,
    #[account(mut, seeds = [b"quote-view", view.quote.as_ref(), view.owner.as_ref(), view.nonce.to_le_bytes().as_ref()], bump = view.bump)]
    pub view: Box<Account<'info, QuoteView>>,
}

#[init_computation_definition_accounts("view_quote", payer)]
#[derive(Accounts)]
pub struct InitViewQuoteCompDef<'info> {
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
pub struct CloseQuoteView<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, close = owner, constraint = view.owner == owner.key(), seeds = [b"quote-view", view.quote.as_ref(), owner.key().as_ref(), view.nonce.to_le_bytes().as_ref()], bump = view.bump)]
    pub view: Box<Account<'info, QuoteView>>,
}

pub fn init_view_quote_comp_def_handler(ctx: Context<InitViewQuoteCompDef>) -> Result<()> {
    init_depth_comp_def!(ctx.accounts, "view_quote")?;
    Ok(())
}

pub fn request_quote_view_handler(
    ctx: Context<RequestQuoteView>,
    computation_offset: u64,
    nonce: u64,
    view_key: [u8; 32],
) -> Result<()> {
    require!(view_key != [0; 32], ErrorCode::InvalidViewKey);
    if let Some(permit) = ctx.remaining_accounts.first() {
        authorize_view(
            permit,
            ctx.accounts.quote.maker,
            ctx.accounts.market.key(),
            view_key,
            VIEW_QUOTE,
        )?;
    } else {
        authorize_operator(
            ctx.accounts.payer.key(),
            ctx.accounts.quote.maker,
            ctx.accounts.market.key(),
            0,
            Clock::get()?.unix_timestamp,
            true,
            ctx.accounts.grant.as_deref(),
        )?;
    }
    require!(
        matches!(
            ctx.accounts.quote.status,
            QuoteStatus::Active | QuoteStatus::Closing
        ) && ctx.accounts.quote.balance_ciphertext != [0; 32]
            && ctx.accounts.quote.pending_balance_ciphertext == [0; 32],
        ErrorCode::WrongQuoteStatus
    );
    let view_address = ctx.accounts.view.key();
    let view = &mut ctx.accounts.view;
    view.owner = ctx.accounts.payer.key();
    view.quote = ctx.accounts.quote.key();
    view.nonce = nonce;
    view.source_nonce = ctx.accounts.quote.balance_nonce;
    view.view_key = view_key;
    view.pending_computation = ctx.accounts.computation_account.key();
    view.status = ViewStatus::Pending;
    view.bump = ctx.bumps.view;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
    let args = ArgBuilder::new()
        .plaintext_u128(u128::from_le_bytes(ctx.accounts.quote.balance_nonce))
        .encrypted_u64(ctx.accounts.quote.balance_ciphertext)
        .x25519_pubkey(view_key)
        .build();
    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![ViewQuoteCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[
                CallbackAccount {
                    pubkey: ctx.accounts.quote.key(),
                    is_writable: false,
                },
                CallbackAccount {
                    pubkey: view_address,
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

pub fn view_quote_callback_handler(
    ctx: Context<ViewQuoteCallback>,
    output: SignedComputationOutputs<ViewQuoteOutput>,
) -> Result<()> {
    let ViewQuoteOutput { field_0: result } = output
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
    require_keys_eq!(view.quote, ctx.accounts.quote.key());
    require_keys_eq!(
        view.pending_computation,
        ctx.accounts.computation_account.key(),
        ErrorCode::WrongPendingComputation
    );
    if view.source_nonce == ctx.accounts.quote.balance_nonce
        && ctx.accounts.quote.pending_balance_ciphertext == [0; 32]
        && matches!(
            ctx.accounts.quote.status,
            QuoteStatus::Active | QuoteStatus::Closing
        )
    {
        require!(
            result.encryption_key == view.view_key,
            ErrorCode::WrongViewKey
        );
        view.ciphertext = result.ciphertexts[0];
        view.output_nonce = result.nonce.to_le_bytes();
        view.status = ViewStatus::Ready;
    } else {
        view.status = ViewStatus::Stale;
    }
    view.pending_computation = Pubkey::default();
    Ok(())
}

pub fn close_quote_view_handler(_ctx: Context<CloseQuoteView>) -> Result<()> {
    Ok(())
}
