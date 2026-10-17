import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  attachDestinations,
  KakaoDestinations,
  readDestinationConfig,
} from "../server/destinations";
import {
  destinationSchema,
  kakaoAddressEndpoint,
} from "../shared/destinations";

function doc(region1 = "충북", region2 = "충주시", region3 = "살미면") {
  return {
    address_type: "REGION",
    address_name: [region1, region2, region3].filter(Boolean).join(" "),
    x: "127.9",
    y: "36.9",
    address: {
      region_1depth_name: region1,
      region_2depth_name: region2,
      region_3depth_name: region3,
    },
  };
}
const body = (documents: unknown[] = [doc()], is_end = true) => ({
  documents,
  meta: { is_end },
});
function setup(payload = body(), budget = 60) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(payload));
  const service = new KakaoDestinations(
    { enabled: true, key: "fixture-secret" },
    fetcher,
    budget,
  );
  return { fetcher, service };
}
describe("Kakao travel regions (synthetic responses; no live requests)", () => {
  it("uses only the fixed server endpoint, encoded query, auth header and timeout", async () => {
    const { service, fetcher } = setup();
    const result = await service.search("  충주시 살미면  ", 2);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain(kakaoAddressEndpoint);
    expect(new URL(String(url)).searchParams.get("query")).toBe(
      "충주시 살미면",
    );
    expect(new URL(String(url)).searchParams.get("page")).toBe("2");
    expect(init?.headers).toEqual({ Authorization: "KakaoAK fixture-secret" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.redirect).toBe("error");
    expect(result.destinations[0]).toMatchObject({
      level: "township",
      lat: 36.9,
      lng: 127.9,
      source: {
        provider: "kakao",
        endpoint: kakaoAddressEndpoint,
        addressType: "REGION",
        coordinateMeaning: "region_representative",
      },
    });
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
    expect(destinationSchema.safeParse(result.destinations[0]).success).toBe(
      true,
    );
  });
  it("supports city, county, district, town, township and metropolitan cities beyond three presets", async () => {
    const { service } = setup(
      body([
        doc("경기", "수원시", ""),
        doc("전남", "담양군", ""),
        doc("서울", "성동구", ""),
        doc("제주", "제주시", "애월읍"),
        doc(),
        doc("세종", "", ""),
        doc("경기", "수원시 영통구", ""),
      ]),
    );
    const result = await service.search("지역");
    expect(result.destinations.map((d) => d.level)).toEqual([
      "city",
      "county",
      "district",
      "town",
      "township",
      "city",
      "district",
    ]);
  });
  it("rejects buildings, roads, dong/ri, provinces, fabricated hierarchy and duplicate labels", async () => {
    const base = doc();
    const { service } = setup(
      body([
        base,
        base,
        { ...base, address_type: "REGION_ADDR" },
        { ...base, address_type: "ROAD" },
        doc("서울", "성동구", "성수동"),
        doc("충북", "충주시", "살미면 설운리"),
        doc("충북", "", ""),
        doc("외국", "가짜시", ""),
        doc("경기", "도로", ""),
        { ...base, address_name: "충북 충주시 살미면 123" },
        { ...base, address: { ...base.address, main_address_no: "123" } },
      ]),
    );
    expect((await service.search("지역")).destinations).toHaveLength(1);
  });
  it.each(["", " ", "NaN", "Infinity", "0", "37.5", "200", "0x80"])(
    "rejects bad longitude %j",
    async (x) => {
      const { service } = setup(body([{ ...doc(), x }]));
      expect((await service.search("지역")).destinations).toEqual([]);
    },
  );
  it("rejects swapped/out-of-region latitudes", async () => {
    const { service } = setup(
      body([
        { ...doc(), x: "36.9", y: "127.9" },
        { ...doc(), y: "90" },
      ]),
    );
    expect((await service.search("지역")).destinations).toEqual([]);
  });
  it("paginates provider results without calling them a complete administrative catalog", async () => {
    const { service } = setup(body([], false));
    expect(await service.search("중구", 1)).toEqual({
      destinations: [],
      page: 1,
      hasMore: true,
    });
    expect((await service.search("중구", 45)).hasMore).toBe(false);
  });
  it("does not call provider when flags/key/query/page are invalid", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const disabled = new KakaoDestinations(readDestinationConfig({}), fetcher);
    await expect(disabled.search("서울")).rejects.toMatchObject({
      message: "DESTINATIONS_DISABLED",
    });
    const missing = new KakaoDestinations({ enabled: true, key: " " }, fetcher);
    await expect(missing.search("서울")).rejects.toMatchObject({
      message: "DESTINATIONS_KEY_MISSING",
    });
    const { service } = setup();
    for (const q of ["", "a", ["서울"], "서\n울", "가".repeat(101)])
      await expect(service.search(q)).rejects.toMatchObject({ status: 400 });
    for (const p of [0, 46, 1.5, "2"])
      await expect(service.search("서울", p)).rejects.toMatchObject({
        status: 400,
      });
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      readDestinationConfig({
        FEATURE_KAKAO_DESTINATIONS: "true",
        KAKAO_REST_API_KEY: "fixture",
      }).enabled,
    ).toBe(false);
  });
  it.each([401, 403, 404, 429, 500, 503])(
    "handles HTTP %s without leaking response bodies",
    async (status) => {
      const { service, fetcher } = setup();
      fetcher.mockResolvedValue(
        new Response("fixture-secret", {
          status,
          headers: { "Retry-After": "123" },
        }),
      );
      await expect(service.search("서울")).rejects.toMatchObject({
        status: status === 429 ? 429 : 503,
        message:
          status === 429
            ? "DESTINATIONS_RATE_LIMITED"
            : [401, 403].includes(status)
              ? "DESTINATIONS_UNAUTHORIZED"
              : "DESTINATIONS_UNAVAILABLE",
        ...(status === 429 ? { retryAfter: "123" } : {}),
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["TimeoutError", "AbortError", "TypeError"])(
    "handles %s without retries",
    async (name) => {
      const { service, fetcher } = setup();
      fetcher.mockRejectedValue(
        Object.assign(new Error("fixture-secret"), { name }),
      );
      await expect(service.search("서울")).rejects.toMatchObject({
        message:
          name === "TypeError"
            ? "DESTINATIONS_UNAVAILABLE"
            : "DESTINATIONS_TIMEOUT",
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects malformed JSON/envelope and leaves genuine no-results empty", async () => {
    const { service, fetcher } = setup();
    fetcher.mockResolvedValueOnce(new Response("oops"));
    await expect(service.search("서울")).rejects.toMatchObject({
      message: "DESTINATIONS_INVALID_RESPONSE",
    });
    fetcher.mockResolvedValueOnce(Response.json({ documents: [] }));
    await expect(service.search("서울")).rejects.toMatchObject({
      message: "DESTINATIONS_INVALID_RESPONSE",
    });
    fetcher.mockResolvedValueOnce(Response.json(body([])));
    expect((await service.search("서울")).destinations).toEqual([]);
  });
  it("coalesces concurrent identical calls, enforces budget, and does not cache completed responses", async () => {
    const { service, fetcher } = setup(body(), 2);
    await Promise.all([service.search("서울"), service.search("서울")]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await service.search("서울");
    await expect(service.search("부산")).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("revalidates selection from provider, rejecting tampered coordinates/source/identity", async () => {
    const { service } = setup();
    const selection = (await service.search("살미면")).destinations[0];
    expect(await service.verifySelection(selection)).toMatchObject({
      id: selection.id,
    });
    for (const tampered of [
      { ...selection, lat: 37 },
      { ...selection, id: "kakao:fake" },
      {
        ...selection,
        source: { ...selection.source, endpoint: "https://evil.example" },
      },
    ]) {
      await expect(service.verifySelection(tampered)).rejects.toMatchObject({
        message: "DESTINATION_SELECTION_INVALID",
      });
    }
  });
  it("serves public search without auth/DB, rejects malformed HTTP query and throttles requests", async () => {
    const { service, fetcher } = setup();
    const app = express();
    attachDestinations(app, service);
    const response = await request(app)
      .get("/api/destinations")
      .query({ q: "살미면" })
      .expect(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.destinations).toHaveLength(1);
    await request(app).get("/api/destinations?q=서울&page=abc").expect(400);
    await request(app).get("/api/destinations?q=서울&q=부산").expect(400);
    for (let i = 0; i < 12; i++)
      await request(app).get("/api/destinations?q=서울").expect(200);
    const limited = await request(app)
      .get("/api/destinations?q=서울")
      .expect(429);
    expect(limited.headers["retry-after"]).toBe("60");
    expect(JSON.stringify(limited.body)).not.toContain("fixture-secret");
    expect(fetcher).toHaveBeenCalledTimes(13);
  });
});

describe("English region aliases preserve provider provenance", () => {
  it.each([
    ["Seoul", "서울"],
    [" BUSAN ", "부산"],
    ["Chung-Ju", "충주시"],
    ["Jeju", "제주시"],
    ["Seong Su", "서울 성동구"],
    ["EULJI-RO", "서울 중구"],
    ["Unknown English", "Unknown English"],
    ["충주시", "충주시"],
  ])(
    "forwards %s as %s without fabricating results",
    async (query, translated) => {
      const { service, fetcher } = setup(body([]));
      expect((await service.search(query, 2)).destinations).toEqual([]);
      const url = new URL(String(fetcher.mock.calls[0][0]));
      expect(url.searchParams.get("query")).toBe(translated);
      expect(url.searchParams.get("page")).toBe("2");
    },
  );
  it("only returns the provider's region and coordinates for an alias", async () => {
    const { service } = setup(body([doc("서울", "성동구", "")]));
    const result = await service.search("Seongsu");
    expect(result.destinations[0]).toMatchObject({
      label: "서울 성동구",
      lat: 36.9,
      lng: 127.9,
      source: { provider: "kakao" },
    });
    expect(await service.verifySelection(result.destinations[0])).toMatchObject(
      { label: "서울 성동구" },
    );
  });
});
