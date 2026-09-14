import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { requireUser, AuthError } from "@/lib/auth";
import { notify } from "@/lib/notifications";

/**
 * Settle a transport charge.
 *
 * A production build redirects to a UPI gateway and marks the row PAID on the
 * callback. This records the settlement directly, and the interface says plainly that
 * no real payment is made — the seam for the gateway is this one handler.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const db = await getDb();

    // Scoped to the signed-in user, so one farmer can never settle another's bill.
    const [txn] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
      .limit(1);

    if (!txn) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (txn.status === "PAID") {
      return NextResponse.json({ ok: true, alreadyPaid: true });
    }

    await db
      .update(transactions)
      .set({
        status: "PAID",
        paidAt: new Date(),
        upiRef: `UPI/${Date.now().toString().slice(-9)}/UNNATI`,
      })
      .where(eq(transactions.id, id));

    await notify({
      userId: user.id,
      type: "SYSTEM",
      title: `Payment of ₹${txn.amount} received`,
      body: `${txn.note ?? "Transport charge"} is settled. Nothing further is due on it.`,
      titleHi: `₹${txn.amount} का भुगतान मिल गया`,
      bodyHi: `${txn.note ?? "ढुलाई शुल्क"} चुका दिया गया है।`,
      href: "/farmer/earnings",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Could not record the payment." },
      { status: 400 },
    );
  }
}
