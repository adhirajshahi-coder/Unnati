/**
 * Net realisable price ranking.
 *
 * FR-1: fetch and display mandi prices within a configurable radius.
 * FR-2: calculate net realisable price per mandi, factoring transport and spoilage.
 *
 * The whole product rests on one idea: the mandi with the highest quoted price is
 * frequently not the mandi that leaves the most money in a farmer's hand. This module
 * is where that gets decided, and every subtraction below is shown to the farmer as a
 * line item — no hidden markup (PRD §8).
 *
 *   sale value      = modal price × quintals
 *   − commission    = arhtiya / APMC cut at the mandi
 *   − market fee    = entry and labour charges, per quintal
 *   − transport     = the farmer's actual share, pooled if a truck is available
 *   − spoilage      = value lost to time in transit, from shelf life
 *   = net realisable
 */
import { roadDistanceKm, transitHours, type Point } from "./geo";
import { estimateSpoilage } from "./spoilage";
import { tripCost } from "./costs";

export interface MandiCandidate {
  id: string;
  name: string;
  nameHi: string;
  district: string;
  state: string;
  lat: number;
  lng: number;
  commissionRate: number;
  marketFeePerQuintal: number;
  /** Latest price for the crop in question. Mandis with no recent price are skipped. */
  modalPrice: number;
  minPrice: number;
  maxPrice: number;
  source: string;
  recordedAt: Date;
}

export interface RankInput {
  origin: Point;
  quantityKg: number;
  grade: "A" | "B" | "C";
  hoursSinceHarvest: number;
  crop: { spoilageRatePerDay: number; shelfLifeHours: number };
  candidates: MandiCandidate[];
  /** Only consider mandis within this many road-km. PRD suggests 10–150. */
  radiusKm: number;
  /** ₹/km for a whole vehicle if the farmer has to hire one alone. */
  soloRatePerKm: number;
  /**
   * Per-mandi pooled transport offers, when an open trip already exists. Keyed by
   * mandi id. When present this is what the farmer actually pays, and it is usually
   * far less than hiring alone — which is the entire point of the pooling marketplace.
   */
  pooledOffers?: Record<
    string,
    { costForThisLoad: number; tripId: string; departAt: Date; seatsKg: number }
  >;
}

export interface RankedMandi {
  mandi: MandiCandidate;
  distanceKm: number;
  transitHours: number;
  quintals: number;
  grossValue: number;
  commission: number;
  marketFee: number;
  transportCost: number;
  /** True when transportCost came from an existing pooled trip rather than solo hire. */
  pooled: boolean;
  pooledTripId?: string;
  spoilageLoss: number;
  spoilagePercent: number;
  exceedsShelfLife: boolean;
  netValue: number;
  /** Net ₹ per quintal — comparable across mandis regardless of load size. */
  netPerQuintal: number;
  /** Net value minus the net value of the best local option, in rupees. */
  advantageOverNearest: number;
  /** LOW when the price is stale or thinly traded. */
  confidence: "HIGH" | "MEDIUM" | "LOW";
  priceAgeHours: number;
}

const HOURS = 1000 * 60 * 60;

export function rankMandis(input: RankInput, now = new Date()): RankedMandi[] {
  const {
    origin,
    quantityKg,
    grade,
    hoursSinceHarvest,
    crop,
    candidates,
    radiusKm,
    soloRatePerKm,
    pooledOffers = {},
  } = input;

  const quintals = quantityKg / 100;

  const ranked = candidates
    .map((m): RankedMandi | null => {
      const distanceKm = roadDistanceKm(origin, { lat: m.lat, lng: m.lng });
      if (distanceKm > radiusKm) return null;

      const hours = transitHours(distanceKm);

      const offer = pooledOffers[m.id];
      const pooled = Boolean(offer);
      const transportCost = offer
        ? offer.costForThisLoad
        : tripCost(distanceKm, soloRatePerKm);

      const grossValue = Math.round(m.modalPrice * quintals);
      const commission = Math.round(grossValue * m.commissionRate);
      const marketFee = Math.round(m.marketFeePerQuintal * quintals);

      const spoil = estimateSpoilage({
        spoilageRatePerDay: crop.spoilageRatePerDay,
        shelfLifeHours: crop.shelfLifeHours,
        hoursSinceHarvest,
        transitHours: hours,
        grade,
      });

      // Spoilage is a loss of saleable produce, so it bites the gross sale value.
      const spoilageLoss = Math.round(grossValue * spoil.lossFraction);

      const netValue =
        grossValue - commission - marketFee - transportCost - spoilageLoss;

      const priceAgeHours = Math.max(
        0,
        (now.getTime() - m.recordedAt.getTime()) / HOURS,
      );

      return {
        mandi: m,
        distanceKm,
        transitHours: hours,
        quintals: Math.round(quintals * 100) / 100,
        grossValue,
        commission,
        marketFee,
        transportCost,
        pooled,
        pooledTripId: offer?.tripId,
        spoilageLoss,
        spoilagePercent: spoil.lossPercent,
        exceedsShelfLife: spoil.exceedsShelfLife,
        netValue,
        netPerQuintal: quintals > 0 ? Math.round(netValue / quintals) : 0,
        advantageOverNearest: 0, // filled in below, once we know the baseline
        confidence: confidenceOf(priceAgeHours, m),
        priceAgeHours: Math.round(priceAgeHours * 10) / 10,
      };
    })
    .filter((r): r is RankedMandi => r !== null);

  if (ranked.length === 0) return [];

  // The baseline a farmer is compared against is what they would do by default:
  // cart the produce to the closest mandi. Every other option is measured from there.
  const nearest = ranked.reduce((a, b) => (b.distanceKm < a.distanceKm ? b : a));
  for (const r of ranked) {
    r.advantageOverNearest = r.netValue - nearest.netValue;
  }

  // Rank by what the farmer takes home. Ties break toward the closer mandi, because a
  // shorter run is less exposed to delay and handling damage.
  return ranked.sort(
    (a, b) => b.netValue - a.netValue || a.distanceKm - b.distanceKm,
  );
}

function confidenceOf(
  priceAgeHours: number,
  m: MandiCandidate,
): "HIGH" | "MEDIUM" | "LOW" {
  // A wide min–max spread means the day's lots varied a lot, so the modal price is a
  // weaker predictor of what this particular consignment will fetch.
  const spread = m.maxPrice > 0 ? (m.maxPrice - m.minPrice) / m.maxPrice : 1;
  if (priceAgeHours > 48 || spread > 0.5) return "LOW";
  if (priceAgeHours > 12 || spread > 0.3) return "MEDIUM";
  return "HIGH";
}
