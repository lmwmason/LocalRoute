import { z } from "zod";
import {
  distanceMeters,
  regionForDestination,
  type Candidate,
  type TripInput,
} from "../../shared/planner";
import type { Place } from "../../shared/domain";
import { AppError } from "../errors";
const categoryTags = (category: string) =>
  /한식|국밥|한정식/.test(category)
    ? ["korean"]
    : /일식|초밥|라멘/.test(category)
      ? ["japanese"]
      : /양식|이탈리|파스타/.test(category)
        ? ["western"]
        : /카페|커피/.test(category)
          ? ["coffee", "cafe"]
          : [];
export function localCandidates(
  places: Place[],
  input: TripInput,
  options: { allowStarter?: boolean } = {},
): Candidate[] {
  const center = regionForDestination(input.destination);
  return places
    .filter(
      (p) =>
        p.source !== "demo" &&
        distanceMeters(center, p) < 5000 &&
        (p.endorsements.some((endorsement) => endorsement.versionId) ||
          (options.allowStarter === true &&
            Boolean(p.officialSources?.length))) &&
        !p.possiblyClosed &&
        !p.externalIds?.some((external) => external.possiblyClosed),
    )
    .map((p) => ({
      ...(options.allowStarter === true &&
      p.officialSources?.length &&
      !p.endorsements.some((endorsement) => endorsement.versionId)
        ? { starterRecommendation: true as const }
        : {}),
      officialSources: p.officialSources?.map(({ url, observedAt }) => ({
        url,
        observedAt,
      })),
      id: p.id,
      name: p.name,
      photo: p.photo,
      sourcePhoto: p.sourcePhoto,
      displayMedia: p.displayMedia,
      hours: p.hours,
      hoursProvenance: p.hoursProvenance,
      externalIds: p.externalIds,
      kind: p.kind || (p.category === "카페" ? "cafe" : "restaurant"),
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      tags: [
        ...new Set([
          ...p.tags,
          ...categoryTags(p.category),
          ...(/공원|정원|산책|자연|동굴/.test(p.category) ? ["nature"] : []),
          ...(/박물관|유적|사적|문화재|역사/.test(p.category)
            ? ["history"]
            : []),
          ...(/미술|갤러리|전시/.test(p.category) ? ["art"] : []),
        ]),
      ],
      source: {
        provider: "localroute",
        observedAt: p.observedAt || new Date().toISOString(),
        verification: "canonical",
        url: p.officialSources?.[0]?.url,
      },
      endorsements: p.endorsements
        .filter((e) => e.versionId)
        .map((e) => ({ versionId: e.versionId!, text: e.text })),
    }));
}
// Only a persisted provider-to-canonical mapping establishes shared identity.
// Nearby coordinates or similar names never cause an automatic merge.
export function deduplicateCandidates(
  candidates: Candidate[],
  places: Place[],
): Candidate[] {
  const byExternal = new Map<string, Set<string>>(),
    blocked = new Set<string>();
  for (const place of places)
    for (const external of place.externalIds || []) {
      const key = `${external.provider}:${external.externalId}`;
      const ids = byExternal.get(key) || new Set<string>();
      ids.add(place.id);
      byExternal.set(key, ids);
      if (place.possiblyClosed || external.possiblyClosed) blocked.add(key);
    }
  const canonical = new Set(
    candidates
      .filter((candidate) => candidate.source.provider === "localroute")
      .map((candidate) => candidate.id),
  );
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    if (candidate.source.provider !== "kakao" || !candidate.source.externalId)
      return true;
    const key = `kakao:${candidate.source.externalId}`;
    if (blocked.has(key)) return false;
    const ids = byExternal.get(key);
    return !(ids?.size === 1 && canonical.has([...ids][0]));
  });
}
const kakaoSchema = z.object({
  documents: z.array(
    z.object({
      id: z.string(),
      place_name: z.string(),
      address_name: z.string(),
      road_address_name: z.string().optional(),
      x: z.string(),
      y: z.string(),
      place_url: z.url(),
      category_name: z.string(),
    }),
  ),
});
export class KakaoActivities {
  private requests = 0;
  private reset = 0;
  constructor(
    private key: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  async search(input: TripInput): Promise<Candidate[]> {
    if (Date.now() >= this.reset) {
      this.reset = Date.now() + 3600000;
      this.requests = 0;
    }
    if ((this.requests += 2) > 30)
      throw new AppError(429, "ACTIVITY_SEARCH_LIMIT", "60");
    const center = regionForDestination(input.destination);
    const lists = await Promise.all(
      ["AT4", "CT1"].map(async (code) => {
        const url = new URL(
          "https://dapi.kakao.com/v2/local/search/category.json",
        );
        url.search = new URLSearchParams({
          category_group_code: code,
          x: String(center.lng),
          y: String(center.lat),
          radius: "3000",
          sort: "distance",
          size: "15",
        }).toString();
        let response: Response;
        try {
          response = await this.fetcher(url, {
            headers: { Authorization: `KakaoAK ${this.key}` },
            signal: AbortSignal.timeout(6000),
          });
        } catch {
          throw new AppError(504, "ACTIVITY_SEARCH_TIMEOUT");
        }
        if (!response.ok)
          throw new AppError(
            response.status === 429 ? 429 : 503,
            "ACTIVITY_SEARCH_UNAVAILABLE",
          );
        const parsed = kakaoSchema.safeParse(await response.json());
        if (!parsed.success)
          throw new AppError(502, "ACTIVITY_RESPONSE_INVALID");
        return parsed.data.documents
          .map((p): Candidate => ({
            id: `kakao:${p.id}`,
            name: p.place_name,
            kind: code === "CT1" ? "culture" : "attraction",
            address: p.road_address_name || p.address_name,
            lat: Number(p.y),
            lng: Number(p.x),
            tags: [
              ...(/미술|갤러리|전시/.test(p.category_name) ? ["art"] : []),
              ...(/박물관|유적|문화/.test(p.category_name) ? ["history"] : []),
              ...(/공원|숲|산책/.test(p.category_name) ? ["nature"] : []),
            ],
            source: {
              provider: "kakao",
              externalId: p.id,
              url: p.place_url.startsWith("https://place.map.kakao.com/")
                ? p.place_url
                : undefined,
              observedAt: new Date().toISOString(),
              verification: "provider",
            },
            endorsements: [],
          }))
          .filter(
            (p) =>
              Number.isFinite(p.lat) &&
              Number.isFinite(p.lng) &&
              Math.abs(p.lat) <= 90 &&
              Math.abs(p.lng) <= 180,
          );
      }),
    );
    return [...new Map(lists.flat().map((p) => [p.id, p])).values()];
  }
}
