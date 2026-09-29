/**
 * Print the all-time Arena standings the Board tab shows.
 *
 *   npm run arena:board
 *
 * Runs the same `fetchStandings()` the app calls, against the same RPC, so a
 * wrong offset or a bad filter shows up here rather than as an empty screen.
 */
import { fetchStandings, shortAddress } from '../src/arena/client';

async function main() {
  const rows = await fetchStandings();
  if (rows.length === 0) {
    console.log('no standings yet — no ended round has a voted entry');
    return;
  }
  console.log(`${rows.length} player(s)\n`);
  rows.forEach((r, i) =>
    console.log(`${String(i + 1).padStart(2)}  ${shortAddress(r.entrant)}  wins ${r.wins}  finishes ${r.places}  votes ${r.votes}`),
  );
}
void main();
