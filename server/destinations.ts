import type { Express } from "express";
import { z } from "zod";
import {
  destinationId,
  destinationPageSchema,
  destinationQuerySchema,
  destinationSchema,
  kakaoAddressEndpoint,
  type Destination,
  type DestinationSearchResponse,
} from "../shared/destinations";
import { AppError } from "./errors";

export function readDestinationConfig(env: NodeJS.ProcessEnv) {
  return {
    enabled:
      env.FEATURE_KAKAO_DESTINATIONS === "true" &&
      env.KAKAO_TERMS_VERIFIED === "true",
    key: env.KAKAO_REST_API_KEY?.trim() || "",
  };
}
const responseSchema = z.object({
  meta: z.object({ is_end: z.boolean() }),
  documents: z.array(z.unknown()).max(30),
});
const documentSchema = z.object({
  address_type: z.literal("REGION"),
  address_name: z.string(),
  x: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/),
  y: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/),
  address: z.object({
    region_1depth_name: z.string().trim().min(1),
    region_2depth_name: z.string().trim(),
    region_3depth_name: z.string().trim(),
    main_address_no: z.string().optional(),
    sub_address_no: z.string().optional(),
  }),
});
const provinces = new Set([
  "서울",
  "서울특별시",
  "부산",
  "부산광역시",
  "대구",
  "대구광역시",
  "인천",
  "인천광역시",
  "광주",
  "광주광역시",
  "대전",
  "대전광역시",
  "울산",
  "울산광역시",
  "세종",
  "세종특별자치시",
  "경기",
  "경기도",
  "강원",
  "강원도",
  "강원특별자치도",
  "충북",
  "충청북도",
  "충남",
  "충청남도",
  "전북",
  "전라북도",
  "전북특별자치도",
  "전남",
  "전라남도",
  "경북",
  "경상북도",
  "경남",
  "경상남도",
  "제주",
  "제주도",
  "제주특별자치도",
]);
function normalizeDocument(
  document: unknown,
  observedAt: string,
): Destination | null {
  const parsed = documentSchema.safeParse(document);
  if (!parsed.success) return null;
  const d = parsed.data,
    a = d.address;
  const region1 = a.region_1depth_name,
    region2 = a.region_2depth_name,
    region3 = a.region_3depth_name;
  if (
    !provinces.has(region1) ||
    a.main_address_no ||
    a.sub_address_no ||
    (region2 && !/^[가-힣]+[시군구]( [가-힣]+구)?$/.test(region2))
  )
    return null;
  const label = [region1, region2, region3].filter(Boolean).join(" ");
  if (d.address_name.trim().replace(/\s+/g, " ") !== label) return null;
  const leaf = region3 || region2 || region1;
  const level = region3
    ? leaf.endsWith("읍")
      ? "town"
      : leaf.endsWith("면")
        ? "township"
        : null
    : leaf.endsWith("구")
      ? "district"
      : leaf.endsWith("군")
        ? "county"
        : leaf.endsWith("시") ||
            /^(서울|부산|대구|인천|광주|대전|울산|세종)$/.test(leaf)
          ? "city"
          : null;
  if (!level) return null;
  const result = destinationSchema.safeParse({
    id: destinationId(label),
    label,
    level,
    country: "KR",
    region1,
    region2,
    region3,
    lat: Number(d.y),
    lng: Number(d.x),
    source: {
      provider: "kakao",
      endpoint: kakaoAddressEndpoint,
      addressType: "REGION",
      observedAt,
      verification: "provider",
      coordinateMeaning: "region_representative",
    },
  });
  return result.success ? result.data : null;
}
function retryAfter(value: string | null): string {
  if (value && /^\d{1,6}$/.test(value))
    return String(Math.max(1, Math.min(86400, Number(value))));
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date)
    ? String(
        Math.max(1, Math.min(86400, Math.ceil((date - Date.now()) / 1000))),
      )
    : "60";
}

