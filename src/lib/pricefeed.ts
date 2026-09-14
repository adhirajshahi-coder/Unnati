/**
 * Live mandi prices from the government feed.
 *
 * Source: data.gov.in resource 9ef84268-d588-465a-a308-a864a43d0070,
 * "Current Daily Price of Various Commodities from Various Markets (Mandi)",
 * published by the Ministry of Agriculture and Farmers Welfare. Prices are in rupees
 * per quintal, which is what this app stores, so no unit conversion is involved.
 *
 * Requires `DATA_GOV_API_KEY`. A free key takes a minute to register at
 * https://data.gov.in — without one the app keeps serving the seeded prices and says
 * so rather than pretending they are live.
 *
 * Two things about this feed that shape the code below:
 *
 *   1. It reports **no coordinates**, only state/district/market names. Distance is
 *      the basis of every ranking here, so we pull prices only for the mandis in
 *      `src/data/mandis.ts`, which carry real coordinates and the matching keys.
 *
 *   2. It carries **genuine outliers** — a misplaced decimal, or a herb quoted by a
 *      different convention (coriander leaves at ₹32,000/quintal appears in a live
 *      response). Every row is bounded by the crop's plausible range before it is
 *      stored. A farmer driving 200 km on a bad number is the worst failure this
 *      product has, so a rejected row is strictly better than a wrong one.
 */

const ENDPOINT =
  "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";

/** Source label written onto every record this module produces. */
export const LIVE_SOURCE = "AGMARKNET_LIVE";

export interface FeedRecord {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  grade: string;
  arrival_date: string; // dd/mm/yyyy
  min_price: number | string;
  max_price: number | string;
  modal_price: number | string;
}

export interface MandiKey {
  id: string;
  agmarknetMarket: string | null;
  agmarknetState: string | null;
  agmarknetDistrict: string | null;
}

export interface CropKey {
  id: string;
  agmarknetName: string | null;
  sanePriceMin: number;
  sanePriceMax: number;
}

export interface IngestRow {
  mandiId: string;
  cropId: string;
  minPrice: number;
  modalPrice: number;
  maxPrice: number;
  source: string;
  recordedAt: Date;
}

export interface IngestResult {
  rows: IngestRow[];
  marketsQueried: number;
  marketsWithData: number;
  recordsSeen: number;
  /** Rows dropped because the price fell outside the crop's plausible range. */
  rejectedOutOfRange: number;
  /** Rows dropped because the commodity matches no crop we carry. */
  skippedUnknownCommodity: number;
  errors: string[];
}

export function hasApiKey(): boolean {
  return Boolean(process.env.DATA_GOV_API_KEY);
}

/**
 * Agmarknet spells the same commodity several ways across markets and over time
 * ("Soyabean" / "Soyabeen", "Bhindi(Ladies Finger)" / "Bhindi"). Comparing on a
 * stripped, lowercased key absorbs most of that without a hand-maintained alias list.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // drop parenthesised qualifiers
    .replace(/[^a-z]/g, "");
}

/** dd/mm/yyyy, as the feed writes it. Returns null on anything unparseable. */
export function parseArrivalDate(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;

  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 9, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Turn one feed row into a storable record, or explain why it cannot be stored.
 *
 * Exported so the bounds behaviour is directly testable — it is the guard standing
 * between a wrong government figure and a farmer's decision.
 */
export function toRow(
  record: FeedRecord,
  mandiId: string,
  crop: CropKey,
): { ok: true; row: IngestRow } | { ok: false; reason: "range" | "unparseable" } {
  const modal = Number(record.modal_price);
  const min = Number(record.min_price);
  const max = Number(record.max_price);

  if (!Number.isFinite(modal) || modal <= 0) {
    return { ok: false, reason: "unparseable" };
  }
  if (modal < crop.sanePriceMin || modal > crop.sanePriceMax) {
    return { ok: false, reason: "range" };
  }

  // Some rows carry a zero or missing min/max; fall back to the modal price rather
  // than storing a zero that would later read as "this mandi pays nothing".
  const safeMin = Number.isFinite(min) && min > 0 ? Math.round(min) : Math.round(modal);
  const safeMax = Number.isFinite(max) && max > 0 ? Math.round(max) : Math.round(modal);

  return {
    ok: true,
    row: {
      mandiId,
      cropId: crop.id,
      minPrice: Math.min(safeMin, safeMax),
      modalPrice: Math.round(modal),
      maxPrice: Math.max(safeMin, safeMax),
      source: LIVE_SOURCE,
      recordedAt: parseArrivalDate(record.arrival_date) ?? new Date(),
    },
  };
}

async function fetchMarket(
  market: string,
  apiKey: string,
  limit: number,
  signal?: AbortSignal,
): Promise<FeedRecord[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("filters[market]", market);

  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${market}: HTTP ${res.status}`);
  }

  const body = (await res.json()) as { records?: FeedRecord[] };
  return body.records ?? [];
}

/**
 * Pull current prices for the given mandis.
 *
 * One request per mandi, filtered by market name. That is deliberate rather than
 * pulling the whole 10,000-row national feed: the shared demo key on data.gov.in is
 * throttled to ten rows a request, so paging the national feed would take a thousand
 * calls, while twenty market-filtered calls return exactly what we need.
 */
export async function fetchLivePrices(
  mandis: MandiKey[],
  crops: CropKey[],
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<IngestResult> {
  const apiKey = process.env.DATA_GOV_API_KEY;
  const result: IngestResult = {
    rows: [],
    marketsQueried: 0,
    marketsWithData: 0,
    recordsSeen: 0,
    rejectedOutOfRange: 0,
    skippedUnknownCommodity: 0,
    errors: [],
  };

  if (!apiKey) {
    result.errors.push(
      "DATA_GOV_API_KEY is not set. Register a free key at data.gov.in to pull live prices.",
    );
    return result;
  }

  // Index crops by their normalised Agmarknet name for O(1) lookup per row.
  const byCommodity = new Map<string, CropKey>();
  for (const c of crops) {
    if (c.agmarknetName) byCommodity.set(normalise(c.agmarknetName), c);
  }

  const targets = mandis.filter((m) => m.agmarknetMarket);
  const limit = opts.limit ?? 100;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 90_000,
  );

  try {
    for (const mandi of targets) {
      result.marketsQueried += 1;

      let records: FeedRecord[];
      try {
        records = await fetchMarket(
          mandi.agmarknetMarket!,
          apiKey,
          limit,
          controller.signal,
        );
      } catch (err) {
        result.errors.push(
          err instanceof Error ? err.message : `${mandi.id}: request failed`,
        );
        continue;
      }

      if (records.length > 0) result.marketsWithData += 1;

      // The feed returns a market's history, not only today. Keep the newest row per
      // crop so one ingest cannot overwrite a fresh price with a stale one.
      const newestPerCrop = new Map<string, IngestRow>();

      for (const record of records) {
        result.recordsSeen += 1;

        const crop = byCommodity.get(normalise(record.commodity));
        if (!crop) {
          result.skippedUnknownCommodity += 1;
          continue;
        }

        const converted = toRow(record, mandi.id, crop);
        if (!converted.ok) {
          if (converted.reason === "range") result.rejectedOutOfRange += 1;
          continue;
        }

        const existing = newestPerCrop.get(crop.id);
        if (
          !existing ||
          converted.row.recordedAt.getTime() > existing.recordedAt.getTime()
        ) {
          newestPerCrop.set(crop.id, converted.row);
        }
      }

      result.rows.push(...newestPerCrop.values());
    }
  } finally {
    clearTimeout(timer);
  }

  return result;
}
