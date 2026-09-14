/**
 * Pull live mandi prices into the database.
 *
 * Run with: npm run db:ingest
 * Needs DATA_GOV_API_KEY — a free key from https://data.gov.in.
 */
import { config } from "dotenv";

// Next.js loads .env.local automatically; a plain script does not, so load the same
// files in the same precedence order the framework uses.
config({ path: ".env.local" });
config({ path: ".env" });

import { runIngest } from "../src/lib/ingest";

runIngest()
  .then((r) => {
    console.log(`\nIngest ${r.ok ? "succeeded" : "produced nothing"}`);
    console.log(`  markets queried     ${r.marketsQueried}`);
    console.log(`  markets with data   ${r.marketsWithData}`);
    console.log(`  feed rows seen      ${r.recordsSeen}`);
    console.log(`  prices stored       ${r.inserted}`);
    console.log(`  rejected, bad range ${r.rejectedOutOfRange}`);
    console.log(`  skipped, other crop ${r.skippedUnknownCommodity}`);
    for (const e of r.errors.slice(0, 8)) console.log(`  ! ${e}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
