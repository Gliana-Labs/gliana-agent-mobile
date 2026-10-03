/**
 * Print today's round and its entries — the quickest way to see what landed.
 *
 * Read-only: no wallet, no keypair, nothing to fund. This is the script the
 * README points a reviewer at, so it has to be honest about the case where
 * there is nothing to print: a round exists only once somebody opens it, and
 * the day rolls at 19:00 WIB, so for part of every day the answer is "not yet".
 */
import { fetchEntries, fetchRound, roundAddress } from '../src/arena/client';
import { roundIdFor, skr, themeFor, kindFor, sourceFor } from '../src/arena/config';

async function main() {
  const id = roundIdFor();
  const [addr] = await roundAddress(id);

  // The theme comes from the id, not the chain, so it prints whether or not the
  // round has been opened.
  console.log(`round ${id}  "${themeFor(id)}"  [${kindFor(id)} · ${sourceFor(id)}]`);
  console.log(`  pda ${addr}`);

  const round = await fetchRound(id);
  if (!round) {
    console.log('\nNobody has opened this round yet. Whoever gets there first opens it;');
    console.log('it costs a fraction of a cent in rent and gives no advantage.');
    return;
  }

  console.log(`  entries ${round.entryCount} · fee ${skr(round.entryFee)} SKR · settled ${round.settled}`);
  const entries = await fetchEntries(addr);
  if (entries.length === 0) {
    console.log('\nOpen, but nothing entered yet.');
    return;
  }
  console.log('');
  for (const e of entries) {
    console.log(`  ${e.address}`);
    console.log(`    by ${e.data.entrant} · votes ${e.data.votes} · paid ${skr(e.data.paidFee)} SKR`);
    console.log(`    ${e.data.mediaUri.slice(0, 80)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
