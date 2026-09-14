import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth";
import { setTripStatus } from "@/lib/booking";

const schema = z.object({
  status: z.enum(["IN_TRANSIT", "DELIVERED", "CANCELLED"]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser("OPERATOR");
    const { id } = await params;
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    }

    await setTripStatus(id, user.id, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update." },
      { status: 400 },
    );
  }
}
