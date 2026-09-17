import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { whatsappMessages } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { whatsappConfigured } from "@/lib/whatsapp";
import { Page } from "@/components/Shell";
import { SlipHeading } from "@/components/Slip";
import { WhatsappOptIn } from "@/components/WhatsappOptIn";
import { LocationPicker } from "@/components/LocationPicker";
import { DEFAULT_LOCATIONS } from "@/data/mandis";
import { LanguageList } from "@/components/LanguagePicker";
import { prefersHindi, pick, t, type Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Settings: how this person is reached, and where they are.
 *
 * Both roles get the same page. A truck operator needs a payment reminder and a "your
 * group is ready" alert on WhatsApp every bit as much as a farmer does — arguably more,
 * since they are out on the road rather than near a handset charger.
 */
export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/");

  const db = await getDb();
  const lang = user.language;
  const unread = await unreadCount(user.id);

  // Their own last few messages, so the setting is verifiable rather than a promise.
  const recent = await db
    .select({
      id: whatsappMessages.id,
      direction: whatsappMessages.direction,
      body: whatsappMessages.body,
      status: whatsappMessages.status,
      createdAt: whatsappMessages.createdAt,
    })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.userId, user.id))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(6);

  const STATUS: Record<string, Partial<Record<Lang, string>> & { en: string }> = {
    QUEUED: {
      en: "queued", hi: "कतार में", mr: "रांगेत", bn: "সারিতে", te: "వరుసలో",
      ta: "வரிசையில்", gu: "કતારમાં", kn: "ಸರತಿಯಲ್ಲಿ", ml: "ക്യൂവിൽ",
      pa: "ਕਤਾਰ ਵਿੱਚ", or: "ଧାଡ଼ିରେ", as: "শাৰীত", ur: "قطار میں",
    },
    SENT: {
      en: "sent", hi: "भेजा गया", mr: "पाठवले", bn: "পাঠানো হয়েছে", te: "పంపబడింది",
      ta: "அனுப்பப்பட்டது", gu: "મોકલ્યું", kn: "ಕಳುಹಿಸಲಾಗಿದೆ", ml: "അയച്ചു",
      pa: "ਭੇਜਿਆ ਗਿਆ", or: "ପଠାଯାଇଛି", as: "পঠোৱা হ'ল", ur: "بھیجا گیا",
    },
    DELIVERED: {
      en: "delivered", hi: "पहुँचा", mr: "पोहोचले", bn: "পৌঁছেছে", te: "చేరింది",
      ta: "சேர்ந்தது", gu: "પહોંચ્યું", kn: "ತಲುಪಿದೆ", ml: "എത്തി", pa: "ਪਹੁੰਚ ਗਿਆ",
      or: "ପହଞ୍ଚିଛି", as: "পাইছেহি", ur: "پہنچ گیا",
    },
    READ: {
      en: "read", hi: "पढ़ा गया", mr: "वाचले", bn: "পড়া হয়েছে", te: "చదివారు",
      ta: "படிக்கப்பட்டது", gu: "વાંચ્યું", kn: "ಓದಲಾಗಿದೆ", ml: "വായിച്ചു",
      pa: "ਪੜ੍ਹਿਆ ਗਿਆ", or: "ପଢ଼ାଯାଇଛି", as: "পঢ়া হ'ল", ur: "پڑھا گیا",
    },
    FAILED: {
      en: "failed", hi: "नहीं गया", mr: "गेले नाही", bn: "যায়নি", te: "వెళ్ళలేదు",
      ta: "செல்லவில்லை", gu: "ગયું નહીં", kn: "ಹೋಗಲಿಲ್ಲ", ml: "പോയില്ല",
      pa: "ਨਹੀਂ ਗਿਆ", or: "ଯାଇନାହିଁ", as: "যোৱা নাই", ur: "نہیں گیا",
    },
    SKIPPED: {
      en: "not sent", hi: "नहीं भेजा", mr: "पाठवले नाही", bn: "পাঠানো হয়নি",
      te: "పంపలేదు", ta: "அனுப்பப்படவில்லை", gu: "મોકલ્યું નથી", kn: "ಕಳುಹಿಸಿಲ್ಲ",
      ml: "അയച്ചില്ല", pa: "ਨਹੀਂ ਭੇਜਿਆ", or: "ପଠାଯାଇନାହିଁ", as: "পঠোৱা হোৱা নাই",
      ur: "نہیں بھیجا",
    },
  };

  const youSent: Partial<Record<Lang, string>> & { en: string } = {
    en: "you sent", hi: "आपने भेजा", mr: "तुम्ही पाठवले", bn: "আপনি পাঠিয়েছেন",
    te: "మీరు పంపారు", ta: "நீங்கள் அனுப்பினீர்கள்", gu: "તમે મોકલ્યું",
    kn: "ನೀವು ಕಳುಹಿಸಿದ್ದೀರಿ", ml: "നിങ്ങൾ അയച്ചു", pa: "ਤੁਸੀਂ ਭੇਜਿਆ",
    or: "ଆପଣ ପଠାଇଛନ୍ତି", as: "আপুনি পঠিয়ালে", ur: "آپ نے بھیجا",
  };

  return (
    <Page user={user} lang={lang} active="settings" unread={unread}>
      <WhatsappOptIn
        lang={lang}
        optedIn={user.whatsappOptIn}
        phone={user.phone}
        whatsappNumber={user.whatsappNumber}
        configured={whatsappConfigured()}
      />

      {/*
        The full list lives here as well as behind the masthead button. Someone setting
        this phone up for a farmer who reads only Odia will go looking in settings, and
        a thirteen-row list is easier to hand across than a popover.
      */}
      <section className="mb-5">
        <SlipHeading>{t("language", lang)}</SlipHeading>
        <div className="border-2 border-[var(--color-ink)] bg-[var(--color-paper-2)]">
          <LanguageList lang={lang} />
        </div>
      </section>

      <LocationPicker
        lang={lang}
        current={{
          village: user.village,
          district: user.district,
          state: user.state,
        }}
        options={DEFAULT_LOCATIONS}
      />

      {recent.length > 0 && (
        <section className="mb-5">
          <SlipHeading>
            {prefersHindi(lang) ? "पिछले संदेश" : "Recent messages"}
          </SlipHeading>
          <ul className="mt-1">
            {recent.map((m) => (
              <li
                key={m.id}
                className="border-b border-dotted border-[var(--color-rule)] py-2"
              >
                <p className="text-[13.5px] leading-snug">{m.body}</p>
                <p className="tnum mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
                  {m.direction === "INBOUND"
                    ? pick(lang, youSent)
                    : STATUS[m.status]
                      ? pick(lang, STATUS[m.status])
                      : m.status}{" "}
                  ·{" "}
                  {new Date(m.createdAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center">
        <Link
          href="/help"
          className="text-[14px] underline decoration-dotted underline-offset-2 text-[var(--color-keep)]"
        >
          {t("instantHelp", lang)}
        </Link>
      </p>
    </Page>
  );
}
