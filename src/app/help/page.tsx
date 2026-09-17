import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { llmConfigured } from "@/lib/assistant";
import { Page } from "@/components/Shell";
import { SlipHeading } from "@/components/Slip";
import { Assistant } from "@/components/Assistant";
import { prefersHindi } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const user = await currentUser();
  if (!user) redirect("/");

  const lang = user.language;
  const unread = await unreadCount(user.id);

  // Openers differ by role: an operator has no crop to sell and no mandi to choose.
  const starters =
    user.role === "OPERATOR"
      ? prefersHindi(lang)
        ? [
            "आस-पास कौन से किसान हैं?",
            "ट्रक का इंतज़ार करते समूह",
            "यह ऐप कैसे काम करता है?",
          ]
        : [
            "Which farmers are near me?",
            "Groups waiting for a truck",
            "How does this app work?",
          ]
      : prefersHindi(lang)
        ? [
            "प्याज़ कहाँ बेचूँ?",
            "टमाटर का आज का भाव",
            "ट्रक कैसे साझा करूँ?",
            "मेरा कितना बाकी है?",
          ]
        : [
            "Where should I sell onion?",
            "Tomato price today",
            "How do I share a truck?",
            "How much do I owe?",
          ];

  return (
    <Page user={user} lang={lang} active="help" unread={unread}>
      <div className="flex min-h-[70vh] flex-col">
        <SlipHeading
          right={
            llmConfigured()
              ? prefersHindi(lang)
                ? "एआई सहायक"
                : "AI assistant"
              : undefined
          }
        >
          {prefersHindi(lang) ? "तुरंत मदद" : "Instant help"}
        </SlipHeading>

        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <Assistant lang={lang} starters={starters} />
        </div>
      </div>
    </Page>
  );
}
