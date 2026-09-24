//! Arena — a daily AI-generation contest paid for in SKR.
//!
//! The app generates with the GlianaAI gateway (paid in USDC from the user's own
//! wallet, unchanged); this program is only the game around it. A round holds a
//! theme and a vault of SKR, entrants pay a fee into that vault, wallets vote,
//! and after the round ends ANYONE can settle it.
//!
//! Two properties this program exists to guarantee, both of which a backend
//! would only promise:
//!
//! 1. **Nobody can take the pot.** The vault is a token account owned by the
//!    round PDA, so only this program's own logic can move it, and the only
//!    logic that moves it is `settle`, which pays the ranking the votes produced.
//! 2. **Settle needs no operator.** It is permissionless once `ends_at` passes.
//!    If we disappear the day after the hackathon, every pot still pays out.
//!
//! Votes are free (a signature, not a payment) and one per wallet per round —
//! the Vote PDA's own existence is the constraint — so a round cannot be bought
//! by whoever spends the most.
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("2CdzdzR1hj6w1ZjXLgvk3o2Saq5sXd1ufQ3Toww4PPHQ");

/// Winner's share, in basis points. The rest: 2500 split across places 2-5,
/// 1500 split across the wallets that voted for the winner. Fixed in the
/// program rather than passed in, so a round cannot be created with a payout
/// its entrants would not have agreed to.
const WINNER_BPS: u64 = 6000;
const RUNNERS_BPS: u64 = 2500;
const VOTERS_BPS: u64 = 1500;

/// How many places share RUNNERS_BPS (2nd..=5th).
const RUNNER_PLACES: usize = 4;

/// Places the round tracks, and therefore pays: 1st plus RUNNER_PLACES.
const TOP_N: usize = 1 + RUNNER_PLACES;

/// Longest a round can run. A round that never ends is a vault that never pays.
const MAX_ROUND_SECONDS: i64 = 7 * 24 * 60 * 60;

/// Longest theme/URI we store on-chain. Rent is paid by the creator/entrant, so
/// these are bounded to keep an entry cheap — the media itself lives on R2 and
/// only its URL is here.
const MAX_THEME_LEN: usize = 80;
const MAX_URI_LEN: usize = 200;

#[program]
pub mod arena {
    use super::*;

    /// Open a round. Anyone may create one; the app creates the daily round, but
    /// nothing here privileges us — `authority` only earns the right to claim
    /// back rent on an EMPTY round (see `close_empty_round`).
    pub fn create_round(
        ctx: Context<CreateRound>,
        round_id: u64,
        theme: String,
        entry_fee: u64,
        ends_at: i64,
    ) -> Result<()> {
        require!(theme.len() <= MAX_THEME_LEN, ArenaError::ThemeTooLong);
        require!(entry_fee > 0, ArenaError::FeeTooSmall);

        let now = Clock::get()?.unix_timestamp;
        require!(ends_at > now, ArenaError::EndsInThePast);
        require!(ends_at - now <= MAX_ROUND_SECONDS, ArenaError::RoundTooLong);

        let round = &mut ctx.accounts.round;
        round.round_id = round_id;
        round.authority = ctx.accounts.authority.key();
        round.mint = ctx.accounts.mint.key();
        round.vault = ctx.accounts.vault.key();
        round.theme = theme;
        round.entry_fee = entry_fee;
        round.ends_at = ends_at;
        round.entry_count = 0;
        round.settled = false;
        round.bump = ctx.bumps.round;
        round.top = [Pubkey::default(); TOP_N];
        round.top_votes = [0u32; TOP_N];
        Ok(())
    }

