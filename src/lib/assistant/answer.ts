/**
 * Answering a farmer's question from the app's own data.
 *
 * Every figure returned here is read from the database or computed by the decision
 * engine — the same code paths that draw the screens. Nothing is estimated in prose
 * and nothing is invented. When a language model is configured it may rephrase these
 * answers, but the numbers it is given are these numbers, and it is told not to
 * change them.
 *
 * That constraint is not decoration. PRD §8 makes checkable pricing a requirement, and
 * an assistant that cheerfully guesses a mandi rate would do more damage than one that
 * says it does not know.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  crops,
  mandis,
  priceRecords,
  loads,
  trips,
  trackingPings,
  transactions,
  users,
} from "@/db/schema";
import type { User } from "@/db/schema";
import { recommend } from "@/lib/booking";
import { findJoinablePools } from "@/lib/pools";
import { roadDistanceKm } from "@/lib/engine/geo";
import { preferPrice } from "@/lib/engine/sources";
import { LIVE_SOURCE } from "@/lib/pricefeed";
import { projectNewPool } from "@/lib/engine/grouping";
import { rupees, weight, type Lang } from "@/lib/i18n";
import type { Intent } from "./intents";

export interface Answer {
  /** The reply, already in the user's language. */
  text: string;
  /** Where to go to act on it. */
  link?: { href: string; label: string };
  /** Short factual rows the UI renders as a list — never prose, never model output. */
  facts?: Array<{ label: string; value: string }>;
  /** Follow-up questions worth offering. */
  suggestions?: string[];
  intent: Intent;
  /** True when a language model rephrased the text. Shown to the user. */
  rephrased?: boolean;
}

const NBSP = " ";

export async function buildAnswer(
  intent: Intent,
  user: User,
  lang: Lang,
  cropId?: string,
): Promise<Answer> {
  switch (intent) {
    case "BEST_MANDI":
      return bestMandi(user, lang, cropId);
    case "PRICE":
      return price(user, lang, cropId);
    case "SHARE_TRUCK":
      return shareTruck(user, lang, cropId);
    case "MY_TRIPS":
      return myTrips(user, lang);
    case "MY_MONEY":
      return myMoney(user, lang);
    case "CROP_CARE":
      return cropCare(lang, cropId);
    case "NEIGHBOURS":
      return neighbours(user, lang);
    case "HOW_IT_WORKS":
      return howItWorks(lang);
    case "HUMAN_HELP":
      return humanHelp(lang);
    default:
      return unknown(lang);
  }
}

/* ----------------------------------------------------------- where to sell */

