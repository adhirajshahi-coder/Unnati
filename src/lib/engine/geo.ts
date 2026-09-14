/** Geographic helpers. Pure functions, no I/O. */

export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance in kilometres.
 *
 * This is straight-line distance. Real trucks follow roads, so callers that need a
 * travel estimate should pass the result through `roadDistanceKm`.
 */
export function haversineKm(a: Point, b: Point): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Road distance estimate.
 *
 * Roads do not run in straight lines. For the Indian state-highway network a detour
 * index around 1.3 is the usual planning figure — a 100 km crow-flight leg is about
 * 130 km of driving. Replace this with a routing API (OSRM, Google Directions) when
 * one is available; every caller goes through this function so there is one place to
 * change.
 */
export const ROAD_DETOUR_INDEX = 1.3;

export function roadDistanceKm(a: Point, b: Point): number {
  return round1(haversineKm(a, b) * ROAD_DETOUR_INDEX);
}

/**
 * Extra distance added to an A→B trip by collecting at `via` on the way.
 *
 * Always >= 0: picking up en route can never shorten the run. A pickup that sits
 * exactly on the line returns 0.
 */
export function detourKm(origin: Point, via: Point, destination: Point): number {
  const direct = roadDistanceKm(origin, destination);
  const viaRoute =
    roadDistanceKm(origin, via) + roadDistanceKm(via, destination);
  return round1(Math.max(0, viaRoute - direct));
}

/**
 * Estimated transit hours, including a fixed allowance for loading, mandi queueing
 * and rest stops. Rural highway running averages well under open-road speed.
 */
export const AVG_SPEED_KMPH = 35;
export const FIXED_HANDLING_HOURS = 2.5;

export function transitHours(distanceKm: number): number {
  return round1(distanceKm / AVG_SPEED_KMPH + FIXED_HANDLING_HOURS);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
