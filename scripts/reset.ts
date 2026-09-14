/**
 * Wipe the local embedded database and start over.
 *
 * Only touches the PGlite directory, and refuses to run when DATABASE_URL points at a
 * real server — this is a development convenience, not an operations tool.
 */
import { rmSync, existsSync } from "node:fs";

if (process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is set. This script only resets the local PGlite database; it will not drop a real server.",
  );
  process.exit(1);
}

const dir = process.env.PGLITE_DIR ?? ".data/pglite";

if (existsSync(dir)) {
  rmSync(dir, { recursive: true, force: true });
  console.log(`Removed ${dir}. Run "npm run db:seed" to rebuild it.`);
} else {
  console.log(`Nothing to remove at ${dir}.`);
}