async function bestMandi(
  user: User,
  lang: Lang,
  cropId?: string,
): Promise<Answer> {
  if (!cropId) {
    return {
      intent: "BEST_MANDI",
      text:
        lang === "hi"
          ? "किस फ़सल के बारे में पूछ रहे हैं? फ़सल का नाम बताइए — जैसे “प्याज़ कहाँ बेचूँ”।"
          : "Which crop? Name it and I will work it out — for example “where should I sell onion”.",
      suggestions:
        lang === "hi"
          ? ["प्याज़ कहाँ बेचूँ", "टमाटर का भाव", "आलू कहाँ बेचूँ"]
          : ["Where should I sell onion", "Tomato price today", "Where should I sell potato"],
    };
  }

  // One quintal, so the answer is about price rather than about this farmer's
  // particular load; the sell screen is where a real quantity gets entered.
  const result = await recommend({
    cropId,
    quantityKg: 1000,
    grade: "B",
    harvestedAt: new Date(Date.now() - 6 * 3_600_000),
    origin: { lat: user.lat ?? 28.6092, lng: user.lng ?? 76.9798 },
    radiusKm: 200,
  });

  const top = result.ranked.slice(0, 3);
  if (top.length === 0) {
    return {
      intent: "BEST_MANDI",
      text:
        lang === "hi"
          ? "आपके आस-पास इस फ़सल का कोई ताज़ा भाव नहीं मिला।"
          : "I have no recent price for that crop near you.",
      link: { href: "/mandis", label: lang === "hi" ? "मंडियाँ देखें" : "See mandis" },
    };
  }

  const best = top[0];
  const cropName = lang === "hi" ? result.crop.nameHi : result.crop.name;
  const mandiName = lang === "hi" ? best.mandi.nameHi : best.mandi.name;

  return {
    intent: "BEST_MANDI",
    text:
      lang === "hi"
        ? `10 क्विंटल ${cropName} के लिए ${mandiName} सबसे अच्छी है — ढुलाई, आढ़त और ख़राबी काटकर ${rupees(best.netValue)} बचते हैं। भाव ${rupees(best.mandi.modalPrice)}/क्विंटल है, दूरी ${best.distanceKm}${NBSP}किमी।`
        : `For 10 quintal of ${cropName}, ${mandiName} leaves you the most: ${rupees(best.netValue)} after transport, commission and spoilage. The board price is ${rupees(best.mandi.modalPrice)}/quintal and it is ${best.distanceKm}${NBSP}km away.`,
    facts: top.map((r) => ({
      label: lang === "hi" ? r.mandi.nameHi : r.mandi.name,
      value: `${rupees(r.netValue)} · ${r.distanceKm} km`,
    })),
    link: {
      href: `/farmer/sell?crop=${cropId}&qty=1000&grade=B&since=6&radius=200`,
      label: lang === "hi" ? "अपनी मात्रा डालकर देखें" : "Check with your own quantity",
    },
    suggestions:
      lang === "hi"
        ? ["ट्रक कैसे साझा करूँ?", `${cropName} कैसे पैक करें?`]
        : ["How do I share a truck?", `How should I pack ${cropName}?`],
  };
}

/* ------------------------------------------------------------ today's price */

async function price(user: User, lang: Lang, cropId?: string): Promise<Answer> {
  if (!cropId) {
    return {
      intent: "PRICE",
      text:
        lang === "hi"
          ? "किस फ़सल का भाव चाहिए? नाम बताइए — जैसे “टमाटर का भाव”।"
          : "Which crop? Name it — for example “tomato price”.",
      link: { href: "/mandis", label: lang === "hi" ? "सभी भाव देखें" : "See all prices" },
    };
  }

  const db = await getDb();
  const [crop] = await db
    .select()
    .from(crops)
    .where(eq(crops.id, cropId))
    .limit(1);
  if (!crop) return unknown(lang);

  const rows = await db
    .select({
      mandiId: mandis.id,
      name: mandis.name,
      nameHi: mandis.nameHi,
      lat: mandis.lat,
      lng: mandis.lng,
      modalPrice: priceRecords.modalPrice,
      source: priceRecords.source,
      recordedAt: priceRecords.recordedAt,
    })
    .from(priceRecords)
    .innerJoin(mandis, eq(mandis.id, priceRecords.mandiId))
    .where(eq(priceRecords.cropId, cropId))
    .orderBy(desc(priceRecords.recordedAt));

  const origin = { lat: user.lat ?? 28.6092, lng: user.lng ?? 76.9798 };
  const best = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const held = best.get(r.mandiId);
    if (!held || preferPrice(r, held)) best.set(r.mandiId, r);
  }

  const nearby = [...best.values()]
    .map((r) => ({
      ...r,
      distanceKm: roadDistanceKm(origin, { lat: r.lat, lng: r.lng }),
    }))
    .filter((r) => r.distanceKm <= 200)
    .sort((a, b) => b.modalPrice - a.modalPrice)
    .slice(0, 4);

  if (nearby.length === 0) {
    return {
      intent: "PRICE",
      text:
        lang === "hi"
          ? `आपके 200 किमी के दायरे में ${crop.nameHi} का कोई भाव दर्ज नहीं है।`
          : `I have no price for ${crop.name} within 200 km of you.`,
      link: { href: "/mandis", label: lang === "hi" ? "मंडियाँ देखें" : "See mandis" },
    };
  }

  const top = nearby[0];
  const live = top.source === LIVE_SOURCE;
  const ageH = Math.round(
    (Date.now() - new Date(top.recordedAt).getTime()) / 3_600_000,
  );

  return {
    intent: "PRICE",
    text:
      lang === "hi"
        ? `${crop.nameHi} का सबसे ऊँचा भाव ${lang === "hi" ? top.nameHi : top.name} में ${rupees(top.modalPrice)}/क्विंटल है${live ? " (सरकारी फ़ीड से, " + ageH + " घंटे पुराना)" : " (ऐप का अनुमान)"}। याद रखें — ढुलाई और आढ़त काटने के बाद ही असली कमाई पता चलती है।`
        : `The highest price for ${crop.name} near you is ${rupees(top.modalPrice)}/quintal at ${top.name}${live ? `, from the government feed ${ageH} h ago` : ", from the app's baseline"}. What you actually keep depends on transport and commission, though.`,
    facts: nearby.map((r) => ({
      label: `${lang === "hi" ? r.nameHi : r.name} · ${r.distanceKm} km`,
      value: `${rupees(r.modalPrice)}${r.source === LIVE_SOURCE ? " ●" : ""}`,
    })),
    link: {
      href: `/farmer/sell?crop=${cropId}&qty=1000&grade=B&since=6&radius=200`,
      label: lang === "hi" ? "असली कमाई निकालें" : "Work out what you would keep",
    },
    suggestions:
      lang === "hi"
        ? [`${crop.nameHi} कहाँ बेचूँ?`, "ट्रक कैसे साझा करूँ?"]
        : [`Where should I sell ${crop.name}?`, "How do I share a truck?"],
  };
}

