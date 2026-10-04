/**
 * Arena program tests, on LiteSVM — no validator, so the whole suite runs in
 * about a second and can move the clock forward to end a round.
 *
 * What is actually being tested is the money: that the vault can only be moved
 * by a real winner's claim, that a round cannot be voted twice by one wallet,
 * and that nothing pays out twice. The happy path is the easy part.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LiteSVM, Clock } from 'litesvm';
import { LiteSVMProvider } from 'anchor-litesvm';
import { Program, BN, Wallet, type Idl } from '@coral-xyz/anchor';
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AccountLayout, MintLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { readFileSync } from 'node:fs';

// The IDL is committed at ../idl/arena.json rather than read from target/.
// `cargo build-sbf` does not emit an IDL — only `anchor build` does — so a
// checkout that had compiled the program still had no IDL and the tests could
// not run. It is also a published interface (it lives on-chain as program
// metadata), which makes it something a change should surface in review rather
// than a disposable build output.
const idl = JSON.parse(readFileSync(new URL('../idl/arena.json', import.meta.url), 'utf8')) as Idl;
const PROGRAM_ID = new PublicKey(idl.address);
// The compiled program is committed next to its IDL.
//
// cargo-build-sbf emits an SBF version that follows the toolchain, and litesvm
// 0.3.3 only executes a narrow range of them: a newer toolchain builds a
// program it refuses to load, an older one ships a rustc the dependency tree
// rejects, and one in between loaded but aborted the process mid-run. Pinning
// CI to a version that satisfies all three may not be possible.
//
// So the binary under test is the binary that is deployed, byte for byte.
// REBUILD AND RECOMMIT IT when programs/arena/src changes — `cargo build-sbf &&
// cp target/deploy/arena.so arena.so` — because these tests will otherwise keep
// passing against the previous one. CI compiles the source separately to prove
// it still builds.
const SO = new URL('../arena.so', import.meta.url);

/** SKR is 6-decimal, so these fees read like the real thing: 5 SKR. */
const DECIMALS = 6;
const FEE = new BN(5_000_000);
const HOUR = 3600;

let svm: LiteSVM;
let provider: LiteSVMProvider;
let program: Program;
let payer: Keypair;
let mint: PublicKey;
let roundId: bigint;

const fund = (kp: Keypair) => svm.airdrop(kp.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

/**
 * Mint and token accounts are written straight into the SVM rather than created
 * through @solana/spl-token: LiteSVMProvider's `connection` is a stub with no
 * sendTransaction, so the library's helpers cannot run here. Writing the
 * account bytes is also deterministic and instant.
 */
function putMint(authority: PublicKey) {
  const key = Keypair.generate().publicKey;
  const data = Buffer.alloc(MintLayout.span);
  MintLayout.encode(
    { mintAuthorityOption: 1, mintAuthority: authority, supply: 0n, decimals: DECIMALS, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default },
    data,
  );
  svm.setAccount(key, { lamports: 1_000_000_000, data, owner: TOKEN_PROGRAM_ID, executable: false });
  return key;
}

function putTokenAccount(owner: PublicKey, amount: bigint) {
  const key = Keypair.generate().publicKey;
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode(
    { mint, owner, amount, delegateOption: 0, delegate: PublicKey.default, delegatedAmount: 0n, state: 1, isNativeOption: 0, isNative: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default },
    data,
  );
  svm.setAccount(key, { lamports: 1_000_000_000, data, owner: TOKEN_PROGRAM_ID, executable: false });
  return key;
}

/** SPL token balance straight out of the SVM. */
function tokenBalance(ata: PublicKey): bigint {
  const acc = svm.getAccount(ata);
  if (!acc) throw new Error(`no token account ${ata.toBase58()}`);
  return AccountLayout.decode(Buffer.from(acc.data)).amount;
}

function pda(seeds: (Buffer | Uint8Array)[]) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}
const u64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};
const roundPda = (id: bigint) => pda([Buffer.from('round'), u64(id)]);
const vaultPda = (round: PublicKey) => pda([Buffer.from('vault'), round.toBuffer()]);
const entryPda = (round: PublicKey, who: PublicKey) => pda([Buffer.from('entry'), round.toBuffer(), who.toBuffer()]);
const votePda = (round: PublicKey, who: PublicKey) => pda([Buffer.from('vote'), round.toBuffer(), who.toBuffer()]);

/** Move the SVM clock past a round's end so claims become valid. */
function skipTo(unixTimestamp: number) {
  const c = svm.getClock();
  svm.setClock(new Clock(c.slot, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, BigInt(unixTimestamp)));
}

const now = () => Number(svm.getClock().unixTimestamp);

