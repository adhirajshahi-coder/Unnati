"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Slip, SlipHeading } from "@/components/Slip";
import { CropPicker, type CropOption } from "@/components/CropPicker";
import { prefersHindi, t, weight, type Lang } from "@/lib/i18n";

/**
 * Harvest entry.
 *
 * Quantity is entered in quintals because that is the unit a farmer weighs and sells
 * in — the app converts to kilograms internally and never asks anyone to do that
 * conversion themselves.
 *
 * Once an answer exists the form folds to a single line. A farmer who has already
 * asked "where should my onion go" should not have to scroll past a crop picker, two
 * sliders and a submit button to read the reply — the question becomes a caption on
 * the answer, and stays one tap from being changed.
 */
export function SellForm({
  crops,
  lang,
  initial,
  hasResult = false,
}: {
  crops: CropOption[];
  lang: Lang;
  initial: {
    cropId?: string;
    quantityKg: number;
    grade: "A" | "B" | "C";
    hoursAgo: number;
    radiusKm: number;
  };
  hasResult?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasResult);
  const [cropId, setCropId] = useState(initial.cropId ?? crops[0]?.id ?? "");
  const [quintals, setQuintals] = useState(
    initial.quantityKg > 0 ? String(initial.quantityKg / 100) : "25",
  );
  const [grade, setGrade] = useState<"A" | "B" | "C">(initial.grade);
  const [hoursAgo, setHoursAgo] = useState(initial.hoursAgo);
  const [radiusKm, setRadiusKm] = useState(initial.radiusKm);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Math.round(Number(quintals) * 100);
    if (!cropId || !Number.isFinite(qty) || qty <= 0) return;

    const params = new URLSearchParams({
      crop: cropId,
      qty: String(qty),
      grade,
      since: String(hoursAgo),
      radius: String(radiusKm),
    });
    router.push(`/farmer/sell?${params}`);
  }

  const selected = crops.find((c) => c.id === cropId);

  if (!open) {
    const gradeLabel = { A: t("gradeA", lang), B: t("gradeB", lang), C: t("gradeC", lang) }[grade];
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex w-full items-center justify-between gap-3 rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper-2)] px-4 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-500">
            {selected ? (prefersHindi(lang) ? selected.nameHi : selected.name) : ""} ·{" "}
            {weight(Math.round(Number(quintals) * 100), lang)}
          </span>
          <span className="tnum block truncate text-[12px] text-[var(--color-ink-3)]">
            {gradeLabel} · {hoursAgo}h · {radiusKm} km
          </span>
        </span>
        <span className="shrink-0 font-display text-[13px] font-700 uppercase tracking-[0.08em] text-[var(--color-keep)]">
          {prefersHindi(lang) ? "बदलें" : "Change"}
        </span>
      </button>
    );
  }

  return (
    <Slip lifted className="mb-5">
      <SlipHeading>{t("whatDidYouHarvest", lang)}</SlipHeading>

      <form onSubmit={submit} className="space-y-4 pt-2">
        <div>
          <Label>{t("crop", lang)}</Label>
          <CropPicker
            crops={crops}
            value={cropId}
            onChange={setCropId}
            lang={lang}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Label>
              {t("quantity", lang)} ({t("quintal", lang)})
            </Label>
            {/*
              step="any", not a half-quintal step.

              `min="0.1"` with `step="0.5"` made the valid values 0.1, 0.6, 1.1 … 24.6,
              25.1 — which excludes every whole number. Typing 25, the most ordinary
              answer there is, produced "the two nearest valid values are 24.6 and
              25.1" and the form refused to submit.

              A weighbridge slip does not round to half a quintal anyway. Whatever it
              says is what should go in the box.
            */}
            <input
              type="number"
              inputMode="decimal"
              min="0.1"
              step="any"
              value={quintals}
              onChange={(e) => setQuintals(e.target.value)}
              className="tnum w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 text-[20px] font-600 outline-none focus:border-[var(--color-keep)]"
            />
            <span className="mt-0.5 block text-[12px] text-[var(--color-ink-3)]">
              = {Math.round(Number(quintals || 0) * 100).toLocaleString("en-IN")}{" "}
              {t("kg", lang)}
            </span>
          </label>

          <div>
            <Label>{t("grade", lang)}</Label>
            <div className="flex gap-1">
              {(
                [
                  ["A", t("gradeA", lang)],
                  ["B", t("gradeB", lang)],
                  ["C", t("gradeC", lang)],
                ] as const
              ).map(([g, label]) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  aria-pressed={grade === g}
                  className={`flex-1 rounded-[3px] border px-1 text-[13px] leading-tight ${
                    grade === g
                      ? "border-[var(--color-keep)] bg-[var(--color-keep)] font-600 text-[var(--color-paper-2)]"
                      : "border-[var(--color-rule)] bg-[var(--color-paper)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label>
              {t("harvestedWhen", lang)} — {hoursAgo}h ago
            </Label>
            <input
              type="range"
              min="0"
              max="96"
              step="2"
              value={hoursAgo}
              onChange={(e) => setHoursAgo(Number(e.target.value))}
              className="w-full accent-[var(--color-keep)]"
            />
          </label>
          <label className="block">
            <Label>
              {t("distance", lang)} — {radiusKm} km
            </Label>
            <input
              type="range"
              min="10"
              max="300"
              step="10"
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-full accent-[var(--color-keep)]"
            />
          </label>
        </div>

        {selected?.perishability === "HIGH" && hoursAgo > 24 && (
          <p className="rounded-[3px] border border-[var(--color-lose)] bg-[var(--color-lose-soft)] px-3 py-2 text-[13.5px] leading-snug text-[var(--color-lose)]">
            {t("spoilageWarning", lang)}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-[3px] bg-[var(--color-keep)] px-4 font-display text-[18px] font-700 uppercase tracking-[0.08em] text-[var(--color-paper-2)]"
        >
          {t("findBestMandi", lang)}
        </button>
      </form>
    </Slip>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[13px] font-500 text-[var(--color-ink-2)]">
      {children}
    </span>
  );
}