/* --------------------------------------------------------- sharing a truck */

async function shareTruck(
  user: User,
  lang: Lang,
  cropId?: string,
): Promise<Answer> {
  const origin = { lat: user.lat ?? 28.6092, lng: user.lng ?? 76.9798 };
  const groups = await findJoinablePools(origin);

  if (groups.length > 0) {
    const g = groups[0];
    return {
      intent: "SHARE_TRUCK",
      text:
        lang === "hi"
          ? `हाँ — ${g.mandiName} जाने के लिए एक समूह अभी बन रहा है। ${g.memberCount} किसान जुड़ चुके हैं और ${weight(g.committedKg, lang)} तैयार है। जितने ज़्यादा किसान, उतना कम खर्च सबका।`
          : `Yes — a group is gathering for ${g.mandiName} right now. ${g.memberCount} farmers have joined with ${weight(g.committedKg, lang)} between them. The more who join, the less each of you pays.`,
      facts: groups.slice(0, 3).map((x) => ({
        label: lang === "hi" ? x.mandiNameHi : x.mandiName,
        value: `${x.memberCount} · ${weight(x.committedKg, lang)}`,
      })),
      link: {
        href: `/farmer/pool/${g.id}`,
        label: lang === "hi" ? "समूह देखें" : "See the group",
      },
      suggestions:
        lang === "hi"
          ? ["खर्च कैसे बँटता है?", "आस-पास कौन है?"]
          : ["How is the cost split?", "Who is near me?"],
    };
  }

  // Nothing running — quote what starting one would cost, from the real projection.
  const p = projectNewPool(1000, 70);

  return {
    intent: "SHARE_TRUCK",
    text:
      lang === "hi"
        ? `अभी आपके आस-पास कोई समूह नहीं चल रहा — पर आप ख़ुद शुरू कर सकते हैं। “उपज बेचें” में फ़सल चुनकर “ट्रक साझा करें” दबाइए; आस-पास के किसानों को ख़बर चली जाएगी। 10 क्विंटल के लिए अकेले ट्रक लेने पर करीब ${rupees(p.soloCost)} लगते हैं, साझा करने पर लगभग ${rupees(p.shareNow)}।`
        : `No group is running near you yet — but you can start one. Pick your crop under “Sell produce” and choose “Share a truck”; farmers nearby are told automatically. For 10 quintal over about 70 km, hiring alone costs around ${rupees(p.soloCost)} and sharing brings it near ${rupees(p.shareNow)}.`,
    link: {
      href: cropId
        ? `/farmer/sell?crop=${cropId}&qty=1000&grade=B&since=6&radius=200`
        : "/farmer/sell",
      label: lang === "hi" ? "शुरू करें" : "Start one",
    },
    suggestions:
      lang === "hi"
        ? ["आस-पास कौन है?", "खर्च कैसे बँटता है?"]
        : ["Who is near me?", "How is the cost split?"],
  };
}