    /// Enter the round: pay the fee into the vault and record the media URL.
    ///
    /// The app calls this only AFTER a generation succeeded. A model that fails
    /// must never cost an entry fee — the same charge-then-fail rule the gateway
    /// is built around.
    pub fn enter(ctx: Context<Enter>, media_uri: String) -> Result<()> {
        require!(media_uri.len() <= MAX_URI_LEN, ArenaError::UriTooLong);
        let round = &mut ctx.accounts.round;
        require!(!round.settled, ArenaError::RoundSettled);
        require!(Clock::get()?.unix_timestamp < round.ends_at, ArenaError::RoundClosed);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.entrant_tokens.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.entrant.to_account_info(),
                },
            ),
            round.entry_fee,
        )?;

        let entry = &mut ctx.accounts.entry;
        entry.round = round.key();
        entry.entrant = ctx.accounts.entrant.key();
        entry.media_uri = media_uri;
        entry.votes = 0;
        entry.created_at = Clock::get()?.unix_timestamp;
        entry.bump = ctx.bumps.entry;

        round.entry_count = round.entry_count.checked_add(1).ok_or(ArenaError::Overflow)?;
        Ok(())
    }

    /// Vote for an entry. Free, and one per wallet per round: the Vote PDA is
    /// seeded on (round, voter), so a second vote cannot be initialised at all.
    ///
    /// `rank_at_vote` records how many votes the entry already had. That is what
    /// makes "early voters" meaningful at settle time without storing a list.
    pub fn vote(ctx: Context<CastVote>) -> Result<()> {
        let round_key = ctx.accounts.round.key();
        require!(!ctx.accounts.round.settled, ArenaError::RoundSettled);
        require!(
            Clock::get()?.unix_timestamp < ctx.accounts.round.ends_at,
            ArenaError::RoundClosed
        );
        require_keys_eq!(ctx.accounts.entry.round, round_key, ArenaError::WrongRound);
        // Voting for your own entry is free money at settle time (you would take
        // a share of the voter pot for backing yourself), so it is refused.
        require_keys_neq!(ctx.accounts.entry.entrant, ctx.accounts.voter.key(), ArenaError::SelfVote);

        let entry = &mut ctx.accounts.entry;
        let v = &mut ctx.accounts.vote;
        v.round = round_key;
        v.voter = ctx.accounts.voter.key();
        v.entry = entry.key();
        v.rank_at_vote = entry.votes;
        v.bump = ctx.bumps.vote;

        entry.votes = entry.votes.checked_add(1).ok_or(ArenaError::Overflow)?;
        let key = entry.key();
        let votes = entry.votes;
        record_rank(&mut ctx.accounts.round, key, votes);
        Ok(())
    }

    /// Pay a winning place out of the vault. Permissionless once the round has
    /// ended; the caller passes the entry and its place, and the program checks
    /// the claim rather than trusting it.
    ///
    /// Split into per-claim payouts rather than one `settle` that pays everyone:
    /// a single instruction would need every winner's token account in one
    /// transaction, which caps a round's size at whatever fits in 1232 bytes.
    /// Each payout is idempotent — `paid` on the Entry is the guard.
    pub fn claim_place(ctx: Context<ClaimPlace>, place: u8) -> Result<()> {
        let round = &ctx.accounts.round;
        require!(Clock::get()?.unix_timestamp >= round.ends_at, ArenaError::RoundOpen);
        require_keys_eq!(ctx.accounts.entry.round, round.key(), ArenaError::WrongRound);
        require!(!ctx.accounts.entry.paid, ArenaError::AlreadyPaid);
        require!(place >= 1 && place as usize <= TOP_N, ArenaError::BadPlace);
        // The caller supplies the place; the votes decide whether it is true.
        require_keys_eq!(
            round.top[place as usize - 1],
            ctx.accounts.entry.key(),
            ArenaError::NotThisPlace
        );

        let pot = ctx.accounts.vault.amount;
        let amount = match place {
            1 => pot * WINNER_BPS / 10_000,
            _ => pot * RUNNERS_BPS / 10_000 / RUNNER_PLACES as u64,
        };
        require!(amount > 0, ArenaError::NothingToPay);

        let round_id = round.round_id.to_le_bytes();
        let seeds: &[&[u8]] = &[b"round", round_id.as_ref(), &[round.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.winner_tokens.to_account_info(),
                    authority: ctx.accounts.round.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;

        ctx.accounts.entry.paid = true;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct CreateRound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = Round::SPACE,
        seeds = [b"round", round_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub round: Account<'info, Round>,
    pub mint: Account<'info, Mint>,
    /// The pot. Owned by the round PDA, so only `claim_place` can move it.
    #[account(
        init,
        payer = authority,
        token::mint = mint,
        token::authority = round,
        seeds = [b"vault", round.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Enter<'info> {
    #[account(mut)]
    pub entrant: Signer<'info>,
    #[account(mut, seeds = [b"round", round.round_id.to_le_bytes().as_ref()], bump = round.bump)]
    pub round: Account<'info, Round>,
    #[account(
        init,
        payer = entrant,
        space = Entry::SPACE,
        seeds = [b"entry", round.key().as_ref(), entrant.key().as_ref()],
        bump,
    )]
    pub entry: Account<'info, Entry>,
    /// Checked against the round's own vault key so a caller cannot pay their
    /// fee into an account they control and still get an entry.
    #[account(mut, address = round.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = entrant_tokens.mint == round.mint @ ArenaError::WrongMint)]
    pub entrant_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(mut, seeds = [b"round", round.round_id.to_le_bytes().as_ref()], bump = round.bump)]
    pub round: Account<'info, Round>,
    #[account(mut)]
    pub entry: Account<'info, Entry>,
    #[account(
        init,
        payer = voter,
        space = Vote::SPACE,
        seeds = [b"vote", round.key().as_ref(), voter.key().as_ref()],
        bump,
    )]
    pub vote: Account<'info, Vote>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimPlace<'info> {
    #[account(mut, seeds = [b"round", round.round_id.to_le_bytes().as_ref()], bump = round.bump)]
    pub round: Account<'info, Round>,
    #[account(mut, constraint = entry.round == round.key() @ ArenaError::WrongRound)]
    pub entry: Account<'info, Entry>,
    #[account(mut, address = round.vault)]
    pub vault: Account<'info, TokenAccount>,
    /// Must belong to the entrant being paid — otherwise anyone could claim a
    /// winner's place into their own account.
    #[account(
        mut,
        constraint = winner_tokens.owner == entry.entrant @ ArenaError::WrongWinnerAccount,
        constraint = winner_tokens.mint == round.mint @ ArenaError::WrongMint,
    )]
    pub winner_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Round {
    pub round_id: u64,
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub theme: String,
    pub entry_fee: u64,
    pub ends_at: i64,
    pub entry_count: u32,
    pub settled: bool,
    pub bump: u8,
    /// The leaderboard, maintained on every vote.
    ///
    /// WHY IT LIVES HERE. `claim_place` takes the place from its caller, and
    /// checking that claim needs to know who actually won. Ranking at claim
    /// time would mean passing every entry in the round into one transaction,
    /// which caps a round at whatever fits in 1232 bytes. Ranking at VOTE time
    /// is five comparisons and bounds the cost per vote instead.
    ///
    /// Without this the program has a hole big enough to empty the vault:
    /// anyone could claim place 1 for their own entry, no votes required.
    pub top: [Pubkey; TOP_N],
    pub top_votes: [u32; TOP_N],
}

