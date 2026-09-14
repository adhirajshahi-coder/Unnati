"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Slip, SlipHeading } from "@/components/Slip";
import { CropPicker, type CropOption } from "@/components/CropPicker";
import { t, type Lang } from "@/lib/i18n";

/**
 * Harvest entry.
 *
 * Quantity is entered in quintals because that is the unit a farmer weighs and sells
 * in — the app converts to kilograms internally and never asks anyone to do that
 * conversion themselves.
 */
export function SellForm({
  crops,
  lang,
  initial,
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
}) {
  const router = useRouter();
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

  return (
    <Slip lifted className="mb-6">
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
            <input
              type="number"
              inputMode="decimal"
              min="0.1"
              step="0.5"
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