/* ------------------------------------------------------------- my bookings */

async function myTrips(user: User, lang: Lang): Promise<Answer> {
  const db = await getDb();

  const rows = await db
    .select({
      tripId: trips.id,
      status: trips.status,
      departAt: trips.departAt,
      mandiName: mandis.name,
      mandiNameHi: mandis.nameHi,
      regNo: trips.truckId,
      quantityKg: loads.quantityKg,
      costShare: loads.costShare,
      loadStatus: loads.status,
    })
    .from(loads)
    .innerJoin(trips, eq(trips.id, loads.tripId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .where(
      and(
        eq(loads.farmerId, user.id),
        inArray(loads.status, ["REQUESTED", "CONFIRMED", "PICKED_UP"]),
      ),
    )
    .orderBy(trips.departAt);

  if (rows.length === 0) {
    return {
      intent: "MY_TRIPS",
      text:
        lang === "hi"
          ? "अभी आपकी कोई उपज रास्ते में नहीं है।"
          : "You have nothing in transit right now.",
      link: { href: "/farmer/sell", label: lang === "hi" ? "उपज भेजें" : "Send produce" },
    };
  }

  const t = rows[0];
  const [ping] = await db
    .select()
    .from(trackingPings)
    .where(eq(trackingPings.tripId, t.tripId))
    .orderBy(desc(trackingPings.at))
    .limit(1);

  const mandiName = lang === "hi" ? t.mandiNameHi : t.mandiName;
  const seen = ping
    ? Math.round((Date.now() - new Date(ping.at).getTime()) / 60_000)
    : null;

  return {
    intent: "MY_TRIPS",
    text:
      lang === "hi"
        ? `आपकी ${weight(t.quantityKg, lang)} उपज ${mandiName} जा रही है। स्थिति: ${statusHi(t.status)}${seen !== null ? `, ट्रक ${seen} मिनट पहले देखा गया` : ""}।`
        : `Your ${weight(t.quantityKg, lang)} is going to ${mandiName}. Status: ${statusEn(t.status)}${seen !== null ? `, truck last seen ${seen} min ago` : ""}.`,
    facts: rows.map((r) => ({
      label: lang === "hi" ? r.mandiNameHi : r.mandiName,
      value:
        r.loadStatus === "REQUESTED"
          ? lang === "hi"
            ? "मंज़ूरी बाकी"
            : "awaiting approval"
          : rupees(r.costShare),
    })),
    link: {
      href: `/farmer/trip/${t.tripId}`,
      label: lang === "hi" ? "ट्रक देखें" : "Track the truck",
    },
  };
}

function statusEn(s: string) {
  return (
    { OPEN: "loading", FULL: "loaded", IN_TRANSIT: "on the way", DELIVERED: "delivered" }[
      s
    ] ?? s.toLowerCase()
  );
}

function statusHi(s: string) {
  return (
    { OPEN: "लोड हो रहा है", FULL: "भर गया", IN_TRANSIT: "रास्ते में", DELIVERED: "पहुँच गया" }[
      s
    ] ?? s
  );
}

/* ------------------------------------------------------------------ money */

async function myMoney(user: User, lang: Lang): Promise<Answer> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, user.id))
    .orderBy(desc(transactions.createdAt));

  const due = rows.filter(
    (r) => r.status === "DUE" && r.kind === "TRANSPORT_CHARGE",
  );
  const owed = due.reduce((s, r) => s + r.amount, 0);
  const earned = rows
    .filter((r) => r.kind === "SALE_PROCEEDS")
    .reduce((s, r) => s + r.amount, 0);
  const paidTransport = rows
    .filter((r) => r.kind === "TRANSPORT_CHARGE")
    .reduce((s, r) => s + r.amount, 0);

  const nextDue = due
    .filter((d) => d.dueDate)
    .sort(
      (a, b) =>
        new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime(),
    )[0];

  const dueLabel = nextDue?.dueDate
    ? new Date(nextDue.dueDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : null;

  return {
    intent: "MY_MONEY",
    text:
      owed > 0
        ? lang === "hi"
          ? `आपका ${rupees(owed)} बाकी है${dueLabel ? `, ${dueLabel} तक देना है` : ""}। हर भुगतान की याद देय तिथि से 7 दिन पहले भेजी जाती है।`
          : `You owe ${rupees(owed)}${dueLabel ? `, due by ${dueLabel}` : ""}. Every payment is flagged seven days before its due date.`
        : lang === "hi"
          ? "अभी आपका कोई भुगतान बाकी नहीं है।"
          : "You have nothing outstanding right now.",
    facts: [
      {
        label: lang === "hi" ? "मंडी से मिला" : "Received from mandis",
        value: rupees(earned),
      },
      {
        label: lang === "hi" ? "ढुलाई पर खर्च" : "Spent on transport",
        value: rupees(paidTransport),
      },
      {
        label: lang === "hi" ? "बाकी" : "Outstanding",
        value: rupees(owed),
      },
    ],
    link: { href: "/farmer/earnings", label: lang === "hi" ? "हिसाब देखें" : "See the ledger" },
  };
}

