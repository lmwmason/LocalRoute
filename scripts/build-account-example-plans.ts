import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { Place } from "../shared/domain";
import { destinationSchema, type Destination } from "../shared/destinations";
import { euljiroExample } from "../shared/euljiro-example";
import { evaluateSchedule, tripSchema, type Itinerary, type Schedule } from "../shared/planner";
import { localCandidates } from "../server/planner/catalog";

export const accountExampleDates = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"] as const;
const ids = [
  "c6b7e320-651a-4bc1-8f08-4ad7ef2b1020",
  "c6b7e321-651a-4bc1-8f08-4ad7ef2b1021",
  "c6b7e322-651a-4bc1-8f08-4ad7ef2b1022",
  "c6b7e323-651a-4bc1-8f08-4ad7ef2b1023",
];
export function buildAccountExamplePlans(
  places: Place[],
  destination: Destination,
  createdAt = new Date().toISOString(),
): Itinerary[] {
  const selected = euljiroExample.stops.map(stop => {
    const place = places.find(place => place.id === stop.canonicalPlaceId);
    if (!place || place.source === "demo" || !place.officialSources?.length || !(place.photo || place.sourcePhoto || place.displayMedia))
      throw new Error(`Published canonical place/media missing: ${stop.canonicalPlaceId}`);
    return place;
  });
  if (!selected[1].externalIds?.some(id => id.provider === "heyyumi" && id.externalId === "1185547279" && !id.possiblyClosed))
    throw new Error("Verified Hide Me Please provider identity missing");
  return accountExampleDates.map((date, index) => {
    const input = tripSchema.parse({
      destination: destinationSchema.parse(destination),
      startDate: date, endDate: date, startTime: "11:30", endTime: "15:30",
      purpose: "explore", activities: ["coffee", "history"], foodTypes: ["korean"],
      budget: "moderate", companions: "friends", mobility: "walking", pace: "balanced",
      dietary: "", allowUnverifiedDietary: false, transferBufferMinutes: 15, language: "ko",
    });
    const catalog = localCandidates(selected, input, { allowStarter: true });
    if (catalog.length !== 3) throw new Error("Canonical candidate verification failed");
    const schedule: Schedule = {
      title: `을지로 예약 시연 · 10월 ${20 + index}일`,
      summary: "운영자 초기 추천을 이용한 0 LP 예약 시연 일정입니다. 독립 현지인 후기와 해당 날짜 영업·예약 가능 시간은 미확인이며 예약이 확정된 일정이 아닙니다. 이동 간격은 여유 시간이고 실제 이동 소요시간은 조회하지 않았습니다.",
      days: [{date, stops: euljiroExample.stops.map(stop => ({
        candidateId: stop.canonicalPlaceId, start: stop.start, end: stop.end, purpose: stop.purpose,
        explanation: "공개 장소 사실에 근거한 운영자 초기 추천입니다. 독립 현지인 추천·방문 확인은 없고 날짜별 영업·예약 가능 시간은 미확인입니다. 예약은 별도 확인·동의·제출 후 업체 확정을 기다려야 합니다.",
      }))}],
    };
    const evaluation = evaluateSchedule(schedule, input, catalog);
    if (!evaluation.valid) throw new Error(`Invalid operator example: ${evaluation.errors.map(error => error.code).join(",")}`);
    return { id: ids[index], revision: 1, input, schedule, catalog, evaluation, createdAt,
      model: "operator-curated-v1", provenance: "operator_example", cost: 0 };
  });
}

async function main() {
  // Public GETs only. No credentials, user identities, writes, AI or LP operations.
  const origin = "https://localroute.vercel.app";
  const responses = await Promise.all([
    fetch(`${origin}/api/places`, { signal: AbortSignal.timeout(15000) }),
    fetch(`${origin}/api/destinations?q=${encodeURIComponent("서울종로구")}`, { signal: AbortSignal.timeout(15000) }),
  ]);
  if (responses.some(response => !response.ok)) throw new Error("Public catalog lookup failed");
  const places = await responses[0].json() as { places: Place[] };
  const results = await responses[1].json() as { destinations: unknown[] };
  const destination = results.destinations.map(value => destinationSchema.parse(value)).find(value => value.region2 === "종로구");
  if (!destination) throw new Error("Verified Jongno destination unavailable");
  const plans = buildAccountExamplePlans(places.places, destination);
  const path = "/tmp/localroute-account-example-plans.json";
  await writeFile(path, JSON.stringify(plans, null, 2));
  console.log(JSON.stringify({ path, count: plans.length, ids: plans.map(plan => plan.id), valid: plans.every(plan => plan.evaluation.valid) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => { console.error("Operator example preparation failed; no account or database was modified."); process.exitCode = 1; });
