"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { prefersHindi, pick, t, type Lang } from "@/lib/i18n";

export interface CropOption {
  id: string;
  name: string;
  nameHi: string;
  category: string;
  perishability: string;
  isCustom?: boolean;
}

/**
 * The five headings the crop list groups under.
 *
 * Worth translating everywhere, unlike most inline copy: these are the words a farmer
 * scans to find their own crop among thirty-five, and an unreadable heading makes the
 * list below it invisible.
 */
const CATEGORY_LABEL: Record<
  string,
  Partial<Record<Lang, string>> & { en: string }
> = {
  VEGETABLE: {
    en: "Vegetables", hi: "सब्ज़ियाँ", mr: "भाज्या", bn: "সবজি", te: "కూరగాయలు",
    ta: "காய்கறிகள்", gu: "શાકભાજી", kn: "ತರಕಾರಿಗಳು", ml: "പച്ചക്കറികൾ",
    pa: "ਸਬਜ਼ੀਆਂ", or: "ପନିପରିବା", as: "শাক-পাচলি", ur: "سبزیاں",
  },
  FRUIT: {
    en: "Fruits", hi: "फल", mr: "फळे", bn: "ফল", te: "పండ్లు", ta: "பழங்கள்",
    gu: "ફળો", kn: "ಹಣ್ಣುಗಳು", ml: "പഴങ്ങൾ", pa: "ਫਲ", or: "ଫଳ", as: "ফল", ur: "پھل",
  },
  GRAIN: {
    en: "Grains", hi: "अनाज", mr: "धान्य", bn: "শস্য", te: "ధాన్యాలు", ta: "தானியங்கள்",
    gu: "અનાજ", kn: "ಧಾನ್ಯಗಳು", ml: "ധാന്യങ്ങൾ", pa: "ਅਨਾਜ", or: "ଶସ୍ୟ",
    as: "শস্য", ur: "اناج",
  },
  PULSE: {
    en: "Pulses", hi: "दालें", mr: "डाळी", bn: "ডাল", te: "పప్పులు", ta: "பருப்புகள்",
    gu: "કઠોળ", kn: "ಬೇಳೆಕಾಳುಗಳು", ml: "പയറുവർഗ്ഗങ്ങൾ", pa: "ਦਾਲਾਂ", or: "ଡାଲି",
    as: "দালি", ur: "دالیں",
  },
  OILSEED: {
    en: "Oilseeds", hi: "तिलहन", mr: "तेलबिया", bn: "তৈলবীজ", te: "నూనెగింజలు",
    ta: "எண்ணெய் வித்துகள்", gu: "તેલીબિયાં", kn: "ಎಣ್ಣೆಕಾಳುಗಳು", ml: "എണ്ണക്കുരുക്കൾ",
    pa: "ਤੇਲ ਬੀਜ", or: "ତେଲବୀଜ", as: "তেলবীজ", ur: "تیل کے بیج",
  },
};

/**
 * Crop selection.
 *
 * With thirty-odd crops, showing every one as a button buries the common ones — but a
 * native `<select>` on a low-end Android hides all of them behind a tap, which is
 * worse for someone reading slowly. So: the crops this farmer is most likely to be
 * holding stay visible as large targets, everything else is one tap away, and typing
 * filters across both scripts at once.
 *
 * The "add a crop" path matters more than it looks. India grows far more than any
 * list we ship, and a farmer whose crop is missing has no way to use the app at all.
 */
export function CropPicker({
  crops,
  value,
  onChange,
  lang,
}: {
  crops: CropOption[];
  value: string;
  onChange: (cropId: string) => void;
  lang: Lang;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);

  const selected = crops.find((c) => c.id === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return crops.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.nameHi.includes(query.trim()) ||
        c.id.includes(q),
    );
  }, [crops, query]);

  // Without a search, show a short common set plus whatever is already selected, so
  // the chosen crop never disappears behind the "more" fold.
  const COMMON = 8;
  const visible = useMemo(() => {
    if (matches) return matches;
    if (expanded) return crops;
    const head = crops.slice(0, COMMON);
    return selected && !head.some((c) => c.id === selected.id)
      ? [...head, selected]
      : head;
  }, [matches, expanded, crops, selected]);

  const grouped = useMemo(() => {
    const g = new Map<string, CropOption[]>();
    for (const c of visible) {
      const list = g.get(c.category) ?? [];
      list.push(c);
      g.set(c.category, list);
    }
    return [...g.entries()];
  }, [visible]);

  const showGroups = expanded || Boolean(matches);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <label className="flex-1">
          <span className="sr-only">{t("searchCrop", lang)}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`${t("searchCrop", lang)} — ${crops.length}`}
            className="w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 text-[15px] outline-none focus:border-[var(--color-keep)]"
          />
        </label>
      </div>

      {visible.length === 0 && (
        <p className="py-3 text-center text-[14px] text-[var(--color-ink-3)]">
          {prefersHindi(lang)
            ? "कोई फ़सल नहीं मिली। नीचे से जोड़ें।"
            : "No crop matched. Add it below."}
        </p>
      )}

      {showGroups ? (
        <div className="space-y-3">
          {grouped.map(([category, list]) => (
            <div key={category}>
              <div className="mb-1 font-display text-[11px] font-700 uppercase tracking-[0.14em] text-[var(--color-ink-3)]">
                {CATEGORY_LABEL[category]
                  ? pick(lang, CATEGORY_LABEL[category])
                  : category}
              </div>
              <Buttons
                list={list}
                value={value}
                onChange={onChange}
                lang={lang}
              />
            </div>
          ))}
        </div>
      ) : (
        <Buttons list={visible} value={value} onChange={onChange} lang={lang} />
      )}

      {!matches && crops.length > COMMON && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 w-full rounded-[3px] border border-dashed border-[var(--color-rule-strong)] px-3 py-2 text-[14px] text-[var(--color-ink-2)]"
        >
          {expanded
            ? t("showLess", lang)
            : `${t("moreCrops", lang)} (${crops.length - COMMON})`}
        </button>
      )}

      {adding ? (
        <AddCropForm
          lang={lang}
          onCancel={() => setAdding(false)}
          onAdded={(id) => {
            setAdding(false);
            setQuery("");
            onChange(id);
            router.refresh();
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 w-full rounded-[3px] border border-dashed border-[var(--color-pool)] px-3 py-2 text-[14px] text-[var(--color-pool)]"
        >
          {t("cropNotListed", lang)} · {t("addCrop", lang)}
        </button>
      )}
    </div>
  );
}

