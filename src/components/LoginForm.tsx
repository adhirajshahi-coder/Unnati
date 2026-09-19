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
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({ phone, pin, name, village, role, dateOfBirth: dob, email }),
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

              {/*
                Asked at sign-up, not left to settings.

                This is the only moment a new farmer is reliably sitting with someone
                helping them — an agent, a son, a neighbour with the handset. Ask later
                and the people who never go looking in settings are exactly the people
                who are locked out in six months with nothing to match against.
              */}
              <div className="rounded-[3px] border border-dashed border-[var(--color-rule-strong)] bg-[var(--color-paper-2)] px-3 py-3">
                <p className="mb-2 text-[13px] leading-snug text-[var(--color-ink-2)]">
                  <span className="font-600">पिन भूल जाएँ तो काम आएगा</span> — दोनों
                  वैकल्पिक हैं, पर भरे होंगे तो आप ख़ुद नया पिन बना सकेंगे।
                  <span className="mt-1 block text-[12px] text-[var(--color-ink-3)]">
                    Both optional. With either one you can reset your own PIN later.
                  </span>
                </p>

                <div className="space-y-2.5">
                  <OptionalField
                    label="जन्मतिथि · Date of birth"
                    value={dob}
                    onChange={setDob}
                    inputMode="numeric"
                    placeholder="05/08/1974"
                  />
                  <OptionalField
                    label="ईमेल — अगर हो · Email, if you have one"
                    value={email}
                    onChange={setEmail}
                    type="email"
                    autoComplete="email"
                    placeholder="naam@example.com"
                  />
                </div>
              </div>
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

        {mode === "signin" && <PinHelp phone={phone} />}
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
/**
 * "I have forgotten my PIN."
 *
 * A farmer who cannot sign in is looking at a screen that, without this, tells them
 * nothing at all — and they are the user least likely to work out on their own that
 * somebody has to be telephoned.
 *
 * Three ways back in, offered in the order most farmers can actually use them:
 *
 *   1. **Date of birth.** Needs nothing but the handset. It is also the weakest of the
 *      three — a birth date is not a secret from a neighbour — so the server locks
 *      recovery after five wrong answers and alerts the account whenever it succeeds.
 *   2. **A link by email**, for the minority who have one.
 *   3. **Ask the team**, which raises a request for the ops desk to call back. This is
 *      the one that always works, and it is why the panel never dead-ends.
 *
 * Collapsed behind `details`, so the ordinary sign-in is untouched by it.
 */
