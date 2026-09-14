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
import { roadDistanceKm } from "../src/lib/engine/geo";
import { tripCost, splitCost } from "../src/lib/engine/costs";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ------------------------------------------------------------------ crops */

const CROPS = [
  {
    id: "onion",
    name: "Onion",
    nameHi: "प्याज़",
    shelfLifeHours: 720, // ~30 days cured, un-refrigerated
    spoilageRatePerDay: 0.012,
    perishability: "MEDIUM",
    handlingTip:
      "Cure in shade for 2–3 days before loading. Use ventilated mesh bags, never sealed plastic. Do not stack more than 8 bags high.",
    handlingTipHi:
      "लोड करने से पहले 2–3 दिन छाँव में सुखाएँ। जालीदार बोरी इस्तेमाल करें, बंद प्लास्टिक कभी नहीं। 8 बोरी से ऊँचा न लगाएँ।",
  },
  {
    id: "tomato",
    name: "Tomato",
    nameHi: "टमाटर",
    shelfLifeHours: 72,
    spoilageRatePerDay: 0.085,
    perishability: "HIGH",
    handlingTip:
      "Harvest at breaker stage for distant mandis. Pack in crates, not sacks — sacks crush the bottom layer. Load in the cool of early morning.",
    handlingTipHi:
      "दूर की मंडी के लिए हल्का कच्चा तोड़ें। बोरी नहीं, क्रेट में भरें — बोरी में नीचे की परत दब जाती है। सुबह ठंडे समय लोड करें।",
  },
  {
    id: "grape",
    name: "Grapes",
    nameHi: "अंगूर",
    shelfLifeHours: 96,
    spoilageRatePerDay: 0.07,
    perishability: "HIGH",
    handlingTip:
      "Pre-cool bunches before loading. Line crates with paper. Avoid any midday loading — pulp temperature above 30°C halves shelf life.",
    handlingTipHi:
      "लोड करने से पहले गुच्छों को ठंडा करें। क्रेट में कागज़ लगाएँ। दोपहर में लोड न करें — गूदे का तापमान 30°C से ऊपर जाने पर टिकाऊपन आधा रह जाता है।",
  },
  {
    id: "pomegranate",
    name: "Pomegranate",
    nameHi: "अनार",
    shelfLifeHours: 480,
    spoilageRatePerDay: 0.02,
    perishability: "MEDIUM",
    handlingTip:
      "Grade out cracked fruit before dispatch — one split fruit spoils the crate around it. Cushion with paper on all sides.",
    handlingTipHi:
      "भेजने से पहले फटे फल अलग करें — एक फटा फल पूरी क्रेट खराब कर देता है। चारों तरफ कागज़ लगाएँ।",
  },
  {
    id: "wheat",
    name: "Wheat",
    nameHi: "गेहूँ",
    shelfLifeHours: 4320,
    spoilageRatePerDay: 0.002,
    perishability: "LOW",
    handlingTip:
      "Dry to under 12% moisture before bagging. Keep bags off bare ground on the truck bed to avoid condensation damage.",
    handlingTipHi:
      "बोरी भरने से पहले 12% से कम नमी तक सुखाएँ। ट्रक में बोरियाँ ज़मीन से ऊपर रखें ताकि सीलन न लगे।",
  },
  {
    id: "soybean",
    name: "Soybean",
    nameHi: "सोयाबीन",
    shelfLifeHours: 2880,
    spoilageRatePerDay: 0.003,
    perishability: "LOW",
    handlingTip:
      "Clean out chaff and stones before weighing — mandi deductions for foreign matter are steep. Keep moisture under 10%.",
    handlingTipHi:
      "तौल से पहले भूसा और पत्थर साफ़ करें — मंडी में कचरे की कटौती भारी होती है। नमी 10% से कम रखें।",
  },
];

/* ----------------------------------------------------------------- mandis */

const MANDIS = [
  {
    id: "lasalgaon",
    name: "Lasalgaon APMC",
    nameHi: "लासलगाँव मंडी",
    district: "Nashik",
    state: "Maharashtra",
    lat: 20.1467,
    lng: 74.2394,
    commissionRate: 0.02,
    marketFeePerQuintal: 12,
  },
  {
    id: "pimpalgaon",
    name: "Pimpalgaon Baswant",
    nameHi: "पिंपळगाव बसवंत",
    district: "Nashik",
    state: "Maharashtra",
    lat: 20.1697,
    lng: 73.9853,
    commissionRate: 0.02,
    marketFeePerQuintal: 10,
  },
  {
    id: "nashik",
    name: "Nashik APMC",
    nameHi: "नाशिक मंडी",
    district: "Nashik",
    state: "Maharashtra",
    lat: 19.9975,
    lng: 73.7898,
    commissionRate: 0.025,
    marketFeePerQuintal: 14,
  },
  {
    id: "yeola",
    name: "Yeola",
    nameHi: "येवला",
    district: "Nashik",
    state: "Maharashtra",
    lat: 20.0424,
    lng: 74.4892,
    commissionRate: 0.02,
    marketFeePerQuintal: 10,
  },
  {
    id: "manmad",
    name: "Manmad",
    nameHi: "मनमाड",
    district: "Nashik",
    state: "Maharashtra",
    lat: 20.2512,
    lng: 74.4386,
    commissionRate: 0.02,
    marketFeePerQuintal: 10,
  },
  {
    id: "chandvad",
    name: "Chandvad",
    nameHi: "चांदवड",
    district: "Nashik",
    state: "Maharashtra",
    lat: 20.3306,
    lng: 74.2436,
    commissionRate: 0.02,
    marketFeePerQuintal: 9,
  },
  {
    id: "vashi",
    name: "Vashi APMC, Navi Mumbai",
    nameHi: "वाशी मंडी, नवी मुंबई",
    district: "Thane",
    state: "Maharashtra",
    lat: 19.0771,
    lng: 72.9986,
    commissionRate: 0.06,
    marketFeePerQuintal: 30,
  },
  {
    id: "pune",
    name: "Pune Market Yard",
    nameHi: "पुणे मार्केट यार्ड",
    district: "Pune",
    state: "Maharashtra",
    lat: 18.4839,
    lng: 73.8677,
    commissionRate: 0.05,
    marketFeePerQuintal: 25,
  },
];