/* -------------------------------------------------------------- crop care */

async function cropCare(lang: Lang, cropId?: string): Promise<Answer> {
  const db = await getDb();

  if (!cropId) {
    return {
      intent: "CROP_CARE",
      text:
        lang === "hi"
          ? "किस फ़सल के बारे में? नाम बताइए — जैसे “टमाटर कैसे पैक करें”।"
          : "Which crop? Name it — for example “how should I pack tomatoes”.",
    };
  }

  const [crop] = await db
    .select()
    .from(crops)
    .where(eq(crops.id, cropId))
    .limit(1);
  if (!crop) return unknown(lang);

  const days = Math.round(crop.shelfLifeHours / 24);

  return {
    intent: "CROP_CARE",
    text: lang === "hi" ? crop.handlingTipHi : crop.handlingTip,
    facts: [
      {
        label: lang === "hi" ? "कितने दिन टिकती है" : "Keeps for about",
        value: `${days} ${lang === "hi" ? "दिन" : "days"}`,
      },
      {
        label: lang === "hi" ? "रोज़ का नुकसान" : "Value lost per day",
        value: `${Math.round(crop.spoilageRatePerDay * 1000) / 10}%`,
      },
    ],
    link: {
      href: `/farmer/sell?crop=${crop.id}&qty=1000&grade=B&since=6&radius=200`,
      label: lang === "hi" ? "कहाँ भेजें देखें" : "See where to send it",
    },
  };
}

/* ------------------------------------------------------------- neighbours */

async function neighbours(user: User, lang: Lang): Promise<Answer> {
  const db = await getDb();
  const origin = { lat: user.lat ?? 28.6092, lng: user.lng ?? 76.9798 };

  const people = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      village: users.village,
      lat: users.lat,
      lng: users.lng,
    })
    .from(users)
    .where(inArray(users.role, ["FARMER", "OPERATOR"]));

  const near = people
    .filter((p) => p.id !== user.id && p.lat != null && p.lng != null)
    .map((p) => ({
      ...p,
      distanceKm: roadDistanceKm(origin, { lat: p.lat!, lng: p.lng! }),
    }))
    .filter((p) => p.distanceKm <= 60)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const farmers = near.filter((p) => p.role === "FARMER");
  const operators = near.filter((p) => p.role === "OPERATOR");

  return {
    intent: "NEIGHBOURS",
    text:
      near.length === 0
        ? lang === "hi"
          ? "आपके 60 किमी के दायरे में अभी कोई दर्ज नहीं है।"
          : "Nobody is registered within 60 km of you yet."
        : lang === "hi"
          ? `आपके आस-पास ${farmers.length} किसान और ${operators.length} ट्रक मालिक हैं। एक ही मंडी जाने वाले किसान मिलकर एक ट्रक साझा कर सकते हैं।`
          : `There are ${farmers.length} farmers and ${operators.length} truck owners within reach of you. Farmers heading to the same mandi can share one truck between them.`,
    facts: near.slice(0, 5).map((p) => ({
      label: `${p.name}${p.village ? ` · ${p.village}` : ""}`,
      value: `${p.distanceKm} km · ${
        p.role === "OPERATOR"
          ? lang === "hi"
            ? "ट्रक मालिक"
            : "truck owner"
          : lang === "hi"
            ? "किसान"
            : "farmer"
      }`,
    })),
    link: { href: "/connect", label: lang === "hi" ? "सब देखें" : "See everyone" },
  };
}

