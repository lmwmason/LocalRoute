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
): Candidate[] {
  const center = regionForDestination(input.destination);
  return places
    .filter(
      (p) =>
        p.source !== "demo" &&
        distanceMeters(center, p) < 5000 &&
        p.endorsements.length &&
        !p.possiblyClosed,
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      photo: p.photo,
      kind: p.kind || (p.category === "카페" ? "cafe" : "restaurant"),
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      tags: [...p.tags, ...categoryTags(p.category)],
      source: {
        provider: "localroute",
        observedAt: p.observedAt || new Date().toISOString(),
        verification: "canonical",
      },
      endorsements: p.endorsements
        .filter((e) => e.versionId)
        .map((e) => ({ versionId: e.versionId!, text: e.text })),
    }));
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
