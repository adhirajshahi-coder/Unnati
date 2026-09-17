import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { Logo } from "@/components/Logo";

// Reads live session and database state, so it must never be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function Landing() {
  const user = await currentUser();
  if (user) {
    redirect(
      user.role === "OPERATOR"
        ? "/operator"
        : user.role === "ADMIN"
          ? "/admin"
          : "/farmer",
    );
  }

  return (
    <div className="min-h-dvh">
      {/*
        The masthead states the proposition in the two languages the app runs in, and
        the claim it leads with is the one the product can actually keep: the mandi
        that pays most is not always the one with the highest board price.
      */}
      <header className="border-b-2 border-[var(--color-ink)] bg-[var(--color-paper-2)]">
        <div className="mx-auto max-w-3xl px-5 py-7">
          <Logo className="w-full max-w-[420px]" />
          <div className="mt-3 font-body text-[17px] font-500 text-[var(--color-keep)]">
            कम नुकसान, ज़्यादा मुनाफ़ा
          </div>
          <div className="text-[14px] text-[var(--color-ink-2)]">
            Less loss, more profit
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-7">
        <p className="max-w-prose text-[17px] leading-relaxed">
          The mandi with the highest price board is often not the one that leaves you
          the most money. UNNATI subtracts transport and spoilage first, then tells you
          where to go — and finds you a truck to share so the good mandi is affordable.
        </p>

        <div className="mt-7 grid gap-5 sm:grid-cols-[1fr_1.1fr] sm:items-start">
          <div className="space-y-3">
            <Claim
              n="1"
              title="Net price, not board price"
              body="Every deduction shown as a line: commission, market fee, transport, spoilage."
            />
            <Claim
              n="2"
              title="Share the truck"
              body="Join a truck already going your way. Cost splits by weight — the detour is charged to whoever caused it."
            />
            <Claim
              n="3"
              title="Seven days' notice"
              body="Every payment is flagged a week before it is due, by SMS if the app cannot reach you."
            />
          </div>

          <LoginForm />
        </div>
      </main>

      <footer className="mx-auto max-w-3xl px-5 pb-10 text-[12.5px] text-[var(--color-ink-3)]">
        Pilot data: Nashik district, Maharashtra. Prices shown are representative
        Agmarknet/eNAM figures for demonstration, with the source and age of every
        figure cited in the app.
      </footer>
    </div>
  );
}

/*
 * Numbered because these really are a sequence — it is the order the farmer meets them
 * in: decide where to sell, then how to get there, then when to pay.
 */
function Claim({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-3 border-b border-dotted border-[var(--color-rule)] pb-3">
      <span className="tnum shrink-0 text-[13px] font-600 text-[var(--color-pool)]">
        {n}
      </span>
      <span>
        <span className="block font-display text-[16px] font-700">{title}</span>
        <span className="block text-[14px] leading-snug text-[var(--color-ink-2)]">
          {body}
        </span>
      </span>
    </div>
  );
}
