"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Slip } from "@/components/Slip";
import { prefersHindi, t, type Lang } from "@/lib/i18n";

/** Register a vehicle — FR-3. */
export function TruckForm({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [regNo, setRegNo] = useState("");
  const [vehicleType, setVehicleType] = useState("Tata 407 (open body)");
  const [capacityKg, setCapacityKg] = useState("4000");
  const [ratePerKm, setRatePerKm] = useState("34");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/trucks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        regNo,
        vehicleType,
        capacityKg: Number(capacityKg),
        ratePerKm: Number(ratePerKm),
      }),
    });

    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not add this truck.");
      return;
    }
    setRegNo("");
    router.refresh();
  }

  return (
    <Slip>
      <form onSubmit={submit} className="space-y-3">
        <Field
          label={t("registration", lang)}
          value={regNo}
          onChange={setRegNo}
          placeholder="MH 15 AB 1234"
        />
        <Field
          label={prefersHindi(lang) ? "गाड़ी का प्रकार" : "Vehicle type"}
          value={vehicleType}
          onChange={setVehicleType}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={`${t("capacity", lang)} (kg)`}
            value={capacityKg}
            onChange={setCapacityKg}
            type="number"
            inputMode="numeric"
          />
          <Field
            label={`${t("ratePerKm", lang)} (₹)`}
            value={ratePerKm}
            onChange={setRatePerKm}
            type="number"
            inputMode="numeric"
          />
        </div>

        {error && (
          <p role="alert" className="text-[13px] text-[var(--color-lose)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-[3px] bg-[var(--color-keep)] px-4 font-display text-[16px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-60"
        >
          {busy ? "…" : t("addTruck", lang)}
        </button>
      </form>
    </Slip>
  );
}

/**
 * Open a run to a mandi.
 *
 * Creating the trip is also what tells nearby farmers about it, which is the "notify
 * farmers when a truck is scheduled in their area" requirement from the development
 * document — so the button says so rather than leaving it as a surprise.
 */
export function NewTripForm({
  truckId,
  lang,
  mandis,
  defaultOrigin,
}: {
  truckId: string;
  lang: Lang;
  mandis: Array<{ id: string; label: string }>;
  defaultOrigin: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mandiId, setMandiId] = useState(mandis[0]?.id ?? "");
  const [originName, setOriginName] = useState(defaultOrigin);
  const [hoursFromNow, setHoursFromNow] = useState(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        truckId,
        mandiId,
        originName,
        departAt: new Date(
          Date.now() + hoursFromNow * 3_600_000,
        ).toISOString(),
      }),
    });

    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "Could not start this trip.");
      return;
    }
    router.push(`/operator/trip/${data.tripId}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-[3px] border-2 border-[var(--color-keep)] px-4 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-keep)]"
      >
        {t("openTrip", lang)}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t-2 border-[var(--color-ink)] pt-3">
      <label className="block">
        <span className="mb-1 block text-[13px] font-500 text-[var(--color-ink-2)]">
          {prefersHindi(lang) ? "कहाँ जाना है" : "Going to"}
        </span>
        <select
          value={mandiId}
          onChange={(e) => setMandiId(e.target.value)}
          className="w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 text-[16px]"
        >
          {mandis.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <Field
        label={prefersHindi(lang) ? "कहाँ से" : "Starting from"}
        value={originName}
        onChange={setOriginName}
      />

      <label className="block">
        <span className="mb-1 block text-[13px] font-500 text-[var(--color-ink-2)]">
          {t("departs", lang)} — {hoursFromNow} h{" "}
          {prefersHindi(lang) ? "बाद" : "from now"}
        </span>
        <input
          type="range"
          min="2"
          max="72"
          step="2"
          value={hoursFromNow}
          onChange={(e) => setHoursFromNow(Number(e.target.value))}
          className="w-full accent-[var(--color-keep)]"
        />
      </label>

      {error && (
        <p role="alert" className="text-[13px] text-[var(--color-lose)]">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-[3px] border border-[var(--color-rule-strong)] px-3 text-[15px]"
        >
          {t("cancel", lang)}
        </button>
        <button
          type="submit"
          disabled={busy}
          className="flex-[2] rounded-[3px] bg-[var(--color-keep)] px-3 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-60"
        >
          {busy ? "…" : t("openTrip", lang)}
        </button>
      </div>

      <p className="text-center text-[12px] leading-snug text-[var(--color-ink-3)]">
        {prefersHindi(lang)
          ? "यात्रा शुरू करते ही आस-पास के किसानों को सूचना चली जाएगी।"
          : "Farmers within 35 km are alerted as soon as the trip opens."}
      </p>
    </form>
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
        className="tnum w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 text-[16px] outline-none focus:border-[var(--color-keep)]"
      />
    </label>
  );
}
