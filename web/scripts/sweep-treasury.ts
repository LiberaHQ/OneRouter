// Manually run the treasury sweep — the same batch job as POST /v1/admin/treasury/sweep,
// as a script so it can be run by hand or from a cron entry without needing the admin
// token or the server reachable from wherever the schedule runs.
//
// Defaults to a DRY RUN: it prints every account that owes at least the threshold and
// what would be sent, but sends nothing. Real money only moves with --execute.
//
//   cd web
//   npm run sweep-treasury              # dry run
//   npm run sweep-treasury -- --execute # for real
//
// Or directly:
//   node --env-file=.env.local --import tsx scripts/sweep-treasury.ts [--execute] [--min-usd=N]
import { STORE } from "../lib/gateway/store";
import { configured, sweepDue, sweepThresholdUsd } from "../lib/gateway/treasury";

async function main() {
  const execute = process.argv.includes("--execute");
  const minUsdArg = process.argv.find((a) => a.startsWith("--min-usd="));
  const minUsd = minUsdArg ? Number(minUsdArg.split("=")[1]) : sweepThresholdUsd();

  const [ready, why] = configured();
  if (!ready) {
    console.error(`Treasury sweep is not available: ${why}`);
    process.exit(1);
  }

  const due = STORE.accountsOwingTreasury(minUsd);
  if (due.length === 0) {
    console.log(`No account owes at least $${minUsd.toFixed(2)} — nothing to do.`);
    return;
  }

  console.log(`${due.length} account(s) owe at least $${minUsd.toFixed(2)}:`);
  for (const acct of due) {
    console.log(`  ${acct.id}  owed $${(acct.owed_treasury ?? 0).toFixed(6)}`);
  }

  if (!execute) {
    console.log("\nDry run — nothing was sent. Re-run with --execute to actually sweep.");
    return;
  }

  console.log("\nSweeping for real...");
  const results = await sweepDue(minUsd);
  if (results.length === 0) {
    console.log("Nothing actually sent — every account's on-chain balance was below its gas cost. Still owed; try again once it's grown.");
    return;
  }
  let total = 0;
  for (const r of results) {
    console.log(`  ${r.account}  swept $${r.swept_usd.toFixed(6)}  tx ${r.tx}`);
    total += r.swept_usd;
  }
  console.log(`\nSwept $${total.toFixed(6)} across ${results.length} account(s).`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .then(() => process.exit(0));
