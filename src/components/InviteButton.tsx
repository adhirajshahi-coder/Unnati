"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n";

/**
 * Invite a neighbour into your group.
 *
 * Sends them a notification with a link, not a phone number. They decide whether to
 * join; nobody is added to a booking by someone else, and no contact detail changes
 * hands until the two of them are actually on the same truck.
 */
export function InviteButton({
  farmerId,
  farmerName,
  poolId,
  mandiName,
  lang,
}: {
  farmerId: string;
  farmerName: string;
  poolId: string;
  mandiName: string;
  lang: Lang;
}) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");

  async function invite() {
    setState("busy");

    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ farmerId, poolId }),
    });

    setState(res.ok ? "sent" : "error");
  }

  if (state === "sent") {
    return (
      <p className="mt-2 rounded-[3px] bg-[var(--color-keep-soft)] px-3 py-2 text-[13.5px] text-[var(--color-keep)]">
        {lang === "hi"
          ? `${farmerName} को न्योता भेज दिया। वे चाहें तो समूह में जुड़ सकते हैं।`
          : `Invitation sent to ${farmerName}. They can join if it suits them.`}
      </p>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={invite}
        disabled={state === "busy"}
        className="w-full rounded-[3px] border-2 border-[var(--color-pool)] px-3 py-2 text-[14px] font-600 text-[var(--color-pool)] disabled:opacity-60"
      >
        {state === "busy"
          ? "…"
          : lang === "hi"
            ? `${mandiName} वाले समूह में बुलाएँ`
            : `Invite to the ${mandiName} group`}
      </button>

      {state === "error" && (
        <p role="alert" className="mt-1 text-[13px] text-[var(--color-lose)]">
          {lang === "hi"
            ? "न्योता नहीं भेजा जा सका।"
            : "Could not send that invitation."}
        </p>
      )}
    </div>
  );
}
