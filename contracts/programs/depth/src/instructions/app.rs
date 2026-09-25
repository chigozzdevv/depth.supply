use anchor_lang::prelude::*;

use crate::{error::ErrorCode, state::AppConfig};

#[derive(Accounts)]
pub struct RegisterApp<'info> {
    #[account(mut)]
    pub app: Signer<'info>,
    #[account(
        init,
        payer = app,
        space = 8 + AppConfig::INIT_SPACE,
        seeds = [b"app", app.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, AppConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAppFee<'info> {
    pub app: Signer<'info>,
    #[account(
        mut,
        seeds = [b"app", app.key().as_ref()],
        bump = config.bump,
        constraint = config.app == app.key() @ ErrorCode::InvalidOrder,
    )]
    pub config: Account<'info, AppConfig>,
}

pub fn register_app_handler(ctx: Context<RegisterApp>, fee_bps: u16) -> Result<()> {
    require!(fee_bps <= 2, ErrorCode::InvalidOrder);
    let config = &mut ctx.accounts.config;
    config.app = ctx.accounts.app.key();
    config.fee_bps = fee_bps;
    config.version = 1;
    config.active = true;
    config.bump = ctx.bumps.config;
    Ok(())
}

pub fn set_app_fee_handler(ctx: Context<SetAppFee>, fee_bps: u16, active: bool) -> Result<()> {
    require!(fee_bps <= 2, ErrorCode::InvalidOrder);
    ctx.accounts.config.version = ctx
        .accounts
        .config
        .version
        .checked_add(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    ctx.accounts.config.fee_bps = fee_bps;
    ctx.accounts.config.active = active;
    Ok(())
}
