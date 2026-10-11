use anchor_lang::prelude::*;

use crate::{
    constants::SOL_USD_FEED_ID,
    error::ErrorCode,
    state::{Market, ViewPermit},
};

pub const VIEW_TTL: i64 = 7 * 24 * 60 * 60;
pub const VIEW_BALANCE: u8 = 1;
pub const VIEW_MARKET: u8 = 2;
pub const VIEW_FILL: u8 = 4;
pub const VIEW_QUOTE: u8 = 8;
pub const VIEW_SCOPES: u8 = 15;

#[derive(Accounts)]
#[instruction(reader: Pubkey)]
pub struct AuthorizeViews<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"market", SOL_USD_FEED_ID.as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,
    #[account(init_if_needed, payer = owner, space = 8 + ViewPermit::INIT_SPACE, seeds = [b"view-permit", owner.key().as_ref(), reader.as_ref()], bump)]
    pub permit: Box<Account<'info, ViewPermit>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeViews<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"view-permit", owner.key().as_ref(), permit.reader.as_ref()], bump = permit.bump, constraint = permit.owner == owner.key() @ ErrorCode::Unauthorized)]
    pub permit: Box<Account<'info, ViewPermit>>,
}

pub fn authorize_views_handler(
    ctx: Context<AuthorizeViews>,
    reader: Pubkey,
    view_key: [u8; 32],
    expires_at: i64,
    scopes: u8,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        reader != Pubkey::default()
            && view_key != [0; 32]
            && scopes > 0
            && scopes & !VIEW_SCOPES == 0
            && expires_at > now
            && expires_at <= now.saturating_add(VIEW_TTL),
        ErrorCode::InvalidViewPermit
    );
    let permit = &mut ctx.accounts.permit;
    permit.owner = ctx.accounts.owner.key();
    permit.market = ctx.accounts.market.key();
    permit.reader = reader;
    permit.view_key = view_key;
    permit.expires_at = expires_at;
    permit.scopes = scopes;
    permit.active = true;
    permit.bump = ctx.bumps.permit;
    Ok(())
}

pub fn revoke_views_handler(ctx: Context<RevokeViews>) -> Result<()> {
    ctx.accounts.permit.active = false;
    Ok(())
}

pub fn authorize_view(
    info: &AccountInfo,
    owner: Pubkey,
    market: Pubkey,
    view_key: [u8; 32],
    scope: u8,
) -> Result<()> {
    require_keys_eq!(*info.owner, crate::ID, ErrorCode::Unauthorized);
    let permit = ViewPermit::try_deserialize(&mut info.try_borrow_data()?.as_ref())?;
    let (address, bump) = Pubkey::find_program_address(
        &[b"view-permit", owner.as_ref(), permit.reader.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(info.key(), address, ErrorCode::Unauthorized);
    require!(
        permit.bump == bump
            && permit_allows(
                &permit,
                owner,
                market,
                view_key,
                scope,
                Clock::get()?.unix_timestamp
            ),
        ErrorCode::Unauthorized
    );
    Ok(())
}

pub fn permit_owner(info: &AccountInfo) -> Result<Pubkey> {
    require_keys_eq!(*info.owner, crate::ID, ErrorCode::Unauthorized);
    Ok(ViewPermit::try_deserialize(&mut info.try_borrow_data()?.as_ref())?.owner)
}

fn permit_allows(
    permit: &ViewPermit,
    owner: Pubkey,
    market: Pubkey,
    key: [u8; 32],
    scope: u8,
    now: i64,
) -> bool {
    permit.active
        && permit.owner == owner
        && permit.market == market
        && permit.view_key == key
        && key != [0; 32]
        && permit.expires_at > now
        && scope > 0
        && scope & !VIEW_SCOPES == 0
        && permit.scopes & scope == scope
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_require_the_owner_market_key_scope_and_live_permission() {
        let owner = Pubkey::new_unique();
        let market = Pubkey::new_unique();
        let mut permit = ViewPermit {
            owner,
            market,
            reader: Pubkey::new_unique(),
            view_key: [7; 32],
            expires_at: 100,
            scopes: VIEW_BALANCE | VIEW_MARKET,
            active: true,
            bump: 1,
        };
        assert!(permit_allows(
            &permit,
            owner,
            market,
            [7; 32],
            VIEW_BALANCE,
            99
        ));
        assert!(!permit_allows(
            &permit,
            Pubkey::new_unique(),
            market,
            [7; 32],
            VIEW_BALANCE,
            99
        ));
        assert!(!permit_allows(
            &permit,
            owner,
            Pubkey::new_unique(),
            [7; 32],
            VIEW_BALANCE,
            99
        ));
        assert!(!permit_allows(
            &permit,
            owner,
            market,
            [8; 32],
            VIEW_BALANCE,
            99
        ));
        assert!(!permit_allows(
            &permit, owner, market, [7; 32], VIEW_QUOTE, 99
        ));
        assert!(!permit_allows(&permit, owner, market, [7; 32], 16, 99));
        assert!(!permit_allows(&permit, owner, market, [7; 32], 0, 99));
        assert!(!permit_allows(
            &permit,
            owner,
            market,
            [7; 32],
            VIEW_BALANCE,
            100
        ));
        permit.active = false;
        assert!(!permit_allows(
            &permit,
            owner,
            market,
            [7; 32],
            VIEW_BALANCE,
            99
        ));
    }
}