function newEntrant(skr: bigint) {
  const kp = Keypair.generate();
  fund(kp);
  return { kp, ata: putTokenAccount(kp.publicKey, skr) };
}

async function createRound(endsAt = now() + 24 * HOUR) {
  roundId = BigInt(Math.floor(Math.random() * 1e9));
  const round = roundPda(roundId);
  await program.methods
    .createRound(new BN(roundId.toString()), 'cursed street food', FEE, new BN(endsAt))
    .accountsPartial({
      authority: payer.publicKey,
      round,
      mint,
      vault: vaultPda(round),
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  return round;
}

async function enter(round: PublicKey, who: Keypair, ata: PublicKey, uri = 'https://r2.test/a.png') {
  await program.methods
    .enter(uri)
    .accountsPartial({
      entrant: who.publicKey,
      round,
      entry: entryPda(round, who.publicKey),
      vault: vaultPda(round),
      entrantTokens: ata,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([who])
    .rpc();
}

async function vote(round: PublicKey, voter: Keypair, entry: PublicKey) {
  await program.methods
    .vote()
    .accountsPartial({ voter: voter.publicKey, round, entry, vote: votePda(round, voter.publicKey) })
    .signers([voter])
    .rpc();
}

async function claim(round: PublicKey, entry: PublicKey, winnerTokens: PublicKey, place: number) {
  await program.methods
    .claimPlace(place)
    .accountsPartial({ round, entry, vault: vaultPda(round), winnerTokens, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
}

const balance = (ata: PublicKey) => tokenBalance(ata);

beforeEach(async () => {
  svm = new LiteSVM();
  svm.addProgramFromFile(PROGRAM_ID, SO.pathname);
  payer = Keypair.generate();
  fund(payer);
  // LiteSVMProvider wants an anchor Wallet, not a bare Keypair — it calls signTransaction.
  provider = new LiteSVMProvider(svm, new Wallet(payer));
  program = new Program(idl, provider as never);
  mint = putMint(payer.publicKey);
});

describe('the round', () => {
  it('takes the fee into a vault only the program can move', async () => {
    const round = await createRound();
    const a = newEntrant(20_000_000n);
    await enter(round, a.kp, a.ata);

    expect(balance(vaultPda(round))).toBe(BigInt(FEE.toString()));
    expect(balance(a.ata)).toBe(15_000_000n);

    // The owner is the round PDA, not us and not the entrant: nobody holds the pot.
    const vault = AccountLayout.decode(Buffer.from(svm.getAccount(vaultPda(round))!.data));
    expect(vault.owner.toBase58()).toBe(round.toBase58());
  });

  it('refuses an entry once the round has ended', async () => {
    const endsAt = now() + HOUR;
    const round = await createRound(endsAt);
    const a = newEntrant(20_000_000n);
    skipTo(endsAt + 1);
    await expect(enter(round, a.kp, a.ata)).rejects.toThrow(/RoundClosed/);
  });

  it('refuses a second entry from the same wallet', async () => {
    const round = await createRound();
    const a = newEntrant(20_000_000n);
    await enter(round, a.kp, a.ata);
    // The Entry PDA is seeded on (round, wallet), so the second init fails.
    await expect(enter(round, a.kp, a.ata)).rejects.toThrow();
  });

  it('refuses an entrant who cannot pay the fee', async () => {
    const round = await createRound();
    const broke = newEntrant(1_000_000n); // 1 SKR, fee is 5
    await expect(enter(round, broke.kp, broke.ata)).rejects.toThrow();
    expect(balance(vaultPda(round))).toBe(0n);
  });
});

describe('voting', () => {
  it('counts one vote per wallet and refuses a second', async () => {
    const round = await createRound();
    const a = newEntrant(20_000_000n);
    await enter(round, a.kp, a.ata);
    const voter = Keypair.generate();
    fund(voter);

    await vote(round, voter, entryPda(round, a.kp.publicKey));
    expect((await program.account.entry.fetch(entryPda(round, a.kp.publicKey))).votes).toBe(1);

    await expect(vote(round, voter, entryPda(round, a.kp.publicKey))).rejects.toThrow();
  });

  it('refuses a vote for your own entry', async () => {
    const round = await createRound();
    const a = newEntrant(20_000_000n);
    await enter(round, a.kp, a.ata);
    await expect(vote(round, a.kp, entryPda(round, a.kp.publicKey))).rejects.toThrow(/SelfVote/);
  });

  it('records how early the vote was', async () => {
    const round = await createRound();
    const a = newEntrant(20_000_000n);
    await enter(round, a.kp, a.ata);
    const first = Keypair.generate();
    const second = Keypair.generate();
    fund(first);
    fund(second);
    const entry = entryPda(round, a.kp.publicKey);
    await vote(round, first, entry);
    await vote(round, second, entry);

    expect((await program.account.vote.fetch(votePda(round, first.publicKey))).rankAtVote).toBe(0);
    expect((await program.account.vote.fetch(votePda(round, second.publicKey))).rankAtVote).toBe(1);
  });
});

describe('payout', () => {
  it('pays the winner 60% of the pot, once, and only after the round ends', async () => {
    const endsAt = now() + HOUR;
    const round = await createRound(endsAt);
    const a = newEntrant(20_000_000n);
    const b = newEntrant(20_000_000n);
    await enter(round, a.kp, a.ata);
    await enter(round, b.kp, b.ata);
    const entryA = entryPda(round, a.kp.publicKey);
    // A place has to be EARNED — claim_place checks the leaderboard the votes built.
    await vote(round, b.kp, entryA);

    // Claiming before the end must fail, or a round could be drained early.
    await expect(claim(round, entryA, a.ata, 1)).rejects.toThrow(/RoundOpen/);

    skipTo(endsAt + 1);
    // Same reason as below: the rejected claim above and this one would be the
    // same bytes, and a duplicate is dropped before the program runs.
    svm.expireBlockhash();
    const pot = balance(vaultPda(round)); // 10 SKR
    await claim(round, entryA, a.ata, 1);
    expect(balance(a.ata)).toBe(15_000_000n + (pot * 6000n) / 10_000n);

    // Paying twice is the failure that empties a vault. `paid` is the guard.
    // The blockhash has to move first: an identical transaction is rejected as a
    // duplicate before the program ever runs, which would pass this test for the
    // wrong reason.
    svm.expireBlockhash();
    await expect(claim(round, entryA, a.ata, 1)).rejects.toThrow(/AlreadyPaid/);
  });

  // The defect this guards: payouts used to divide the LIVE vault balance, so
  // every claim shrank the base for the next one and whoever submitted first
  // decided what everyone got. A runner-up claiming before first place got
  // 6.25% of the full pot; claiming after, 6.25% of what was left — 2.5%.
  it('pays a runner-up the same share whoever claims first', async () => {
    // Four entrants so there is a real pot and a real second place.
    const run = async (runnerFirst: boolean) => {
      const endsAt = now() + HOUR;
      const round = await createRound(endsAt);
      const a = newEntrant(20_000_000n);
      const b = newEntrant(20_000_000n);
      const v1 = newEntrant(20_000_000n);
      const v2 = newEntrant(20_000_000n);
      for (const e of [a, b, v1, v2]) await enter(round, e.kp, e.ata);
      const entryA = entryPda(round, a.kp.publicKey);
      const entryB = entryPda(round, b.kp.publicKey);
      // Two votes for A, one for B: A is place 1, B is place 2.
      await vote(round, v1.kp, entryA);
      await vote(round, v2.kp, entryA);
      await vote(round, a.kp, entryB);

      skipTo(endsAt + 1);
      svm.expireBlockhash();
      const pot = balance(vaultPda(round));
      const beforeB = balance(b.ata);
      if (runnerFirst) {
        await claim(round, entryB, b.ata, 2);
        svm.expireBlockhash();
        await claim(round, entryA, a.ata, 1);
      } else {
        await claim(round, entryA, a.ata, 1);
        svm.expireBlockhash();
        await claim(round, entryB, b.ata, 2);
      }
      return { runnerGot: balance(b.ata) - beforeB, pot };
    };

    const runnerFirst = await run(true);
    const winnerFirst = await run(false);

    // Same pot either way, and the runner-up is paid the same both times.
    expect(runnerFirst.pot).toBe(winnerFirst.pot);
    expect(runnerFirst.runnerGot).toBe(winnerFirst.runnerGot);
    // And it is the share the rules promise: 25% split across four places.
    expect(runnerFirst.runnerGot).toBe((runnerFirst.pot * 2500n) / 10_000n / 4n);
  });

  it('refuses to pay a winner into someone else\'s token account', async () => {
    const endsAt = now() + HOUR;
    const round = await createRound(endsAt);
    const a = newEntrant(20_000_000n);
    const thief = newEntrant(0n);
    await enter(round, a.kp, a.ata);
    await vote(round, thief.kp, entryPda(round, a.kp.publicKey));
    skipTo(endsAt + 1);

    await expect(claim(round, entryPda(round, a.kp.publicKey), thief.ata, 1)).rejects.toThrow(
      /WrongWinnerAccount/,
    );
    expect(balance(thief.ata)).toBe(0n);
  });

  it('refuses a place outside 1..5', async () => {
    const endsAt = now() + HOUR;
    const round = await createRound(endsAt);
    const a = newEntrant(20_000_000n);
    await enter(round, a.kp, a.ata);
    skipTo(endsAt + 1);
    await expect(claim(round, entryPda(round, a.kp.publicKey), a.ata, 6)).rejects.toThrow(/BadPlace/);
  });

  it('refuses an entry from a different round', async () => {
    const endsAt = now() + HOUR;
    const roundOne = await createRound(endsAt);
    const a = newEntrant(40_000_000n);
    await enter(roundOne, a.kp, a.ata);
    const entryOne = entryPda(roundOne, a.kp.publicKey);

    const roundTwo = await createRound(endsAt);
    const b = newEntrant(20_000_000n);
    await enter(roundTwo, b.kp, b.ata);
    skipTo(endsAt + 1);

    // Round two's pot must not pay round one's entry.
    await expect(claim(roundTwo, entryOne, a.ata, 1)).rejects.toThrow();
  });
});

describe('the leaderboard decides who gets paid', () => {
  it('refuses a claim from an entry that won nothing', async () => {
    const endsAt = now() + HOUR;
    const round = await createRound(endsAt);
    const a = newEntrant(20_000_000n);
    const greedy = newEntrant(20_000_000n);
    await enter(round, a.kp, a.ata);
    await enter(round, greedy.kp, greedy.ata);
    // `a` is the only entry anyone voted for.
    await vote(round, greedy.kp, entryPda(round, a.kp.publicKey));
    skipTo(endsAt + 1);

    // Without the leaderboard check this is how the vault gets emptied: claim
    // first place for your own entry, no votes required.
    await expect(claim(round, entryPda(round, greedy.kp.publicKey), greedy.ata, 1)).rejects.toThrow(
      /NotThisPlace/,
    );
    expect(balance(greedy.ata)).toBe(15_000_000n);
  });

  it('orders the top five by votes, and a tie keeps the earlier entry ahead', async () => {
    const round = await createRound();
    const a = newEntrant(20_000_000n);
    const b = newEntrant(20_000_000n);
    await enter(round, a.kp, a.ata);
    await enter(round, b.kp, b.ata);
    const entryA = entryPda(round, a.kp.publicKey);
    const entryB = entryPda(round, b.kp.publicKey);

    const voters = [0, 1, 2].map(() => {
      const kp = Keypair.generate();
      fund(kp);
      return kp;
    });
    await vote(round, voters[0], entryB); // B leads with 1
    await vote(round, voters[1], entryA); // A ties at 1 but arrived later
    let top = (await program.account.round.fetch(round)).top as PublicKey[];
    expect(top[0].toBase58()).toBe(entryB.toBase58());
    expect(top[1].toBase58()).toBe(entryA.toBase58());

    await vote(round, voters[2], entryA); // A takes the lead with 2
    top = (await program.account.round.fetch(round)).top as PublicKey[];
    expect(top[0].toBase58()).toBe(entryA.toBase58());
    expect(top[1].toBase58()).toBe(entryB.toBase58());
    // One entry, one place: a second vote must move it, not list it twice.
    expect(top.filter((k) => k.toBase58() === entryA.toBase58())).toHaveLength(1);
  });
});

describe('SKR holders pay less', () => {
  it('charges 80% of the fee to a wallet holding 100 SKR or more', async () => {
    const round = await createRound();
    const holder = newEntrant(100_000_000n); // exactly the threshold
    await enter(round, holder.kp, holder.ata);

    const discounted = (BigInt(FEE.toString()) * 8_000n) / 10_000n;
    expect(balance(vaultPda(round))).toBe(discounted);
    expect(balance(holder.ata)).toBe(100_000_000n - discounted);
    // The entry records what was actually paid, so the gallery need not guess.
    expect((await program.account.entry.fetch(entryPda(round, holder.kp.publicKey))).paidFee.toString()).toBe(
      discounted.toString(),
    );
  });

  it('charges face value just below the threshold', async () => {
    const round = await createRound();
    const almost = newEntrant(99_999_999n);
    await enter(round, almost.kp, almost.ata);
    expect(balance(vaultPda(round))).toBe(BigInt(FEE.toString()));
  });

  it('cannot be claimed by a wallet that does not hold the tokens', async () => {
    // The discount reads the entrant's OWN token account, which `enter` also
    // debits — there is no second account a caller could point at instead.
    const round = await createRound();
    const poser = newEntrant(20_000_000n);
    const rich = newEntrant(500_000_000n);
    await expect(
      program.methods
        .enter('https://r2.test/a.png')
        .accountsPartial({
          entrant: poser.kp.publicKey,
          round,
          entry: entryPda(round, poser.kp.publicKey),
          vault: vaultPda(round),
          entrantTokens: rich.ata, // not theirs to spend
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([poser.kp])
        .rpc(),
    ).rejects.toThrow();
    expect(balance(rich.ata)).toBe(500_000_000n);
  });
});
