import { z } from "zod";
import { AppError } from "./errors";
import type { Place } from "../shared/domain";

const venueSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  categoryLabel: z.string().optional(),
  category: z.string().optional(),
  address: z.object({
    road: z.string().nullable().optional(),
    jibun: z.string().nullable().optional(),
  }),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  confidence: z.number().nullable().optional(),
  possiblyClosed: z.boolean().optional(),
  lastSeenAt: z.string().nullable().optional(),
});
const responseSchema = z.object({
  success: z.literal(true),
  data: z.array(venueSchema),
});
export type ProviderVenue = z.infer<typeof venueSchema>;
export class HeyYumi {
  private requests = 0;
  private resetAt = 0;
  private blockedUntil = 0;
  private pending = new Map<string, Promise<ProviderVenue[]>>();
  constructor(
    private key: string,
    private budget: number,
    private fetcher: typeof fetch = fetch,
    private now = () => Date.now(),
  ) {}
  search(keyword: string): Promise<ProviderVenue[]> {
    const query = keyword.trim().normalize("NFC");
    if (query.length < 2 || query.length > 100)
      throw new AppError(400, "검색어는 2~100자로 입력해 주세요.");
    const existing = this.pending.get(query);
    if (existing) return existing;
    const result = this.run(query).finally(() => this.pending.delete(query));
    this.pending.set(query, result);
    return result;
  }
  private async run(query: string) {
    const now = this.now();
    if (now < this.blockedUntil)
      throw new AppError(
        429,
        "장소 검색이 잠시 제한되었어요.",
        String(Math.ceil((this.blockedUntil - now) / 1000)),
      );
    if (now >= this.resetAt) {
      this.requests = 0;
      this.resetAt = now + 3600000;
    }
    if (++this.requests > this.budget)
      throw new AppError(
        429,
        "시간당 장소 검색 한도에 도달했어요.",
        String(Math.ceil((this.resetAt - now) / 1000)),
      );
    const url = new URL("https://api.heyyumi.ai/api/v1/places");
    url.search = new URLSearchParams({
      keyword: query,
      fields: "core",
      page_size: "10",
    }).toString();
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { Authorization: `Bearer ${this.key}` },
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      throw new AppError(
        504,
        "장소 검색 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.",
      );
    }
    if (response.status === 401)
      throw new AppError(503, "장소 검색 인증 설정을 확인하고 있어요.");
    if (response.status === 404) return [];
    if (response.status === 429) {
      const retry = response.headers.get("Retry-After") || "60";
      const seconds = /^\d+$/.test(retry)
        ? Number(retry)
        : Math.max(1, (Date.parse(retry) - now) / 1000);
      this.blockedUntil =
        now + (Number.isFinite(seconds) ? Math.max(1, seconds) : 60) * 1000;
      throw new AppError(
        429,
        "장소 검색 요청이 많아요. 잠시 후 다시 시도해 주세요.",
        retry,
      );
    }
    if (!response.ok)
      throw new AppError(502, "장소 검색 서비스에 연결하지 못했어요.");
    const parsed = responseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success)
      throw new AppError(502, "장소 검색 응답을 확인하지 못했어요.");
    // No provider response persistence/cache: account-specific cache rights are not verified.
    return parsed.data.data;
  }
}
export function providerPlace(v: ProviderVenue): Place {
  return {
    id: `heyyumi:${v.id}`,
    name: v.name,
    category: v.categoryLabel || v.category || "식당",
    address: v.address.road || v.address.jibun || "주소 확인 필요",
    lat: v.location.lat,
    lng: v.location.lng,
    tags: [],
    endorsements: [],
    source: "heyyumi",
    rating: null,
    reviewCount: 0,
    confidence: v.confidence,
    observedAt: v.lastSeenAt,
    possiblyClosed: v.possiblyClosed,
  };
}
