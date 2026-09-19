import { Suspense } from "react";
import { ResetByLink } from "@/components/ResetByLink";

export const dynamic = "force-dynamic";

/**
 * Where an emailed reset link lands.
 *
 * Signed out by design — the whole point is that the person cannot sign in. The token
 * in the query string is the only credential, and it is spent server-side the moment a
 * new PIN is submitted.
 */
export default function ResetPage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b-2 border-[var(--color-ink)] bg-[var(--color-paper-2)]">
        <div className="mx-auto max-w-3xl px-5 py-6">
          <div className="font-display text-[32px] font-700 leading-none tracking-[0.06em]">
            UNNATI
          </div>
          <div className="mt-1 text-[15px] text-[var(--color-keep)]">
            नया पिन बनाइए · Set a new PIN
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 py-7">
        <Suspense
          fallback={
            <p className="text-[15px] text-[var(--color-ink-3)]">लोड हो रहा है…</p>
          }
        >
          <ResetByLink />
        </Suspense>
      </main>
    </div>
  );
}
