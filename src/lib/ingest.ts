/**
 * Price ingest — pulls the live feed and writes it into `price_records`.
 *
 * Shared by the CLI (`npm run db:ingest`) and the admin button, so both do exactly the
 * same thing. Records are appended rather than overwritten: `latestPrices()` already
 * takes the newest row per mandi, and keeping the history is what makes the price
 * trend and the staleness warnings possible.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { crops, mandis, priceRecords, feedHealth } from "@/db/schema";
import { fetchLivePrices, hasApiKey, LIVE_SOURCE } from "@/lib/pricefeed";

export interface IngestSummary {
  ok: boolean;
  inserted: number;
  marketsQueried: number;
  marketsWithData: number;
  recordsSeen: number;
  rejectedOutOfRange: number;
  skippedUnknownCommodity: number;
  errors: string[];
  ranAt: Date;
}

export async function runIngest(): Promise<IngestSummary> {
  const db = await getDb();
  const ranAt = new Date();

  const mandiKeys = await db
    .select({
      id: mandis.id,
      agmarknetMarket: mandis.agmarknetMarket,
      agmarknetState: mandis.agmarknetState,
      agmarknetDistrict: mandis.agmarknetDistrict,
    })
    .from(mandis);

  const cropKeys = await db
    .select({
      id: crops.id,
      agmarknetName: crops.agmarknetName,
      sanePriceMin: crops.sanePriceMin,
      sanePriceMax: crops.sanePriceMax,
    })
    .from(crops);

  const feed = await fetchLivePrices(mandiKeys, cropKeys);

  if (feed.rows.length > 0) {
    // One statement rather than a loop: an ingest writes a few hundred rows and a
    // round trip each would dominate the run.
    await db.insert(priceRecords).values(
      feed.rows.map((r) => ({
        mandiId: r.mandiId,
        cropId: r.cropId,
        minPrice: r.minPrice,
        modalPrice: r.modalPrice,
        maxPrice: r.maxPrice,
        source: r.source,
        recordedAt: r.recordedAt,
      })),
    );
  }

  const ok = feed.rows.length > 0;
  const message = !hasApiKey()
    ? "No DATA_GOV_API_KEY set — serving seeded prices"
    : ok
      ? `${feed.rows.length} prices from ${feed.marketsWithData}/${feed.marketsQueried} markets`
      : feed.errors[0] ?? "Feed returned nothing for the tracked markets";

  // Upsert the health row so the ops dashboard can say when this last succeeded.
  const existing = await db
    .select({ id: feedHealth.id })
    .from(feedHealth)
    .where(eq(feedHealth.id, LIVE_SOURCE));

  if (existing.length > 0) {
    await db
      .update(feedHealth)
      .set({
        lastRunAt: ranAt,
        recordsIngested: feed.rows.length,
        ok,
        message,
      })
      .where(eq(feedHealth.id, LIVE_SOURCE));
  } else {
    await db.insert(feedHealth).values({
      id: LIVE_SOURCE,
      lastRunAt: ranAt,
      recordsIngested: feed.rows.length,
      ok,
      message,
    });
  }

  return {
    ok,
    inserted: feed.rows.length,
    marketsQueried: feed.marketsQueried,
    marketsWithData: feed.marketsWithData,
    recordsSeen: feed.recordsSeen,
    rejectedOutOfRange: feed.rejectedOutOfRange,
    skippedUnknownCommodity: feed.skippedUnknownCommodity,
    errors: feed.errors,
    ranAt,
  };
}

