import type { Config } from "drizzle-kit";

/**
 * drizzle-kit only ever *generates* SQL here — it is never pointed at PGlite.
 * The generated files in `drizzle/` are applied by the app at startup (PGlite) or by
 * `npm run db:migrate` during Render's pre-deploy step (node-postgres).
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/unnati",
  },
} satisfies Config;