function PinHelp({ phone }: { phone: string }) {
  const [tab, setTab] = useState<"dob" | "email" | "ask">("dob");

  return (
    <details className="mt-3 border-t border-dotted border-[var(--color-rule)] pt-3">
      <summary className="cursor-pointer list-none text-[14px] underline decoration-dotted underline-offset-2 text-[var(--color-ink-2)] [&::-webkit-details-marker]:hidden">
        पिन भूल गए? · Forgot your PIN?
      </summary>

      <div
        role="tablist"
        aria-label="PIN recovery method"
        className="mt-3 flex flex-wrap gap-1.5"
      >
        {(
          [
            ["dob", "जन्मतिथि से", "Date of birth"],
            ["email", "ईमेल से", "Email"],
            ["ask", "टीम से मदद", "Ask the team"],
          ] as const
        ).map(([key, hi, en]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-[3px] border px-2.5 py-1.5 text-[13px] ${
              tab === key
                ? "border-[var(--color-keep)] bg-[var(--color-keep)] text-[var(--color-paper-2)]"
                : "border-[var(--color-rule-strong)] bg-[var(--color-paper)] text-[var(--color-ink-2)]"
            }`}
          >
            {hi}
            <span className="ml-1 opacity-70">· {en}</span>
          </button>
        ))}
      </div>

      <div className="mt-3">
        {tab === "dob" && <DobReset phone={phone} />}
        {tab === "email" && <EmailReset phone={phone} />}
        {tab === "ask" && <AskTeam phone={phone} />}
      </div>
    </details>
  );
}

/** Shared success/error line, so all three paths report the same way. */
function Result({ text, tone }: { text: string; tone: "keep" | "lose" }) {
  return (
    <p
      role={tone === "lose" ? "alert" : "status"}
      className={`mt-2 rounded-[3px] border px-3 py-2 text-[13.5px] leading-snug ${
        tone === "keep"
          ? "border-[var(--color-keep)] bg-[var(--color-keep-soft)] text-[var(--color-keep)]"
          : "border-[var(--color-lose)] bg-[var(--color-lose-soft)] text-[var(--color-lose)]"
      }`}
    >
      {text}
    </p>
  );
}

const helpInput =
  "tnum w-full min-w-0 rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-[16px] outline-none focus:border-[var(--color-keep)]";
const helpButton =
  "shrink-0 rounded-[3px] border-2 border-[var(--color-keep)] px-4 py-2 text-[14px] font-600 text-[var(--color-keep)] disabled:opacity-50";

function DobReset({ phone }: { phone: string }) {
  const [num, setNum] = useState("");
  const [dob, setDob] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "keep" | "lose" } | null>(
    null,
  );

  const number = num || phone;
  const ready = number.trim().length === 10 && dob.trim() && /^\d{4}$/.test(pin);

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/pin-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "dob",
          phone: number.trim(),
          dob: dob.trim(),
          newPin: pin,
        }),
      });
      const data = await res.json();
      setMsg(
        res.ok
          ? { text: data.messageHi ?? data.message, tone: "keep" }
          : { text: data.errorHi ?? data.error, tone: "lose" },
      );
      if (res.ok) setPin("");
    } catch {
      setMsg({ text: "नेटवर्क नहीं मिला। दोबारा कोशिश कीजिए।", tone: "lose" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] leading-snug text-[var(--color-ink-3)]">
        वही जन्मतिथि डालिए जो खाते में दर्ज है। पाँच बार ग़लत होने पर कुछ देर के
        लिए बंद हो जाएगा।
      </p>
      <input
        id="dob-reset-phone"
        value={number}
        onChange={(e) => setNum(e.target.value)}
        inputMode="numeric"
        maxLength={10}
        placeholder="मोबाइल नंबर"
        aria-label="Mobile number"
        className={helpInput}
      />
      <input
        id="dob-reset-dob"
        value={dob}
        onChange={(e) => setDob(e.target.value)}
        inputMode="numeric"
        placeholder="जन्मतिथि — 05/08/1974"
        aria-label="Date of birth"
        className={helpInput}
      />
      <div className="flex flex-wrap gap-2">
        <input
          id="dob-reset-pin"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          inputMode="numeric"
          maxLength={4}
          type="password"
          placeholder="नया 4 अंकों का पिन"
          aria-label="New 4-digit PIN"
          className={helpInput + " flex-1"}
        />
        <button type="button" onClick={submit} disabled={!ready || busy} className={helpButton}>
          {busy ? "…" : "पिन बदलें"}
        </button>
      </div>
      {msg && <Result text={msg.text} tone={msg.tone} />}
    </div>
  );
}

function EmailReset({ phone }: { phone: string }) {
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const value = id || phone;

  async function submit() {
    if (busy || value.trim().length < 3) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/pin-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "email", identifier: value.trim() }),
      });
      const data = await res.json();
      setMsg(data.messageHi ?? data.message ?? "");
    } catch {
      setMsg("नेटवर्क नहीं मिला। दोबारा कोशिश कीजिए।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] leading-snug text-[var(--color-ink-3)]">
        यह तभी चलेगा जब आपने खाते में ईमेल जोड़ा हो। ईमेल या मोबाइल नंबर, कोई भी
        डाल सकते हैं।
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          id="email-reset-id"
          value={value}
          onChange={(e) => setId(e.target.value)}
          placeholder="ईमेल या मोबाइल नंबर"
          aria-label="Email or mobile number"
          className={helpInput + " flex-1"}
        />
        <button type="button" onClick={submit} disabled={busy} className={helpButton}>
          {busy ? "…" : "लिंक भेजें"}
        </button>
      </div>
      {msg && <Result text={msg} tone="keep" />}
    </div>
  );
}

function AskTeam({ phone }: { phone: string }) {
  const [num, setNum] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const number = num || phone;

  async function submit() {
    if (busy || number.trim().length !== 10) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/pin-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: number.trim() }),
      });
      const data = await res.json();
      setMsg(data.messageHi ?? data.message ?? "");
    } catch {
      setMsg("नेटवर्क नहीं मिला। दोबारा कोशिश कीजिए।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[13px] leading-snug text-[var(--color-ink-3)]">
        अपना नंबर डालिए। उन्नति टीम इसी नंबर पर कॉल करके नया पिन देगी।
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          id="ask-team-phone"
          value={number}
          onChange={(e) => setNum(e.target.value)}
          inputMode="numeric"
          maxLength={10}
          placeholder="मोबाइल नंबर"
          aria-label="Mobile number"
          className={helpInput + " flex-1"}
        />
        <button type="button" onClick={submit} disabled={busy} className={helpButton}>
          {busy ? "…" : "मदद माँगें"}
        </button>
      </div>
      {msg && <Result text={msg} tone="keep" />}
    </div>
  );
}

/**
 * Like `Field`, but genuinely optional.
 *
 * `Field` marks its input `required`, which is right for a name and a village and
 * wrong here: leaving the date of birth blank has to submit the form, not silently
 * refuse to. Kept as its own component rather than a `required` prop on `Field` so
 * nobody has to remember to pass it.
 */
function OptionalField({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-500 text-[var(--color-ink-2)]">
        {label}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-[16px] outline-none focus:border-[var(--color-keep)]"
      />
    </label>
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
