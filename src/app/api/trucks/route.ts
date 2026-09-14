import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { trucks } from "@/db/schema";
import { requireUser, AuthError } from "@/lib/auth";

const schema = z.object({
  regNo: z.string().min(4, "Enter the vehicle number"),
  vehicleType: z.string().min(2, "Enter the vehicle type"),
  capacityKg: z.number().int().min(200).max(40_000),
  ratePerKm: z.number().int().min(5).max(500),
});

/** FR-3 — an operator lists a vehicle with its capacity and rate. */
export async function POST(req: Request) {
  try {
    const user = await requireUser("OPERATOR");
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const db = await getDb();
    const regNo = parsed.data.regNo.trim().toUpperCase();

    const [existing] = await db
      .select({ id: trucks.id })
      .from(trucks)
      .where(eq(trucks.regNo, regNo))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "That vehicle number is already registered." },
        { status: 409 },
      );
    }

    const [truck] = await db
      .insert(trucks)
      .values({
        operatorId: user.id,
        regNo,
        vehicleType: parsed.data.vehicleType,
        capacityKg: parsed.data.capacityKg,
        ratePerKm: parsed.data.ratePerKm,
        status: "AVAILABLE",
        lat: user.lat,
        lng: user.lng,
      })
      .returning();

    return NextResponse.json({ truckId: truck.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Could not add this truck." },
      { status: 400 },
    );
  }
}
