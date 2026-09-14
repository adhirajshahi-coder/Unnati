import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { crops } from "@/db/schema";
import { requireUser, AuthError } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(2, "Enter the crop name").max(40),
  nameHi: z.string().min(1, "Enter the Hindi name").max(40),
  shelfLifeDays: z.number().int().min(1).max(365),
  category: z.enum(["VEGETABLE", "FRUIT", "GRAIN", "PULSE", "OILSEED"]),
});

/** Turn a display name into a stable id: "Drumstick Pods" -> "drumstick-pods". */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * Spoilage rate inferred from shelf life.
 *
 * A farmer knows how many days their crop keeps; they do not know a daily loss
 * fraction, and asking for one would produce a guess worse than this. The curve is
 * anchored on the crops we do ship: spinach keeps ~1.5 days and loses ~18% a day,
 * onion keeps ~30 days and loses ~1.2%. Roughly 0.27/days reproduces both ends.
 */
function spoilageFromShelfLife(days: number): {
  rate: number;
  perishability: "HIGH" | "MEDIUM" | "LOW";
} {
  const rate = Math.min(0.25, Math.max(0.0015, 0.27 / days));
  const perishability = days <= 5 ? "HIGH" : days <= 21 ? "MEDIUM" : "LOW";
  return { rate, perishability };
}

/**
 * Add a crop the app does not ship.
 *
 * India grows far more than any list we could seed, and a farmer whose crop is
 * missing cannot use the app at all. The crop is created without an `agmarknetName`,
 * so the live feed will never match it — prices for it have to be entered by hand,
 * and the UI says so before the farmer commits.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { name, nameHi, shelfLifeDays, category } = parsed.data;
    const id = slugify(name);

    if (!id) {
      return NextResponse.json(
        { error: "Use letters or numbers in the crop name." },
        { status: 400 },
      );
    }

    const db = await getDb();

    // If it already exists, hand back the existing id rather than erroring — the
    // farmer wanted to select this crop, and they now can.
    const [existing] = await db
      .select({ id: crops.id })
      .from(crops)
      .where(eq(crops.id, id))
      .limit(1);

    if (existing) {
      return NextResponse.json({ cropId: existing.id, existed: true });
    }

    const { rate, perishability } = spoilageFromShelfLife(shelfLifeDays);

    const [crop] = await db
      .insert(crops)
      .values({
        id,
        name: name.trim(),
        nameHi: nameHi.trim(),
        category,
        shelfLifeHours: shelfLifeDays * 24,
        spoilageRatePerDay: rate,
        perishability,
        // Generic advice: we do not know this crop, and inventing specific handling
        // guidance for it would be worse than admitting that.
        handlingTip:
          "Keep shaded and ventilated, load in the cool of the morning, and send the most damage-prone lots to the nearest mandi.",
        handlingTipHi:
          "छाँव और हवादार जगह रखें, सुबह ठंडे समय लोड करें, और जो माल जल्दी खराब हो उसे सबसे नज़दीकी मंडी भेजें।",
        agmarknetName: null,
        isCustom: true,
        createdBy: user.id,
      })
      .returning();

    return NextResponse.json({ cropId: crop.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Could not add this crop." },
      { status: 400 },
    );
  }
}
