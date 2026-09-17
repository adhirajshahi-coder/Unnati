import { Slip, Line, SlipHeading, Stamp } from "@/components/Slip";
import { TransportChoice } from "@/components/TransportChoice";
import { SpeakButton } from "@/components/SpeakButton";
import { prefersHindi, pick, rupees, t, weight, type Lang } from "@/lib/i18n";

/**
 * The slip, said out loud.
 *
 * Assembled from the same dictionary keys the slip is printed from, in the same order,
 * with the same figures — so a farmer who listens and a field agent who reads over their
 * shoulder are working from one document. If this sentence were written separately it
 * would drift from the slip within two changes, and a spoken price that disagrees with
 * the printed one is the single worst thing this app could do.
 *
 * It reads telegraphically rather than as flowing prose, which is deliberate: this is a
 * receipt being read out, and each deduction wants its own beat.
 */
function spokenSlip(
  best: RankedView,
  cropName: string,
  quantityKg: number,
  lang: Lang,
): string {
  const mandi = prefersHindi(lang) ? best.mandiNameHi : best.mandiName;

  const lines = [
    `${t("bestChoice", lang)}: ${mandi}, ${best.distanceKm} km.`,
    `${cropName}, ${weight(quantityKg, lang)}.`,
    `${t("mandiPrice", lang)} ${rupees(best.modalPrice)} ${t("perQuintal", lang)}.`,
    `${t("commission", lang)} ${rupees(best.commission)}.`,
    `${t("marketFee", lang)} ${rupees(best.marketFee)}.`,
    `${t("transport", lang)}, ${best.pooled ? t("sharedTruck", lang) : t("ownTruck", lang)}, ${rupees(best.transportCost)}.`,
    `${t("spoilage", lang)} ${rupees(best.spoilageLoss)}.`,
    `${t("youTakeHome", lang)} ${rupees(best.netValue)}.`,
  ];

  if (best.advantageOverNearest > 0) {
    lines.push(
      `${rupees(best.advantageOverNearest)} ${t("moreThanNearest", lang)}.`,
    );
  }

  return lines.join(" ");
}

/** The shared-truck offer for a mandi: a live group, or a projection of starting one. */
export interface SharedOffer {
  poolId?: string;
  memberCount: number;
  committedKg: number;
  cost: number;
  costIfFull: number;
  soloCost: number;
  savedPercent: number;
  vehicle: string;
  targetKg: number;
}

export interface RankedView {
  mandiId: string;
  mandiName: string;
  mandiNameHi: string;
  district: string;
  modalPrice: number;
  source: string;
  priceAgeHours: number;
  distanceKm: number;
  transitHours: number;
  quintals: number;
  grossValue: number;
  commission: number;
  marketFee: number;
  transportCost: number;
  pooled: boolean;
  pooledTripId?: string;
  spoilageLoss: number;
  spoilagePercent: number;
  exceedsShelfLife: boolean;
  netValue: number;
  netPerQuintal: number;
  advantageOverNearest: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  soloTransport: number;
  shared: SharedOffer;
}

/**
 * The ranked answer.
 *
 * The winner is rendered as a full mandi patti — every deduction on its own ruled
 * line, totalled with a stamp. The runners-up collapse to one line each, because the
 * decision is "where do I send this", and four full slips would bury it.
 */