function Buttons({
  list,
  value,
  onChange,
  lang,
}: {
  list: CropOption[];
  value: string;
  onChange: (id: string) => void;
  lang: Lang;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((c) => {
        const on = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            aria-pressed={on}
            className={`rounded-[3px] border px-3 py-2 text-left leading-tight ${
              on
                ? "border-[var(--color-keep)] bg-[var(--color-keep)] text-[var(--color-paper-2)]"
                : "border-[var(--color-rule)] bg-[var(--color-paper)]"
            }`}
          >
            <span className="block text-[15px] font-600">
              {prefersHindi(lang) ? c.nameHi : c.name}
            </span>
            <span
              className={`block text-[11px] ${
                on ? "text-[var(--color-paper-edge)]" : "text-[var(--color-ink-3)]"
              }`}
            >
              {prefersHindi(lang) ? c.name : c.nameHi}
              {c.perishability === "HIGH" ? " · ⚠" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Add a crop the app does not ship.
 *
 * Only three questions, and only one of them is a judgement call. Shelf life drives
 * the spoilage estimate, so it has to be asked — but it is asked in days, framed as
 * "how long does it keep", which is something a farmer knows precisely and a form
 * label like "shelf life hours" would obscure.
 */
function AddCropForm({
  lang,
  onCancel,
  onAdded,
}: {
  lang: Lang;
  onCancel: () => void;
  onAdded: (cropId: string) => void;
}) {
  const [name, setName] = useState("");
  const [nameHi, setNameHi] = useState("");
  const [days, setDays] = useState(7);
  const [category, setCategory] = useState("VEGETABLE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);

    const res = await fetch("/api/crops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, nameHi, shelfLifeDays: days, category }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "Could not add this crop.");
      return;
    }
    onAdded(data.cropId);
  }

  // A div, not a form. This is rendered inside the sell form, and a nested <form> is
  // invalid HTML — the browser discards the inner element, so a submit button here
  // would submit the *outer* form and navigate away instead of adding the crop.
  return (
    <div className="mt-2 space-y-2 rounded-[3px] border border-[var(--color-pool)] bg-[var(--color-pool-soft)] p-3">
      <div className="font-display text-[11px] font-700 uppercase tracking-[0.14em] text-[var(--color-pool)]">
        {t("addCrop", lang)}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-[var(--color-ink-2)]">
            {t("cropNameEn", lang)}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Drumstick"
            className="w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 text-[15px]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] text-[var(--color-ink-2)]">
            {t("cropNameHi", lang)}
          </span>
          <input
            value={nameHi}
            onChange={(e) => setNameHi(e.target.value)}
            placeholder="सहजन"
            className="w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 text-[15px]"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-[12.5px] text-[var(--color-ink-2)]">
          {prefersHindi(lang) ? "किस तरह की फ़सल" : "Kind of crop"}
        </span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 text-[15px]"
        >
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {pick(lang, v)}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-[12.5px] text-[var(--color-ink-2)]">
          {t("keepsFor", lang)} — {days} {t("days", lang)}
        </span>
        <input
          type="range"
          min="1"
          max="90"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-full accent-[var(--color-pool)]"
        />
        <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--color-ink-3)]">
          {prefersHindi(lang)
            ? "कटाई के बाद बिना ठंडक के कितने दिन ठीक रहती है। इसी से ख़राबी का अनुमान लगता है।"
            : "How long it stays good after harvest without cooling. The spoilage estimate is built from this."}
        </span>
      </label>

      {error && (
        <p role="alert" className="text-[13px] text-[var(--color-lose)]">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 text-[14px]"
        >
          {t("cancel", lang)}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || name.trim().length < 2 || nameHi.trim().length < 1}
          className="flex-[2] rounded-[3px] bg-[var(--color-pool)] px-3 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-60"
        >
          {busy ? "…" : t("saveCrop", lang)}
        </button>
      </div>

      <p className="text-center text-[11.5px] leading-snug text-[var(--color-ink-3)]">
        {prefersHindi(lang)
          ? "नई फ़सल का सरकारी भाव नहीं आएगा — मंडी का भाव आपको खुद देखना होगा।"
          : "A crop you add has no government price feed, so mandi prices for it will have to be entered by hand."}
      </p>
    </div>
  );
}