impl Round {
    // 8 discriminator + 8 id + 32*3 keys + (4 + theme) + 8 fee + 8 ends_at
    // + 4 count + 1 settled + 1 bump + top (32*5) + top_votes (4*5)
    pub const SPACE: usize =
        8 + 8 + 32 * 3 + 4 + MAX_THEME_LEN + 8 + 8 + 4 + 1 + 1 + 32 * TOP_N + 4 * TOP_N;
}

/// Insert an entry into the leaderboard after its vote count changed.
///
/// Strictly greater, so a tie keeps whoever got there first — an entry cannot
/// take a place from one that reached the same count earlier.
fn record_rank(round: &mut Round, entry: Pubkey, votes: u32) {
    // Drop any place this entry already holds, so a second vote moves it up
    // rather than listing it twice.
    if let Some(i) = round.top.iter().position(|k| *k == entry) {
        for j in i..TOP_N - 1 {
            round.top[j] = round.top[j + 1];
            round.top_votes[j] = round.top_votes[j + 1];
        }
        round.top[TOP_N - 1] = Pubkey::default();
        round.top_votes[TOP_N - 1] = 0;
    }
    let Some(slot) = (0..TOP_N).find(|&i| votes > round.top_votes[i]) else {
        return;
    };
    let mut i = TOP_N - 1;
    while i > slot {
        round.top[i] = round.top[i - 1];
        round.top_votes[i] = round.top_votes[i - 1];
        i -= 1;
    }
    round.top[slot] = entry;
    round.top_votes[slot] = votes;
}

#[account]
pub struct Entry {
    pub round: Pubkey,
    pub entrant: Pubkey,
    pub media_uri: String,
    pub votes: u32,
    pub created_at: i64,
    pub paid: bool,
    pub bump: u8,
}

impl Entry {
    pub const SPACE: usize = 8 + 32 + 32 + 4 + MAX_URI_LEN + 4 + 8 + 1 + 1;
}

#[account]
pub struct Vote {
    pub round: Pubkey,
    pub voter: Pubkey,
    pub entry: Pubkey,
    /// Votes the entry already had when this vote landed — "early" is this
    /// number being low, which is what the voter share rewards.
    pub rank_at_vote: u32,
    pub bump: u8,
}

impl Vote {
    pub const SPACE: usize = 8 + 32 * 3 + 4 + 1;
}

#[error_code]
pub enum ArenaError {
    #[msg("Theme is too long")]
    ThemeTooLong,
    #[msg("Media URI is too long")]
    UriTooLong,
    #[msg("Entry fee must be greater than zero")]
    FeeTooSmall,
    #[msg("Round must end in the future")]
    EndsInThePast,
    #[msg("Round runs for too long")]
    RoundTooLong,
    #[msg("Round has already been settled")]
    RoundSettled,
    #[msg("Round is closed")]
    RoundClosed,
    #[msg("Round has not ended yet")]
    RoundOpen,
    #[msg("Entry belongs to a different round")]
    WrongRound,
    #[msg("Token account is for the wrong mint")]
    WrongMint,
    #[msg("You cannot vote for your own entry")]
    SelfVote,
    #[msg("This entry has already been paid")]
    AlreadyPaid,
    #[msg("Place must be between 1 and 5")]
    BadPlace,
    #[msg("Nothing to pay")]
    NothingToPay,
    #[msg("This entry did not take that place")]
    NotThisPlace,
    #[msg("Payout account does not belong to the entrant")]
    WrongWinnerAccount,
    #[msg("Arithmetic overflow")]
    Overflow,
}