export function Recommendations({
  lang,
  crop,
  quantityKg,
  ranked,
  departAt,
  origin,
  cropId,
  grade,
}: {
  lang: Lang;
  crop: {
    name: string;
    nameHi: string;
    handlingTip: string;
    handlingTipHi: string;
    shelfLifeHours: number;
    perishability: string;
  };
  quantityKg: number;
  ranked: RankedView[];
  departAt: string;
  origin: { name: string; lat: number; lng: number };
  cropId: string;
  grade: "A" | "B" | "C";
}) {
  if (ranked.length === 0) {
    return (
      <Slip>
        <p className="py-6 text-center text-[15px] text-[var(--color-ink-2)]">
          {t("noMandis", lang)}
        </p>
      </Slip>
    );
  }

  const [best, ...rest] = ranked;
  const cropName = prefersHindi(lang) ? crop.nameHi : crop.name;

  return (
    <section className="space-y-5">
      <BestSlip lang={lang} best={best} cropName={cropName} quantityKg={quantityKg} />

      <TransportChoice
        lang={lang}
        mandiId={best.mandiId}
        mandiName={prefersHindi(lang) ? best.mandiNameHi : best.mandiName}
        distanceKm={best.distanceKm}
        quantityKg={quantityKg}
        cropId={cropId}
        grade={grade}
        origin={origin}
        departAt={departAt}
        soloTransport={best.transportCost}
        alreadyPooled={best.pooled}
        pooledTripId={best.pooledTripId}
        shared={best.shared}
      />

      {rest.length > 0 && (
        <div>
          <SlipHeading right={`${rest.length}`}>
            {prefersHindi(lang) ? "बाकी मंडियाँ" : "Other mandis"}
          </SlipHeading>
          <ol className="mt-1">
            {rest.map((r, i) => (
              <li
                key={r.mandiId}
                className="print-in flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--color-rule)] py-2.5"
                style={{ "--i": i + 8 } as React.CSSProperties}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">
                    {prefersHindi(lang) ? r.mandiNameHi : r.mandiName}
                  </span>
                  <span className="tnum block text-[12px] text-[var(--color-ink-3)]">
                    {r.distanceKm} km · {t("mandiPrice", lang)}{" "}
                    {rupees(r.modalPrice)}
                    {r.pooled ? ` · ${t("sharedTruck", lang)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tnum block text-[16px] font-600">
                    {rupees(r.netValue)}
                  </span>
                  <span className="tnum block text-[12px] text-[var(--color-lose)]">
                    {rupees(r.advantageOverNearest - best.advantageOverNearest)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[12px] leading-snug text-[var(--color-ink-3)]">
            {prefersHindi(lang)
              ? "लाल आँकड़ा = सबसे अच्छे विकल्प के मुकाबले कितना कम मिलेगा।"
              : "The red figure is how much less you would take home than the best option."}
          </p>
        </div>
      )}

      <HandlingAdvice lang={lang} crop={crop} best={best} />
    </section>
  );
}

function BestSlip({
  lang,
  best,
  cropName,
  quantityKg,
}: {
  lang: Lang;
  best: RankedView;
  cropName: string;
  quantityKg: number;
}) {
  const saving = best.pooled
    ? Math.max(0, best.soloTransport - best.transportCost)
    : 0;

  return (
    <Slip lifted>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-keep)]">
            {t("bestChoice", lang)}
          </div>
          <h2 className="text-[26px] leading-tight">
            {prefersHindi(lang) ? best.mandiNameHi : best.mandiName}
          </h2>
          <div className="tnum text-[12.5px] text-[var(--color-ink-3)]">
            {best.district} · {best.distanceKm} km · {best.transitHours} h
          </div>
        </div>
        <Confidence lang={lang} level={best.confidence} age={best.priceAgeHours} />
      </div>

      <div className="border-t-2 border-[var(--color-ink)] pt-1">
        <Line
          index={0}
          label={`${cropName} · ${weight(quantityKg, lang)}`}
          sub={`${t("mandiPrice", lang)} ${rupees(best.modalPrice)} ${t("perQuintal", lang)}`}
          value={rupees(best.grossValue)}
          strong
        />
        <Line
          index={1}
          label={t("commission", lang)}
          value={`− ${rupees(best.commission)}`}
          tone="lose"
        />
        <Line
          index={2}
          label={t("marketFee", lang)}
          value={`− ${rupees(best.marketFee)}`}
          tone="lose"
        />
        <Line
          index={3}
          label={
            best.pooled
              ? `${t("transport", lang)} · ${t("sharedTruck", lang)}`
              : `${t("transport", lang)} · ${t("ownTruck", lang)}`
          }
          sub={
            best.pooled
              ? `${t("youSave", lang)} ${rupees(saving)}`
              : undefined
          }
          value={`− ${rupees(best.transportCost)}`}
          tone={best.pooled ? "pool" : "lose"}
        />
        <Line
          index={4}
          label={t("spoilage", lang)}
          sub={`${best.spoilagePercent}% · ${best.transitHours} h`}
          value={`− ${rupees(best.spoilageLoss)}`}
          tone="lose"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <Stamp
          label={t("youTakeHome", lang)}
          value={rupees(best.netValue)}
        />
        <div className="text-right">
          <div className="tnum text-[15px] font-600">
            {rupees(best.netPerQuintal)}
          </div>
          <div className="text-[12px] text-[var(--color-ink-3)]">
            {t("netPrice", lang)} {t("perQuintal", lang)}
          </div>
        </div>
      </div>

      {/*
        Beside the total, because this is the number the whole screen exists to deliver
        and the farmer who cannot read it is standing right here.
      */}
      <div className="mt-3 border-t border-dotted border-[var(--color-rule)] pt-3">
        <SpeakButton
          lang={lang}
          text={spokenSlip(best, cropName, quantityKg, lang)}
          label={t("readAloud", lang)}
          className="w-full justify-center"
        />
      </div>

      {best.advantageOverNearest > 0 && (
        <p className="mt-3 rounded-[3px] bg-[var(--color-keep-soft)] px-3 py-2 text-[14px] leading-snug text-[var(--color-keep)]">
          <span className="tnum font-600">
            {rupees(best.advantageOverNearest)}
          </span>{" "}
          {t("moreThanNearest", lang)}
        </p>
      )}

      {best.exceedsShelfLife && (
        <p className="mt-2 rounded-[3px] border border-[var(--color-lose)] bg-[var(--color-lose-soft)] px-3 py-2 text-[13.5px] leading-snug text-[var(--color-lose)]">
          {prefersHindi(lang)
            ? "चेतावनी: इतनी दूर भेजने पर यह फ़सल अपनी टिकाऊ अवधि पार कर जाएगी। नज़दीकी मंडी पर विचार करें।"
            : "Warning: sent this far, this crop passes its safe window before it arrives. Consider a closer mandi."}
        </p>
      )}

      <p className="tnum mt-3 text-[11.5px] leading-snug text-[var(--color-ink-3)]">
        {prefersHindi(lang) ? "स्रोत" : "Source"}: {best.source} ·{" "}
        {best.priceAgeHours < 1
          ? prefersHindi(lang)
            ? "अभी अपडेट हुआ"
            : "updated just now"
          : `${Math.round(best.priceAgeHours)} h ${prefersHindi(lang) ? "पहले" : "ago"}`}
      </p>
    </Slip>
  );
}

/**
 * Price confidence, stated rather than implied.
 *
 * PRD §8 requires the source and age of every figure to be visible. A farmer deciding
 * to drive 200 km deserves to know the price is four hours old and the day's lots
 * varied widely.
 */
function Confidence({
  lang,
  level,
  age,
}: {
  lang: Lang;
  level: "HIGH" | "MEDIUM" | "LOW";
  age: number;
}) {
  const copy = {
    HIGH: {
      en: "Reliable", hi: "भरोसेमंद", mr: "विश्वासार्ह", bn: "নির্ভরযোগ্য",
      te: "నమ్మదగినది", ta: "நம்பகமானது", gu: "ભરોસાપાત્ર", kn: "ವಿಶ್ವಾಸಾರ್ಹ",
      ml: "വിശ്വസനീയം", pa: "ਭਰੋਸੇਯੋਗ", or: "ବିଶ୍ୱସନୀୟ", as: "নিৰ্ভৰযোগ্য", ur: "قابلِ اعتماد",
    },
    MEDIUM: {
      en: "Fair", hi: "ठीक-ठाक", mr: "ठीक", bn: "মোটামুটি", te: "ఫర్వాలేదు",
      ta: "பரவாயில்லை", gu: "ઠીક", kn: "ಪರವಾಗಿಲ್ಲ", ml: "കുഴപ്പമില്ല", pa: "ਠੀਕ-ਠਾਕ",
      or: "ମୋଟାମୋଟି", as: "মোটামুটি", ur: "ٹھیک ٹھاک",
    },
    LOW: {
      en: "Check locally", hi: "पता करें", mr: "स्थानिक चौकशी करा", bn: "স্থানীয়ভাবে দেখুন",
      te: "స్థానికంగా కనుక్కోండి", ta: "உள்ளூரில் விசாரி", gu: "સ્થાનિક તપાસો",
      kn: "ಸ್ಥಳೀಯವಾಗಿ ಪರಿಶೀಲಿಸಿ", ml: "നാട്ടിൽ അന്വേഷിക്കുക", pa: "ਸਥਾਨਕ ਪਤਾ ਕਰੋ",
      or: "ସ୍ଥାନୀୟ ଭାବେ ଜାଣନ୍ତୁ", as: "স্থানীয়ভাৱে বিচাৰক", ur: "مقامی طور پر معلوم کریں",
    },
  }[level];

  const tone =
    level === "HIGH"
      ? "border-[var(--color-keep)] text-[var(--color-keep)]"
      : level === "MEDIUM"
        ? "border-[var(--color-pool)] text-[var(--color-pool)]"
        : "border-[var(--color-lose)] text-[var(--color-lose)]";

  return (
    <div
      className={`shrink-0 rounded-[3px] border px-2 py-1 text-center ${tone}`}
    >
      <div className="text-[12px] font-600 leading-tight">
        {pick(lang, copy)}
      </div>
      <div className="tnum text-[10.5px] leading-tight opacity-80">
        {Math.round(age)}h
      </div>
    </div>
  );
}

/** PRD §5.4 — crop-specific handling guidance, shown where it is actionable. */
function HandlingAdvice({
  lang,
  crop,
  best,
}: {
  lang: Lang;
  crop: {
    handlingTip: string;
    handlingTipHi: string;
    shelfLifeHours: number;
    perishability: string;
  };
  best: RankedView;
}) {
  return (
    <Slip>
      <SlipHeading
        right={`${crop.shelfLifeHours} h ${prefersHindi(lang) ? "टिकाऊ" : "shelf life"}`}
      >
        {t("handlingTip", lang)}
      </SlipHeading>
      <p className="pt-2 text-[15px] leading-relaxed">
        {prefersHindi(lang) ? crop.handlingTipHi : crop.handlingTip}
      </p>
      <p className="mt-2 text-[13px] text-[var(--color-ink-2)]">
        {prefersHindi(lang)
          ? `${best.mandiNameHi} तक ${best.transitHours} घंटे लगेंगे। इस दौरान लगभग ${best.spoilagePercent}% नुकसान का अनुमान है।`
          : `The run to ${best.mandiName} takes about ${best.transitHours} hours, over which roughly ${best.spoilagePercent}% of the value is expected to be lost.`}
      </p>
    </Slip>
  );
}
