import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { crops } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { recommend, soloRateFor } from "@/lib/booking";
import { findJoinablePools } from "@/lib/pools";
import {
  projectNewPool,
  projectPool,
  pickVehicle,
} from "@/lib/engine/grouping";
import { soloCost } from "@/lib/engine/costs";
import { Page } from "@/components/Shell";
import { SellForm } from "@/components/SellForm";
import { Recommendations } from "@/components/Recommendations";

export const dynamic = "force-dynamic";

/**
 * The core screen: what has been harvested, and where should it go?
 *
 * Query parameters carry the answer rather than component state, so a farmer can send
 * the link to a neighbour or a field agent and they see the same numbers — which is
 * how these decisions actually get made in a village.
 */
export default async function SellPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");

  const sp = await searchParams;
  const db = await getDb();
  // Ordered by prominence so the common, high-volume crops are the ones visible
  // without expanding; the long tail sits behind "more crops".
  const cropList = await db
    .select()
    .from(crops)
    .orderBy(crops.sortOrder, crops.name);
  const unread = await unreadCount(user.id);
  const lang = user.language;

  const cropId = sp.crop;
  const quantityKg = Number(sp.qty ?? 0);
  const grade = (sp.grade as "A" | "B" | "C") ?? "B";
  const hoursAgo = Number(sp.since ?? 6);
  const radiusKm = Number(sp.radius ?? 250);

  const hasQuery =
    cropId && Number.isFinite(quantityKg) && quantityKg > 0;

  let result: Awaited<ReturnType<typeof recommend>> | null = null;
  let groups: Awaited<ReturnType<typeof findJoinablePools>> = [];
  if (hasQuery) {
    const [crop] = await db
      .select({ id: crops.id })
      .from(crops)
      .where(eq(crops.id, cropId))
      .limit(1);

    if (crop) {
      result = await recommend({
        cropId,
        quantityKg,
        grade,
        harvestedAt: new Date(Date.now() - hoursAgo * 3_600_000),
        origin: { lat: user.lat ?? 20.0806, lng: user.lng ?? 74.1103 },
        radiusKm,
      });

      // Groups of farmers already gathering, so the recommendation can offer a
      // shared truck even when no operator has opened a run to that mandi.
      groups = await findJoinablePools({
        lat: user.lat ?? 20.0806,
        lng: user.lng ?? 74.1103,
      });
    }
  }

  /**
   * The shared-truck offer for one mandi: an existing group if there is one, else a
   * projection of what starting a group would cost.
   */
  function sharedOffer(mandiId: string, distanceKm: number) {
    const group = groups.find((g) => g.mandiId === mandiId);

    // With a real group, quote its real size. Reusing the hypothetical projection
    // would show a better price than the farmer would actually be charged — the same
    // mistake as quoting a full truck, just harder to spot.
    const projection = group
      ? projectPool(
          quantityKg,
          group.committedKg + quantityKg,
          distanceKm,
          pickVehicle(
            Math.max(group.committedKg + quantityKg, group.targetCapacityKg),
          ),
        )
      : projectNewPool(quantityKg, distanceKm);

    return {
      poolId: group?.id,
      memberCount: group?.memberCount ?? 0,
      committedKg: group?.committedKg ?? 0,
      cost: projection.shareNow,
      costIfFull: projection.shareIfFull,
      soloCost: projection.soloCost,
      savedPercent: projection.savedPercentNow,
      vehicle: projection.vehicle.type,
      // For a real group this is the weight it already has; for a projected one, the
      // weight the quote assumes it will reach.
      targetKg: group
        ? projection.committedKg
        : (projection as ReturnType<typeof projectNewPool>).targetKg,
    };
  }

  return (
    <Page user={user} lang={lang} active="sell" unread={unread}>
      <SellForm
        crops={cropList.map((c) => ({
          id: c.id,
          name: c.name,
          nameHi: c.nameHi,
          category: c.category,
          perishability: c.perishability,
          isCustom: c.isCustom,
        }))}
        lang={lang}
        initial={{ cropId, quantityKg, grade, hoursAgo, radiusKm }}
        hasResult={Boolean(result)}
      />

      {result && (
        <Recommendations
          lang={lang}
          crop={{
            name: result.crop.name,
            nameHi: result.crop.nameHi,
            handlingTip: result.crop.handlingTip,
            handlingTipHi: result.crop.handlingTipHi,
            shelfLifeHours: result.crop.shelfLifeHours,
            perishability: result.crop.perishability,
          }}
          quantityKg={quantityKg}
          ranked={result.ranked.map((r) => ({
            mandiId: r.mandi.id,
            mandiName: r.mandi.name,
            mandiNameHi: r.mandi.nameHi,
            district: r.mandi.district,
            modalPrice: r.mandi.modalPrice,
            source: r.mandi.source,
            priceAgeHours: r.priceAgeHours,
            distanceKm: r.distanceKm,
            transitHours: r.transitHours,
            quintals: r.quintals,
            grossValue: r.grossValue,
            commission: r.commission,
            marketFee: r.marketFee,
            transportCost: r.transportCost,
            pooled: r.pooled,
            pooledTripId: r.pooledTripId,
            spoilageLoss: r.spoilageLoss,
            spoilagePercent: r.spoilagePercent,
            exceedsShelfLife: r.exceedsShelfLife,
            netValue: r.netValue,
            netPerQuintal: r.netPerQuintal,
            advantageOverNearest: r.advantageOverNearest,
            confidence: r.confidence,
            // What hiring the whole truck alone would have cost, so the saving from
            // sharing is a comparison the farmer can check rather than a claim.
            soloTransport: soloCost(r.distanceKm, soloRateFor(quantityKg)),
            // What a shared truck to this mandi would cost — whether or not one is
            // running yet. Without this a smallholder is only ever quoted a whole
            // vehicle, which is the problem the product exists to solve.
            shared: sharedOffer(r.mandi.id, r.distanceKm),
          }))}
          departAt={new Date(Date.now() + 20 * 3_600_000).toISOString()}
          origin={{
            name: user.village ?? "Farm",
            lat: user.lat ?? 20.0806,
            lng: user.lng ?? 74.1103,
          }}
          cropId={cropId!}
          grade={grade}
        />
      )}
    </Page>
  );
}
