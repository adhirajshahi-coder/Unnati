"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Slip, SlipHeading } from "@/components/Slip";

/**
 * Phone + PIN, the pattern this audience already uses for UPI and banking.
 *
 * The demo accounts are listed in the open beneath the form. Hiding them behind a
 * README would make the deployed app impossible to evaluate, and there is nothing
 * sensitive behind them — the data is seeded and fictional.
 */
export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [village, setVillage] = useState("");
  const [role, setRole] = useState<"FARMER" | "OPERATOR">("FARMER");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch(
      mode === "signin" ? "/api/auth/login" : "/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin, name, village, role }),
      },
    );

    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Try again.");
      return;
    }
    router.push(data.redirect);
    router.refresh();
  }

  function fill(p: string) {
    setMode("signin");
    setPhone(p);
    setPin("1234");
    setError(null);
  }

  return (
    <div>
      <Slip lifted>
        <SlipHeading>
          {mode === "signin" ? "Sign in · लॉग इन" : "New account · नया खाता"}
        </SlipHeading>

        <form onSubmit={submit} className="space-y-3 pt-2">
          <Field
            label="Mobile number · मोबाइल नंबर"
            value={phone}
            onChange={setPhone}
            inputMode="numeric"
            autoComplete="tel"
            placeholder="9000000001"
            maxLength={10}
          />
          <Field
            label="4-digit PIN · पिन"
            value={pin}
            onChange={setPin}
            inputMode="numeric"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="1234"
            maxLength={4}
          />

          {mode === "register" && (
            <>
              <Field
                label="Your name · आपका नाम"
                value={name}
                onChange={setName}
                autoComplete="name"
              />
              <Field
                label="Village · गाँव"
                value={village}
                onChange={setVillage}
                placeholder="Niphad"
              />
              <div>
                <span className="mb-1 block text-[13px] font-500 text-[var(--color-ink-2)]">
                  I am a · मैं हूँ
                </span>
                <div className="flex gap-2">
                  {(
                    [
                      ["FARMER", "Farmer · किसान"],
                      ["OPERATOR", "Truck owner · ट्रक मालिक"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRole(value)}
                      className={`flex-1 rounded-[3px] border px-3 text-[14px] ${
                        role === value
                          ? "border-[var(--color-keep)] bg-[var(--color-keep)] font-600 text-[var(--color-paper-2)]"
                          : "border-[var(--color-rule)] bg-[var(--color-paper)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-[3px] border border-[var(--color-lose)] bg-[var(--color-lose-soft)] px-3 py-2 text-[14px] text-[var(--color-lose)]"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-[3px] bg-[var(--color-keep)] px-4 font-display text-[17px] font-700 uppercase tracking-[0.08em] text-[var(--color-paper-2)] disabled:opacity-60"
          >
            {busy
              ? "…"
              : mode === "signin"
                ? "Sign in · लॉग इन"
                : "Create account · खाता बनाएँ"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "register" : "signin");
              setError(null);
            }}
            className="w-full text-[14px] underline decoration-dotted underline-offset-2 text-[var(--color-ink-2)]"
          >
            {mode === "signin"
              ? "New here? Create an account"
              : "Already registered? Sign in"}
          </button>
        </form>
      </Slip>

      <div className="mt-4 border-t border-dotted border-[var(--color-rule)] pt-3">
        <div className="mb-1.5 font-display text-[11px] font-700 uppercase tracking-[0.14em] text-[var(--color-ink-3)]">
          Demo accounts · PIN 1234
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            ["9000000001", "Ramesh · farmer"],
            ["9000000002", "Sunita · farmer"],
            ["9111111111", "Santosh · truck owner"],
            ["9999999999", "Ops · admin"],
          ].map(([p, who]) => (
            <button
              key={p}
              type="button"
              onClick={() => fill(p)}
              className="min-h-0 rounded-[3px] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-2 py-1.5 text-left text-[12px] leading-tight"
            >
              <span className="tnum block font-500">{p}</span>
              <span className="block text-[var(--color-ink-3)]">{who}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  // Narrowed to the value, so callers pass a setState directly. Omitted from the
  // spread props below or it collides with the DOM event handler of the same name.
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-500 text-[var(--color-ink-2)]">
        {label}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="tnum w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 text-[17px] outline-none focus:border-[var(--color-keep)]"
      />
    </label>
  );
}
