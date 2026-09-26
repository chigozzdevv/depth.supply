use anchor_lang::prelude::*;

use crate::{
    constants::SOL_USD_FEED_ID,
    error::ErrorCode,
    state::{Market, MarketAccount, OperatorGrant},
};

#[derive(Accounts)]
pub struct GrantOperator<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(seeds = [b"market-account", market.key().as_ref(), maker.key().as_ref()], bump = market_account.bump, constraint = market_account.owner == maker.key() @ ErrorCode::Unauthorized)]
    pub market_account: Box<Account<'info, MarketAccount>>,
    /// CHECK: The grant identifies this wallet but does not read or write its account data.
    pub operator: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = maker, space = 8 + OperatorGrant::INIT_SPACE, seeds = [b"operator", market.key().as_ref(), maker.key().as_ref(), operator.key().as_ref()], bump)]
    pub grant: Box<Account<'info, OperatorGrant>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeOperator<'info> {
    pub maker: Signer<'info>,
    #[account(mut, seeds = [b"operator", grant.market.as_ref(), maker.key().as_ref(), grant.operator.as_ref()], bump = grant.bump, constraint = grant.maker == maker.key() @ ErrorCode::Unauthorized)]
    pub grant: Box<Account<'info, OperatorGrant>>,
}

pub fn grant_operator_handler(
    ctx: Context<GrantOperator>,
    max_capacity: u64,
    expires_at: i64,
    can_view: bool,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.operator.key() != ctx.accounts.maker.key()
            && max_capacity > 0
            && max_capacity <= ctx.accounts.market.config.max_account_notional
            && expires_at > now,
        ErrorCode::InvalidOperatorGrant
    );
    let grant = &mut ctx.accounts.grant;
    grant.version = grant
        .version
        .checked_add(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    grant.maker = ctx.accounts.maker.key();
    grant.operator = ctx.accounts.operator.key();
    grant.market = ctx.accounts.market.key();
    grant.max_capacity = max_capacity;
    grant.expires_at = expires_at;
    grant.can_view = can_view;
    grant.active = true;
    grant.bump = ctx.bumps.grant;
    Ok(())
}

pub fn revoke_operator_handler(ctx: Context<RevokeOperator>) -> Result<()> {
    let grant = &mut ctx.accounts.grant;
    require!(grant.active, ErrorCode::InvalidOperatorGrant);
    grant.active = false;
    grant.version = grant
        .version
        .checked_add(1)
        .ok_or(ErrorCode::RevisionOverflow)?;
    Ok(())
}

pub fn authorize_operator(
    actor: Pubkey,
    maker: Pubkey,
    market: Pubkey,
    capacity: u64,
    expires_at: i64,
    view: bool,
    grant: Option<&Account<OperatorGrant>>,
) -> Result<u64> {
    if actor == maker {
        return Ok(0);
    }
    let grant = grant.ok_or(ErrorCode::Unauthorized)?;
    let (address, bump) = Pubkey::find_program_address(
        &[b"operator", market.as_ref(), maker.as_ref(), actor.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(grant.key(), address, ErrorCode::Unauthorized);
    require!(grant.bump == bump, ErrorCode::Unauthorized);
    require!(
        grant_allows(
            grant,
            actor,
            maker,
            market,
            capacity,
            expires_at,
            view,
            Clock::get()?.unix_timestamp,
        ),
        ErrorCode::Unauthorized
    );
    Ok(grant.version)
}

#[allow(clippy::too_many_arguments)]
fn grant_allows(
    grant: &OperatorGrant,
    actor: Pubkey,
    maker: Pubkey,
    market: Pubkey,
    capacity: u64,
    expires_at: i64,
    view: bool,
    now: i64,
) -> bool {
    grant.active
        && grant.operator == actor
        && grant.maker == maker
        && grant.market == market
        && grant.max_capacity >= capacity
        && grant.expires_at >= expires_at
        && grant.expires_at > now
        && (!view || grant.can_view)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delegated_quote_and_view_stay_within_granted_scope() {
        let maker = Pubkey::new_unique();
        let operator = Pubkey::new_unique();
        let market = Pubkey::new_unique();
        let grant = OperatorGrant {
            maker,
            operator,
            market,
            max_capacity: 1_000,
            expires_at: 200,
            can_view: false,
            active: true,
            version: 1,
            bump: 0,
        };
        assert!(grant_allows(
            &grant, operator, maker, market, 1_000, 190, false, 100
        ));
        assert!(!grant_allows(
            &grant, operator, maker, market, 1_001, 190, false, 100
        ));
        assert!(!grant_allows(
            &grant, operator, maker, market, 1_000, 201, false, 100
        ));
        assert!(!grant_allows(
            &grant, operator, maker, market, 0, 190, true, 100
        ));
        assert!(!grant_allows(
            &grant, operator, maker, market, 1_000, 190, false, 200
        ));
    }
}