export class KakaoDestinations {
  private inFlight = new Map<string, Promise<DestinationSearchResponse>>();
  private used = 0;
  private reset = 0;
  constructor(
    private config: { enabled: boolean; key: string },
    private fetcher: typeof fetch = fetch,
    private budget = 60,
  ) {}
  async search(
    query: unknown,
    page: unknown = 1,
  ): Promise<DestinationSearchResponse> {
    const q = destinationQuerySchema.safeParse(query),
      p = destinationPageSchema.safeParse(page);
    if (!q.success || !p.success)
      throw new AppError(400, "DESTINATIONS_INVALID_QUERY");
    if (!this.config.enabled) throw new AppError(503, "DESTINATIONS_DISABLED");
    if (!this.config.key.trim())
      throw new AppError(503, "DESTINATIONS_KEY_MISSING");
    const key = `${p.data}:${q.data}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    if (Date.now() >= this.reset) {
      this.used = 0;
      this.reset = Date.now() + 3600000;
    }
    if (++this.used > this.budget)
      throw new AppError(
        429,
        "DESTINATIONS_RATE_LIMITED",
        String(Math.ceil((this.reset - Date.now()) / 1000)),
      );
    const task = this.lookup(q.data, p.data);
    this.inFlight.set(key, task);
    try {
      return await task;
    } finally {
      this.inFlight.delete(key);
    }
  }
  private async lookup(
    query: string,
    page: number,
  ): Promise<DestinationSearchResponse> {
    const url = new URL(kakaoAddressEndpoint);
    url.search = new URLSearchParams({
      query,
      page: String(page),
      size: "30",
      analyze_type: "similar",
    }).toString();
    try {
      const response = await this.fetcher(url, {
        headers: { Authorization: `KakaoAK ${this.config.key}` },
        signal: AbortSignal.timeout(6000),
        redirect: "error",
      });
      if (!response.ok) {
        if (response.status === 429)
          throw new AppError(
            429,
            "DESTINATIONS_RATE_LIMITED",
            retryAfter(response.headers.get("Retry-After")),
          );
        if ([401, 403].includes(response.status))
          throw new AppError(503, "DESTINATIONS_UNAUTHORIZED");
        throw new AppError(503, "DESTINATIONS_UNAVAILABLE");
      }
      const json = await response.json().catch(() => {
        throw new AppError(502, "DESTINATIONS_INVALID_RESPONSE");
      });
      const parsed = responseSchema.safeParse(json);
      if (!parsed.success)
        throw new AppError(502, "DESTINATIONS_INVALID_RESPONSE");
      const observedAt = new Date().toISOString();
      const destinations = parsed.data.documents
        .map((d) => normalizeDocument(d, observedAt))
        .filter((d): d is Destination => d !== null);
      return {
        destinations: [...new Map(destinations.map((d) => [d.id, d])).values()],
        page,
        hasMore: !parsed.data.meta.is_end && page < 45,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (
        error instanceof Error &&
        ["TimeoutError", "AbortError"].includes(error.name)
      )
        throw new AppError(504, "DESTINATIONS_TIMEOUT");
      throw new AppError(503, "DESTINATIONS_UNAVAILABLE");
    }
  }
  // Run BEFORE reserving LP. Never trust client coordinates or source assertions.
  async verifySelection(selection: unknown): Promise<Destination> {
    const parsed = destinationSchema.safeParse(selection);
    if (!parsed.success)
      throw new AppError(400, "DESTINATION_SELECTION_INVALID");
    const result = await this.search(parsed.data.label);
    const match = result.destinations.find(
      (d) =>
        d.id === parsed.data.id &&
        d.lat === parsed.data.lat &&
        d.lng === parsed.data.lng,
    );
    if (!match) throw new AppError(400, "DESTINATION_SELECTION_INVALID");
    return match;
  }
}

export function attachDestinations(app: Express, service: KakaoDestinations) {
  // Public discovery: no account, database or LP access. Bounded per-process throttle.
  const buckets = new Map<string, { count: number; expires: number }>();
  app.get("/api/destinations", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const now = Date.now();
      for (const [key, bucket] of buckets)
        if (bucket.expires <= now) buckets.delete(key);
      const key = req.ip || "unknown";
      let bucket = buckets.get(key);
      if (!bucket) {
        if (buckets.size >= 5000)
          throw new AppError(429, "DESTINATIONS_RATE_LIMITED", "60");
        bucket = { count: 0, expires: now + 60000 };
        buckets.set(key, bucket);
      }
      if (++bucket.count > 15)
        throw new AppError(429, "DESTINATIONS_RATE_LIMITED", "60");
      const page =
        req.query.page === undefined
          ? 1
          : typeof req.query.page === "string" &&
              /^\d{1,2}$/.test(req.query.page)
            ? Number(req.query.page)
            : NaN;
      res.json(await service.search(req.query.q, page));
    } catch (error) {
      const safe =
        error instanceof AppError
          ? error
          : new AppError(503, "DESTINATIONS_UNAVAILABLE");
      if (safe.retryAfter) res.set("Retry-After", safe.retryAfter);
      res.status(safe.status).json({ error: safe.message });
    }
  });
}