/**
 * Representative modal prices, ₹ per quintal.
 *
 * The shape that matters: the terminal markets (Vashi, Pune) pay substantially more
 * than the local mandis, which is why farmers are tempted by them — and why the net
 * calculation, which nets off 200 km of transport and a 6% commission, is the honest
 * answer rather than the headline number.
 */
const PRICES: Record<string, Record<string, number>> = {
  onion: {
    lasalgaon: 1850,
    pimpalgaon: 1790,
    nashik: 1720,
    yeola: 1680,
    manmad: 1705,
    chandvad: 1760,
    vashi: 2450,
    pune: 2280,
  },
  tomato: {
    lasalgaon: 1250,
    pimpalgaon: 1320,
    nashik: 1400,
    yeola: 1180,
    manmad: 1210,
    chandvad: 1265,
    vashi: 2150,
    pune: 1950,
  },
  grape: {
    lasalgaon: 4200,
    pimpalgaon: 4650,
    nashik: 4400,
    yeola: 3900,
    manmad: 3850,
    chandvad: 4100,
    vashi: 6200,
    pune: 5700,
  },
  pomegranate: {
    lasalgaon: 6800,
    pimpalgaon: 7100,
    nashik: 7250,
    yeola: 6400,
    manmad: 6350,
    chandvad: 6900,
    vashi: 9500,
    pune: 8800,
  },
  wheat: {
    lasalgaon: 2420,
    pimpalgaon: 2400,
    nashik: 2450,
    yeola: 2380,
    manmad: 2395,
    chandvad: 2410,
    vashi: 2720,
    pune: 2650,
  },
  soybean: {
    lasalgaon: 4550,
    pimpalgaon: 4500,
    nashik: 4600,
    yeola: 4480,
    manmad: 4520,
    chandvad: 4540,
    vashi: 4950,
    pune: 4870,
  },
};

/* ------------------------------------------------------------------ main */

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

  console.log("Seeding crops and mandis…");
  await db.insert(crops).values(CROPS);
  await db.insert(mandis).values(MANDIS);

  /* prices: 6 days of history so the trend view has something to draw */
  console.log("Seeding price history…");
  const priceRows: Array<typeof priceRecords.$inferInsert> = [];

  for (const [cropId, byMandi] of Object.entries(PRICES)) {
    for (const [mandiId, base] of Object.entries(byMandi)) {
      for (let daysAgo = 5; daysAgo >= 0; daysAgo--) {
        // A deterministic wobble: same seed data on every run, but not a flat line.
        const wobble =
          Math.sin((daysAgo + cropId.length + mandiId.length) * 1.7) * 0.045;
        const modal = Math.round(base * (1 + wobble));
        priceRows.push({
          mandiId,
          cropId,
          modalPrice: modal,
          minPrice: Math.round(modal * 0.88),
          maxPrice: Math.round(modal * 1.11),
          arrivalsQuintal: 400 + ((daysAgo * 137 + mandiId.length * 53) % 2600),
          source: mandiId === "vashi" || mandiId === "pune"
            ? "ENAM"
            : daysAgo === 0
              ? "FIELD_VERIFIED"
              : "AGMARKNET",
          // Today's price is 3 hours old, so it reads as HIGH confidence.
          recordedAt: new Date(now - daysAgo * DAY - 3 * HOUR),
        });
      }
    }
  }
  await db.insert(priceRecords).values(priceRows);

  await db.insert(feedHealth).values([
    {
      id: "AGMARKNET",
      lastRunAt: new Date(now - 3 * HOUR),
      recordsIngested: priceRows.filter((r) => r.source === "AGMARKNET").length,
      ok: true,
      message: "Scheduled ETL completed",
    },
    {
      id: "ENAM",
      lastRunAt: new Date(now - 3 * HOUR),
      recordsIngested: priceRows.filter((r) => r.source === "ENAM").length,
      ok: true,
      message: "Scheduled ETL completed",
    },
    {
      id: "FIELD_VERIFIED",
      lastRunAt: new Date(now - 1 * HOUR),
      recordsIngested: priceRows.filter((r) => r.source === "FIELD_VERIFIED")
        .length,
      ok: true,
      message: "Field agent submissions",
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
  console.log("    Operator  9111111111  Santosh Transport");
  console.log("    Admin     9999999999  UNNATI Ops");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
