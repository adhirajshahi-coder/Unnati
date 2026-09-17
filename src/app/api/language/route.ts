import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { isLang } from "@/lib/languages";

/**
 * Language toggle.
 *
 * The choice is stored on the user, not in a cookie, so it follows a farmer to any
 * handset they sign in on — field agents routinely help someone sign in on a borrowed
 * phone, and having the app come up in English there would defeat the point.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const lang = form.get("lang");
  if (typeof lang !== "string" || !isLang(lang)) {
    return NextResponse.redirect(new URL("/", req.url), { status: 303 });
  }

  const user = await currentUser();
  if (user) {
    const db = await getDb();
    await db.update(users).set({ language: lang }).where(eq(users.id, user.id));
  }

  const back = req.headers.get("referer") ?? "/";
  return NextResponse.redirect(new URL(back, req.url), { status: 303 });
}
