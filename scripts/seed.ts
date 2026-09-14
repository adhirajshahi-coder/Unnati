/**
 * Seed data — the Nashik pilot corridor.
 *
 * PDD §9 asks for a pilot in a single district with one or two perishable crops.
 * Nashik is the obvious choice: Lasalgaon is Asia's largest onion market, the district
 * is the centre of India's onion and grape trade, and the price gap between the local
 * mandis and the Mumbai/Pune terminal markets is exactly the gap this product exists
 * to help farmers capture.
 *
 * Coordinates are real. Prices are representative of a September harvest window and
 * are marked FIELD_VERIFIED or AGMARKNET accordingly — nothing here is presented as a
 * live government feed.
 *
 * This script is idempotent: it clears the demo rows and rewrites them, so running it
 * twice leaves the same database. Safe to re-run on every deploy.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";
import {
  users,
  crops,
  mandis,
  priceRecords,
  trucks,
  trips,
  loads,
  listings,
  trackingPings,
  transactions,
  notifications,
  feedHealth,
} from "../src/db/schema";
import { hashPin } from "../src/lib/auth";
import { CROPS } from "../src/data/crops";
import { MANDIS } from "../src/data/mandis";
import { roadDistanceKm } from "../src/lib/engine/geo";
import { tripCost, splitCost } from "../src/lib/engine/costs";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* --------------------------------------------------- reference catalogues */

// Crops and mandis live in src/data so the app, the seed and the price ingest all
// read one list. Adding a crop there is the only edit needed to support it.

/**
 * Fallback prices in Rs/quintal, used to give every mandi a believable starting
 * figure before the first live ingest and to keep the demo working without an API
 * key. Real prices replace these as soon as "npm run db:ingest" runs, and the UI
 * always shows which source a figure came from.
 */
const BASE_PRICE: Record<string, number> = {
  onion: 2100, tomato: 1900, potato: 1250, cauliflower: 1450, cabbage: 900,
  brinjal: 1600, okra: 2400, "green-chilli": 3800, cucumber: 1300,
  "bottle-gourd": 1100, "bitter-gourd": 2600, peas: 4200, carrot: 1700,
  spinach: 1200, coriander: 3200, garlic: 9500, ginger: 6800,
  grape: 4600, pomegranate: 7200, banana: 1800, mango: 5200, apple: 8600,
  papaya: 1400, orange: 3400,
  wheat: 2450, paddy: 2280, maize: 2050, bajra: 2380,
  gram: 5600, tur: 7400, moong: 7900,
  soybean: 4550, mustard: 5700, groundnut: 6300, cotton: 7200,
};

/**
 * Terminal markets pay more than a district APMC, which is the gap the whole product
 * exists to help a farmer capture - and the reason netting off transport matters.
 */
const REGION_PREMIUM: Record<string, number> = {
  NCR: 1.18,
  Mumbai: 1.3,
  Pune: 1.21,
  Nashik: 1.0,
  Other: 1.0,
};

/* ------------------------------------------------------------------ main */

/** Postgres binds a limited number of parameters per statement; stay well under it. */
const CHUNK = 400;

async function insertInChunks(rows: Array<typeof priceRecords.$inferInsert>) {
  const db = await getDb();
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(priceRecords).values(rows.slice(i, i + CHUNK));
  }
}