/* ------------------------------------------------------------- explainers */

function howItWorks(lang: Lang): Answer {
  return {
    intent: "HOW_IT_WORKS",
    text:
      lang === "hi"
        ? "उन्नति तीन काम करती है। पहला — हर मंडी का भाव लेकर ढुलाई, आढ़त और ख़राबी काटकर बताती है कि असल में आपके हाथ में कितना आएगा; सबसे ऊँचा भाव अक्सर सबसे ज़्यादा मुनाफ़ा नहीं देता। दूसरा — एक ही मंडी जाने वाले किसानों को जोड़कर एक ट्रक साझा कराती है, जिससे छोटे किसान का खर्च आधे से भी कम हो जाता है। तीसरा — खर्च वज़न के हिसाब से बँटता है, और किसी एक के लिए किया गया अतिरिक्त चक्कर उसी के खाते में जाता है, ताकि कोई किसी का बोझ न उठाए।"
        : "UNNATI does three things. First, it takes every mandi's price and subtracts transport, commission and spoilage, so you see what you would actually keep — the highest board price is often not the best deal. Second, it puts farmers heading to the same mandi into one truck, which cuts a smallholder's transport cost by more than half. Third, the cost splits by weight, and a detour driven to collect one farmer is charged to that farmer alone, so nobody subsidises anybody.",
    suggestions:
      lang === "hi"
        ? ["ट्रक कैसे साझा करूँ?", "प्याज़ कहाँ बेचूँ?"]
        : ["How do I share a truck?", "Where should I sell onion?"],
  };
}

function humanHelp(lang: Lang): Answer {
  return {
    intent: "HUMAN_HELP",
    text:
      lang === "hi"
        ? "किसी इंसान से बात करने के लिए अपने इलाके के UNNATI फ़ील्ड सहायक से संपर्क करें। जिस यात्रा या समूह में आप हैं, उसके पन्ने पर ट्रक मालिक का फ़ोन नंबर दिया रहता है — ढुलाई से जुड़ी बात के लिए वही सबसे तेज़ रास्ता है।"
        : "For a person, contact your local UNNATI field coordinator. For anything about a specific booking, the truck owner's phone number is on that trip's page — that is usually the fastest route.",
    link: { href: "/farmer/trips", label: lang === "hi" ? "मेरी यात्राएँ" : "My trips" },
  };
}

function unknown(lang: Lang): Answer {
  return {
    intent: "UNKNOWN",
    text:
      lang === "hi"
        ? "यह मैं ठीक से समझ नहीं पाया। मैं भाव, कहाँ बेचना है, ट्रक साझा करना, आपका हिसाब और फ़सल की देखभाल — इन सब में मदद कर सकता हूँ।"
        : "I did not follow that. I can help with prices, where to sell, sharing a truck, your ledger, and how to handle a crop.",
    suggestions:
      lang === "hi"
        ? ["प्याज़ का भाव", "प्याज़ कहाँ बेचूँ", "ट्रक कैसे साझा करूँ", "मेरा कितना बाकी है"]
        : [
            "Onion price today",
            "Where should I sell onion",
            "How do I share a truck",
            "How much do I owe",
          ],
  };
}
