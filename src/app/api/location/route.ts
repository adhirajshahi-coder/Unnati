import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser, AuthError } from "@/lib/auth";

const schema = z.object({
  lat: z.number().min(6).max(38),
  lng: z.number().min(68).max(98),
  village: z.string().max(60).optional(),
  district: z.string().max(60).optional(),
  state: z.string().max(60).optional(),
});

/**
 * Set the farmer's location.
 *
 * Bounds are India's, so a stray or spoofed coordinate cannot place a farmer in the
 * ocean and silently break every distance on the screen. Only the fields supplied are
 * written — a GPS fix updates the coordinates and leaves the place name alone rather
 * than blanking it.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "That location is outside India." },
        { status: 400 },
      );
    }

    const { lat, lng, village, district, state } = parsed.data;
    const db = await getDb();

    await db
      .update(users)
      .set({
        lat,
        lng,
        ...(village !== undefined ? { village } : {}),
        ...(district !== undefined ? { district } : {}),
        ...(state !== undefined ? { state } : {}),
      })
      .where(eq(users.id, user.id));

    return NextResponse.json({ ok: true, lat, lng });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Could not save your location." },
      { status: 400 },
    );
  }
}