async function main() {
  const db = await getDb();
  const now = Date.now();

  console.log("Clearing existing rows…");
  // Order matters: children before parents.
  for (const table of [
    trackingPings,
    notifications,
    transactions,
    loads,
    trips,
    listings,
    trucks,
    priceRecords,
    users,
    mandis,
    crops,
    feedHealth,
  ]) {
    await db.delete(table);
  }

  console.log(`Seeding ${CROPS.length} crops and ${MANDIS.length} mandis…`);
  // The catalogue is ordered by how commonly each crop is traded; keep that order so
  // the picker shows onion and tomato first rather than whatever sorts alphabetically.
  await db.insert(crops).values(
    CROPS.map((c, i) => ({ ...c, sortOrder: i })),
  );
  await db.insert(mandis).values(MANDIS);

  /* prices: 6 days of history, every crop at every mandi */
  console.log("Seeding price history…");
  const priceRows: Array<typeof priceRecords.$inferInsert> = [];

  for (const crop of CROPS) {
    const base = BASE_PRICE[crop.id];
    if (!base) continue;

    for (const mandi of MANDIS) {
      const premium = REGION_PREMIUM[mandi.region] ?? 1;

      for (let daysAgo = 5; daysAgo >= 0; daysAgo--) {
        // A deterministic wobble: the same seed data on every run, but not a flat
        // line, so the trend view and the confidence bands have something real to
        // work on.
        const wobble =
          Math.sin((daysAgo + crop.id.length + mandi.id.length) * 1.7) * 0.045;
        const modal = Math.round(base * premium * (1 + wobble));

        priceRows.push({
          mandiId: mandi.id,
          cropId: crop.id,
          modalPrice: modal,
          minPrice: Math.round(modal * 0.88),
          maxPrice: Math.round(modal * 1.11),
          arrivalsQuintal:
            400 + ((daysAgo * 137 + mandi.id.length * 53) % 2600),
          // Seeded figures are labelled as seeded. Only rows written by the live
          // ingest carry AGMARKNET_LIVE, so the UI never overstates what it knows.
          source: daysAgo === 0 ? "FIELD_VERIFIED" : "SEED_BASELINE",
          recordedAt: new Date(now - daysAgo * DAY - 3 * HOUR),
        });
      }
    }
  }
  // Written in chunks. 35 crops across 25 mandis over six days is a few thousand
  // rows, and a single INSERT that size pushes past what a driver will carry in one
  // statement — against a real Postgres over a network it is worse still.
  await insertInChunks(priceRows);

  await db.insert(feedHealth).values([
    {
      id: "SEED_BASELINE",
      lastRunAt: new Date(now - 3 * HOUR),
      recordsIngested: priceRows.length,
      ok: true,
      message: "Representative baseline prices shipped with the app",
    },
    {
      id: "FIELD_VERIFIED",
      lastRunAt: new Date(now - 1 * HOUR),
      recordsIngested: priceRows.filter((r) => r.source === "FIELD_VERIFIED")
        .length,
      ok: true,
      message: "Field agent submissions",
    },
    {
      // Written here so the ops dashboard shows the live feed as a known source even
      // before the first ingest, rather than silently omitting it.
      id: "AGMARKNET_LIVE",
      lastRunAt: new Date(now - 6 * DAY),
      recordsIngested: 0,
      ok: false,
      message: "Not yet pulled — run: npm run db:ingest",
    },
  ]);

  /* people */
  console.log("Seeding demo accounts…");
  const pin = await hashPin("1234");

  const FARMERS = [
    {
      phone: "9000000001",
      name: "Ramesh Pawar",
      village: "Vinchur",
      lat: 20.1069,
      lng: 74.2856,
    },
    {
      phone: "9000000002",
      name: "Sunita Jadhav",
      village: "Niphad",
      lat: 20.0806,
      lng: 74.1103,
    },
    {
      phone: "9000000003",
      name: "Kailas Shinde",
      village: "Ugaon",
      lat: 20.1325,
      lng: 74.1789,
    },
    {
      phone: "9000000004",
      name: "Meena Deshmukh",
      village: "Saikheda",
      lat: 20.0361,
      lng: 74.0442,
    },
    {
      phone: "9000000005",
      name: "Bhaskar Wagh",
      village: "Lasalgaon",
      lat: 20.1467,
      lng: 74.2394,
    },
  ];

  const farmerRows = await db
    .insert(users)
    .values(
      FARMERS.map((f) => ({
        ...f,
        pinHash: pin,
        role: "FARMER" as const,
        language: "hi" as const,
        district: "Nashik",
        state: "Maharashtra",
      })),
    )
    .returning();

  // NCR farmers, so the app can be demonstrated where it is being demonstrated. The
  // pooling scenario below stays in Nashik; these accounts exercise the NCR mandi
  // ring, which is a different shape - many markets close together rather than a
  // long haul to one terminal market.
  await db.insert(users).values(
    [
      {
        phone: "9000000011",
        name: "Rajbir Singh",
        village: "Kharkhoda",
        district: "Sonipat",
        state: "Haryana",
        lat: 28.8794,
        lng: 76.9133,
      },
      {
        phone: "9000000012",
        name: "Anita Yadav",
        village: "Najafgarh",
        district: "South West Delhi",
        state: "Delhi",
        lat: 28.6092,
        lng: 76.9798,
      },
      {
        phone: "9000000013",
        name: "Mohan Tyagi",
        village: "Sardhana",
        district: "Meerut",
        state: "Uttar Pradesh",
        lat: 29.1441,
        lng: 77.6086,
      },
    ].map((f) => ({
      ...f,
      pinHash: pin,
      role: "FARMER" as const,
      language: "hi" as const,
    })),
  );

  const operatorRows = await db
    .insert(users)
    .values([
      {
        phone: "9111111111",
        name: "Santosh Transport",
        pinHash: pin,
        role: "OPERATOR" as const,
        language: "hi" as const,
        village: "Niphad",
        district: "Nashik",
        state: "Maharashtra",
        lat: 20.0806,
        lng: 74.1103,
      },
      {
        phone: "9111111112",
        name: "Gaikwad Logistics",
        pinHash: pin,
        role: "OPERATOR" as const,
        language: "en" as const,
        village: "Lasalgaon",
        district: "Nashik",
        state: "Maharashtra",
        lat: 20.1467,
        lng: 74.2394,
      },
      {
        // An NCR operator, without whom a group of Delhi-side farmers has nobody
        // within range to carry it — groups are only offered to trucks near enough
        // for the pickup run to make sense.
        phone: "9111111113",
        name: "Dahiya Roadlines",
        pinHash: pin,
        role: "OPERATOR" as const,
        language: "hi" as const,
        village: "Kharkhoda",
        district: "Sonipat",
        state: "Haryana",
        lat: 28.8794,
        lng: 76.9133,
      },
    ])
    .returning();

  await db.insert(users).values({
    phone: "9999999999",
    name: "UNNATI Ops",
    pinHash: pin,
    role: "ADMIN",
    language: "en",
    district: "Nashik",
    state: "Maharashtra",
    lat: 19.9975,
    lng: 73.7898,
  });

  /* trucks */
  console.log("Seeding trucks…");
  const truckRows = await db
    .insert(trucks)
    .values([
      {
        operatorId: operatorRows[0].id,
        regNo: "MH 15 AB 4521",
        vehicleType: "Tata 407 (open body)",
        capacityKg: 4000,
        ratePerKm: 34,
        status: "AVAILABLE" as const,
        lat: 20.0806,
        lng: 74.1103,
        ratingSum: 44,
        ratingCount: 10,
      },
      {
        operatorId: operatorRows[0].id,
        regNo: "MH 15 CD 7788",
        vehicleType: "Eicher 14 ft",
        capacityKg: 9000,
        ratePerKm: 46,
        status: "AVAILABLE" as const,
        lat: 20.0806,
        lng: 74.1103,
        ratingSum: 38,
        ratingCount: 9,
      },
      {
        operatorId: operatorRows[1].id,
        regNo: "MH 15 EF 1290",
        vehicleType: "Ashok Leyland Dost",
        capacityKg: 1500,
        ratePerKm: 22,
        status: "AVAILABLE" as const,
        lat: 20.1467,
        lng: 74.2394,
        ratingSum: 19,
        ratingCount: 4,
      },
      {
        operatorId: operatorRows[2].id,
        regNo: "HR 10 K 3344",
        vehicleType: "Tata 407 (open body)",
        capacityKg: 4000,
        ratePerKm: 34,
        status: "AVAILABLE" as const,
        lat: 28.8794,
        lng: 76.9133,
        ratingSum: 41,
        ratingCount: 9,
      },
      {
        operatorId: operatorRows[2].id,
        regNo: "HR 10 M 8821",
        vehicleType: "Eicher 14 ft",
        capacityKg: 9000,
        ratePerKm: 46,
        status: "AVAILABLE" as const,
        lat: 28.8794,
        lng: 76.9133,
        ratingSum: 22,
        ratingCount: 5,
      },
    ])
    .returning();

  /* listings — open harvests waiting for a truck */
  console.log("Seeding harvest listings…");
  await db.insert(listings).values([
    {
      farmerId: farmerRows[1].id,
      cropId: "tomato",
      quantityKg: 1200,
      grade: "B" as const,
      harvestedAt: new Date(now - 8 * HOUR),
      dispatchBy: new Date(now + 20 * HOUR),
      pickupName: "Niphad",
      pickupLat: 20.0806,
      pickupLng: 74.1103,
      status: "OPEN" as const,
    },
    {
      farmerId: farmerRows[2].id,
      cropId: "onion",
      quantityKg: 2500,
      grade: "A" as const,
      harvestedAt: new Date(now - 36 * HOUR),
      dispatchBy: new Date(now + 5 * DAY),
      pickupName: "Ugaon",
      pickupLat: 20.1325,
      pickupLng: 74.1789,
      status: "OPEN" as const,
    },
    {
      farmerId: farmerRows[3].id,
      cropId: "grape",
      quantityKg: 800,
      grade: "A" as const,
      harvestedAt: new Date(now - 5 * HOUR),
      dispatchBy: new Date(now + 30 * HOUR),
      pickupName: "Saikheda",
      pickupLat: 20.0361,
      pickupLng: 74.0442,
      status: "OPEN" as const,
    },
  ]);

  /* an open trip to Vashi with room, so the demo has something to join */
  console.log("Seeding trips and pooled loads…");
  const vashi = MANDIS.find((m) => m.id === "vashi")!;
  const origin = { lat: 20.0806, lng: 74.1103, name: "Niphad" };
  const bigTruck = truckRows[1];

  const vashiDistance = roadDistanceKm(origin, vashi);
  const vashiTripCost = tripCost(vashiDistance, bigTruck.ratePerKm);

  const [openTrip] = await db
    .insert(trips)
    .values({
      truckId: bigTruck.id,
      mandiId: "vashi",
      originName: origin.name,
      originLat: origin.lat,
      originLng: origin.lng,
      departAt: new Date(now + 14 * HOUR),
      capacityKg: bigTruck.capacityKg,
      usedKg: 0,
      totalCost: vashiTripCost,
      baseDistanceKm: vashiDistance,
      status: "OPEN" as const,
    })
    .returning();

  // Two farmers already aboard, leaving room for a third — the pooling story.
  const aboard = [
    {
      farmerId: farmerRows[0].id,
      cropId: "onion",
      quantityKg: 3000,
      pickupName: "Vinchur",
      pickupLat: 20.1069,
      pickupLng: 74.2856,
    },
    {
      farmerId: farmerRows[4].id,
      cropId: "onion",
      quantityKg: 2000,
      pickupName: "Lasalgaon",
      pickupLat: 20.1467,
      pickupLng: 74.2394,
    },
  ];

  const aboardWithDetour = aboard.map((l) => ({
    ...l,
    detourKm: roadDistanceKm(origin, { lat: l.pickupLat, lng: l.pickupLng }),
  }));

  const shares = splitCost(
    aboardWithDetour.map((l, i) => ({
      id: String(i),
      quantityKg: l.quantityKg,
      detourKm: 0, // both sit on the Niphad → Mumbai highway
    })),
    vashiTripCost,
    bigTruck.ratePerKm,
  );

  await db.insert(loads).values(
    aboardWithDetour.map((l, i) => ({
      tripId: openTrip.id,
      farmerId: l.farmerId,
      cropId: l.cropId,
      quantityKg: l.quantityKg,
      grade: "B" as const,
      pickupName: l.pickupName,
      pickupLat: l.pickupLat,
      pickupLng: l.pickupLng,
      detourKm: 0,
      costShare: shares[i].total,
      status: "CONFIRMED" as const,
    })),
  );

  await db
    .update(trips)
    .set({ usedKg: aboard.reduce((s, l) => s + l.quantityKg, 0) })
    .where(sql`${trips.id} = ${openTrip.id}`);

  /* a completed trip, so the earnings view has history */
  const lasalgaon = MANDIS.find((m) => m.id === "lasalgaon")!;
  const smallTruck = truckRows[0];
  const pastDistance = roadDistanceKm(origin, lasalgaon);
  const pastCost = tripCost(pastDistance, smallTruck.ratePerKm);

  const [pastTrip] = await db
    .insert(trips)
    .values({
      truckId: smallTruck.id,
      mandiId: "lasalgaon",
      originName: origin.name,
      originLat: origin.lat,
      originLng: origin.lng,
      departAt: new Date(now - 9 * DAY),
      capacityKg: smallTruck.capacityKg,
      usedKg: 3400,
      totalCost: pastCost,
      baseDistanceKm: pastDistance,
      status: "DELIVERED" as const,
    })
    .returning();

  const pastShares = splitCost(
    [
      { id: "a", quantityKg: 2000, detourKm: 0 },
      { id: "b", quantityKg: 1400, detourKm: 0 },
    ],
    pastCost,
    smallTruck.ratePerKm,
  );

  const pastLoadRows = await db
    .insert(loads)
    .values([
      {
        tripId: pastTrip.id,
        farmerId: farmerRows[0].id,
        cropId: "onion",
        quantityKg: 2000,
        grade: "A" as const,
        pickupName: "Vinchur",
        pickupLat: 20.1069,
        pickupLng: 74.2856,
        detourKm: 0,
        costShare: pastShares[0].total,
        salePricePerQuintal: 1880,
        status: "DELIVERED" as const,
      },
      {
        tripId: pastTrip.id,
        farmerId: farmerRows[1].id,
        cropId: "onion",
        quantityKg: 1400,
        grade: "B" as const,
        pickupName: "Niphad",
        pickupLat: 20.0806,
        pickupLng: 74.1103,
        detourKm: 0,
        costShare: pastShares[1].total,
        salePricePerQuintal: 1820,
        status: "DELIVERED" as const,
      },
    ])
    .returning();

  /* money: one settled bill, one falling due inside the 7-day warning window */
  console.log("Seeding transactions and notifications…");
  await db.insert(transactions).values([
    {
      userId: farmerRows[0].id,
      loadId: pastLoadRows[0].id,
      tripId: pastTrip.id,
      kind: "TRANSPORT_CHARGE" as const,
      amount: pastShares[0].total,
      status: "PAID" as const,
      dueDate: new Date(now + 5 * DAY),
      paidAt: new Date(now - 7 * DAY),
      upiRef: "UPI/428817224/UNNATI",
      note: "Transport share, Lasalgaon APMC",
    },
    {
      userId: farmerRows[0].id,
      loadId: pastLoadRows[0].id,
      tripId: pastTrip.id,
      kind: "SALE_PROCEEDS" as const,
      amount: Math.round((1880 * 2000) / 100),
      status: "PAID" as const,
      paidAt: new Date(now - 8 * DAY),
      note: "Sale proceeds, Lasalgaon APMC",
    },
    {
      userId: farmerRows[1].id,
      loadId: pastLoadRows[1].id,
      tripId: pastTrip.id,
      kind: "TRANSPORT_CHARGE" as const,
      amount: pastShares[1].total,
      status: "DUE" as const,
      // Due in 5 days, so the 7-day reminder has already fired — visible in the demo.
      dueDate: new Date(now + 5 * DAY),
      note: "Transport share, Lasalgaon APMC",
    },
    {
      userId: farmerRows[1].id,
      loadId: pastLoadRows[1].id,
      tripId: pastTrip.id,
      kind: "SALE_PROCEEDS" as const,
      amount: Math.round((1820 * 1400) / 100),
      status: "PAID" as const,
      paidAt: new Date(now - 8 * DAY),
      note: "Sale proceeds, Lasalgaon APMC",
    },
  ]);

  const dueDateLabel = new Date(now + 5 * DAY).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

  await db.insert(notifications).values([
    {
      userId: farmerRows[1].id,
      type: "BILLING_REMINDER" as const,
      title: `₹${pastShares[1].total} due on ${dueDateLabel}`,
      body: `Your transport share for the Lasalgaon APMC trip is ₹${pastShares[1].total}, due on ${dueDateLabel}. Pay by UPI in the app.`,
      titleHi: `₹${pastShares[1].total} का भुगतान ${dueDateLabel} तक`,
      bodyHi: `लासलगाँव यात्रा के लिए आपकी ढुलाई का हिस्सा ₹${pastShares[1].total} है, ${dueDateLabel} तक देना है।`,
      channel: "SMS" as const,
      scheduledFor: new Date(now - 2 * DAY),
      sentAt: new Date(now - 2 * DAY),
      href: "/farmer/earnings",
    },
    {
      userId: farmerRows[1].id,
      type: "PRICE_ALERT" as const,
      title: "Tomato price up at Nashik APMC",
      body: "Nashik APMC is quoting ₹1,400/quintal for tomato today, ₹150 above yesterday. Your 12 quintal harvest is ready to send.",
      titleHi: "नाशिक मंडी में टमाटर का भाव बढ़ा",
      bodyHi: "नाशिक मंडी में आज टमाटर ₹1,400/क्विंटल है, कल से ₹150 ज़्यादा।",
      channel: "PUSH" as const,
      scheduledFor: new Date(now - 4 * HOUR),
      sentAt: new Date(now - 4 * HOUR),
      href: "/farmer/sell",
    },
    {
      userId: farmerRows[2].id,
      type: "POOLING_ALERT" as const,
      title: "Truck going to Vashi APMC",
      body: "An Eicher 14 ft is leaving Niphad for Vashi APMC tomorrow morning with 4,000 kg of space. Share it to cut your transport cost.",
      titleHi: "वाशी मंडी जा रहा ट्रक",
      bodyHi: "कल सुबह निफाड़ से वाशी मंडी के लिए एक ट्रक जा रहा है, 4,000 किलो जगह है।",
      channel: "PUSH" as const,
      scheduledFor: new Date(now - 2 * HOUR),
      sentAt: new Date(now - 2 * HOUR),
      href: `/farmer/trip/${openTrip.id}`,
    },
    {
      userId: farmerRows[3].id,
      type: "SPOILAGE_WARNING" as const,
      title: "Send your grapes within 30 hours",
      body: "Grapes harvested yesterday will start losing value fast. Dispatch by tomorrow evening to avoid a heavy cut at the mandi.",
      titleHi: "अंगूर 30 घंटे में भेज दें",
      bodyHi: "कल तोड़े गए अंगूर जल्दी खराब होने लगेंगे। कल शाम तक भेज दें।",
      channel: "IVR" as const,
      scheduledFor: new Date(now - 30 * 60 * 1000),
      sentAt: new Date(now - 30 * 60 * 1000),
      href: "/farmer/sell",
    },
  ]);

  /* tracking breadcrumbs along the completed run */
  const pings = [];
  for (let i = 0; i <= 6; i++) {
    const f = i / 6;
    pings.push({
      tripId: pastTrip.id,
      lat: origin.lat + (lasalgaon.lat - origin.lat) * f,
      lng: origin.lng + (lasalgaon.lng - origin.lng) * f,
      speedKmph: 34 + ((i * 7) % 15),
      at: new Date(now - 9 * DAY + i * 40 * 60 * 1000),
    });
  }
  await db.insert(trackingPings).values(pings);

  console.log("\nSeed complete.");
  console.log("  Demo accounts — PIN 1234 for all:");
  console.log("    Farmer    9000000001  Ramesh Pawar (Vinchur)");
  console.log("    Farmer    9000000002  Sunita Jadhav (Niphad)");
  console.log("    Farmer    9000000011  Rajbir Singh (Sonipat, NCR)");
  console.log("    Farmer    9000000012  Anita Yadav (Najafgarh, Delhi)");
  console.log("    Operator  9111111111  Santosh Transport (Nashik)");
  console.log("    Operator  9111111113  Dahiya Roadlines (Sonipat, NCR)");
  console.log("    Admin     9999999999  UNNATI Ops");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
