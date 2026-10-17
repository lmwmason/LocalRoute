import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ContributorOutcome,
  ContributorOutcomesResult,
} from "../../shared/contributor-outcomes";
import { AppError } from "../errors";

type Endorsement = { id: string; user_id: string; place_id: string };
type Version = {
  id: string;
  endorsement_id: string;
  version: number;
  text: string;
  status: NonNullable<ContributorOutcome["status"]>;
};
type Rating = {
  id: string;
  endorsement_version_id: string;
  helpfulness: number;
};
type Request = {
  id: string;
  curator_id: string;
  endorsement_version_id: string;
  state: string;
};
type Grant = {
  id: string;
  request_id: string;
  curator_id: string;
  endorsement_version_id: string;
  amount: number;
  ledger_id: string | null;
};
type Ledger = {
  id: string;
  user_id: string;
  bucket: string;
  amount: number;
  event_key: string;
};
type Page = PromiseLike<{ data: unknown; error: unknown }>;

// Stable, explicit pagination avoids silently treating the PostgREST row limit as a total.
// Excessively large histories fail visibly rather than returning incomplete financial totals.
async function all<T>(page: (from: number, to: number) => Page): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 10000; from += 100) {
    const { data, error } = await page(from, from + 99);
    if (error || !Array.isArray(data))
      throw new AppError(503, "visit.unavailable");
    rows.push(...(data as T[]));
    if (data.length < 100) return rows;
  }
  throw new AppError(503, "visit.unavailable");
}

async function byIds<T>(
  ids: string[],
  page: (ids: string[], from: number, to: number) => Page,
): Promise<T[]> {
  const result: T[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    result.push(...(await all<T>((from, to) => page(batch, from, to))));
  }
  return result;
}

/** Service-role reads: all paths start with actor-owned endorsements, never client IDs.
 * Only aggregates leave this module; visitor identities/evidence/decisions are not selected.
 * No RPC, writes, payout policy lookup or payout calculation is performed.
 */
export async function readContributorOutcomes(
  client: SupabaseClient,
  actor: string,
): Promise<ContributorOutcomesResult> {
  const endorsements = (
    await all<Endorsement>((from, to) =>
      client
        .from("endorsements")
        .select("id,user_id,place_id")
        .eq("user_id", actor)
        .order("id")
        .range(from, to),
    )
  ).filter((row) => row.user_id === actor);
  if (!endorsements.length) return { items: [] };
  const owned = new Map(endorsements.map((row) => [row.id, row]));
  const versions = (
    await byIds<Version>([...owned.keys()], (ids, from, to) =>
      client
        .from("endorsement_versions")
        .select("id,endorsement_id,version,text,status")
        .in("endorsement_id", ids)
        .order("id")
        .range(from, to),
    )
  ).filter((row) => owned.has(row.endorsement_id));
  const versionIds = versions.map((row) => row.id);
  const [places, ratings, requests, grants] = await Promise.all([
    byIds<{ id: string; name: string }>(
      endorsements.map((row) => row.place_id),
      (ids, from, to) =>
        client
          .from("places")
          .select("id,name")
          .in("id", ids)
          .order("id")
          .range(from, to),
    ),
    byIds<Rating>(versionIds, (ids, from, to) =>
      client
        .from("endorsement_ratings")
        .select("id,endorsement_version_id,helpfulness")
        .in("endorsement_version_id", ids)
        .order("id")
        .range(from, to),
    ),
    byIds<Request>(versionIds, (ids, from, to) =>
      client
        .from("visit_reward_requests")
        .select("id,curator_id,endorsement_version_id,state")
        .eq("curator_id", actor)
        .in("endorsement_version_id", ids)
        .order("id")
        .range(from, to),
    ),
    byIds<Grant>(versionIds, (ids, from, to) =>
      client
        .from("visit_reward_grants")
        .select(
          "id,request_id,curator_id,endorsement_version_id,amount,ledger_id",
        )
        .eq("curator_id", actor)
        .in("endorsement_version_id", ids)
        .order("id")
        .range(from, to),
    ),
  ]);
  const ledger = await byIds<Ledger>(
    grants
      .filter((g) => g.curator_id === actor && g.ledger_id)
      .map((g) => g.ledger_id!),
    (ids, from, to) =>
      client
        .from("lp_ledger")
        .select("id,user_id,bucket,amount,event_key")
        .eq("user_id", actor)
        .in("id", ids)
        .order("id")
        .range(from, to),
  );
  const ledgerById = new Map(
    ledger.filter((l) => l.user_id === actor).map((l) => [l.id, l]),
  );
  const names = new Map(places.map((p) => [p.id, p.name]));
  const items: ContributorOutcome[] = [];
  for (const endorsement of endorsements) {
    const rows = versions.filter((v) => v.endorsement_id === endorsement.id);
    for (const version of rows.length ? rows : [null]) {
      const evaluations = version
        ? ratings.filter((r) => r.endorsement_version_id === version.id)
        : [];
      const reviewRequests = version
        ? requests.filter(
            (r) =>
              r.curator_id === actor && r.endorsement_version_id === version.id,
          )
        : [];
      const payments = version
        ? grants.filter(
            (g) =>
              g.curator_id === actor && g.endorsement_version_id === version.id,
          )
        : [];
      const paid = payments.filter((g) => {
        const entry = ledgerById.get(g.ledger_id || "");
        return (
          entry &&
          entry.bucket === "earned" &&
          entry.amount > 0 &&
          entry.amount === g.amount &&
          entry.event_key === `visit-reward:${g.request_id}`
        );
      });
      items.push({
        endorsementId: endorsement.id,
        versionId: version?.id ?? null,
        versionNumber: version?.version ?? null,
        text: version?.text ?? null,
        status: version?.status ?? null,
        placeName: names.get(endorsement.place_id) ?? null,
        ratingCount: evaluations.length,
        helpfulnessAverage: evaluations.length
          ? evaluations.reduce((sum, r) => sum + r.helpfulness, 0) /
            evaluations.length
          : null,
        paidLp: paid.reduce((sum, g) => sum + g.amount, 0),
        pendingReviewCount: reviewRequests.filter((r) => r.state === "pending")
          .length,
        awaitingPayoutCount: reviewRequests.filter(
          (r) =>
            r.state === "approved" &&
            !payments.some((g) => g.request_id === r.id),
        ).length,
      });
    }
  }
  return {
    items: items.sort(
      (a, b) =>
        a.endorsementId.localeCompare(b.endorsementId) ||
        (b.versionNumber ?? 0) - (a.versionNumber ?? 0),
    ),
  };
}
