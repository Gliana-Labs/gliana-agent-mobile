/** Print today's round and its entries — the quickest way to see what landed. */
import { fetchEntries, fetchRound, roundAddress } from '../src/arena/client';
import { roundIdFor, skr } from '../src/arena/config';

async function main() {
  const id = roundIdFor();
  const [addr] = await roundAddress(id);
  const round = await fetchRound(id);
  console.log(`round ${id} "${round?.theme}" · entries ${round?.entryCount} · top ${round?.top[0]}`);
  for (const e of await fetchEntries(addr)) {
    console.log(`  ${e.address}\n    by ${e.data.entrant} · votes ${e.data.votes} · paid ${skr(e.data.paidFee)} SKR\n    ${e.data.mediaUri.slice(0, 80)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
