import { describe, expect, it, vi } from "vitest";
import { createKakaoRouting } from "../server/routing";
import {
  transportRequestSchema,
  validateTransportGap,
  type TransportRequest,
} from "../shared/transport";

const request: TransportRequest = {
  origin: { lat: 37.5, lng: 127 },
  destination: { lat: 37.6, lng: 127.1 },
  mode: "car",
};
const car = {
  routes: [
    {
      result_code: 0,
      summary: {
        distance: 3200,
        duration: 601,
        fare: { taxi: 9999, toll: 1200 },
      },
      sections: [
        { guides: [{ guidance: "우회전", distance: 100, duration: 20 }] },
      ],
    },
  ],
};
const transit = {
  status: "OK",
  routes: [
    {
      properties: {
        totalDistance: 4000,
        totalTime: 1800,
        transfers: 1,
        fare: { value: 1550 },
      },
      steps: [
        {
          properties: {
            type: "WALKING",
            guidance: "정류장까지 도보",
            distance: 200,
            time: 180,
          },
        },
        {
          properties: {
            type: "BUS",
            guidance: "76 승차",
            distance: 1800,
            time: 720,
            stops: [{ name: "출발역" }, { name: "환승역" }],
            vehicles: [{ name: "76", type: "마을" }],
          },
        },
        {
          properties: {
            type: "SUBWAY",
            guidance: "2호선 승차",
            distance: 1800,
            time: 720,
            vehicles: [{ name: "2호선", type: "일반" }],
          },
        },
        {
          properties: {
            type: "WALKING",
            guidance: "목적지까지 도보",
            distance: 200,
            time: 180,
          },
        },
      ],
    },
  ],
};
function setup(body: unknown = car, status = 200, headers?: HeadersInit) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status, headers }));
  const routing = createKakaoRouting({
    enabled: true,
    carKey: "mock-car-secret",
    transitKey: "mock-transit-secret",
    maxCalls: 3,
    fetcher,
  });
  return { fetcher, routing };
}

describe("Kakao server routing (mock providers only)", () => {
  it("sends coordinates in longitude/latitude order to the official car host, keeps secrets server-side", async () => {
    const { routing, fetcher } = setup();
    const result = await routing.lookup(request);
    expect(result).toMatchObject({
      status: "estimated",
      distanceMeters: 3200,
      durationSeconds: 601,
      transfers: null,
      walking: null,
      arrivalGuaranteed: false,
      accessibility: "unverified",
      timeBasis: "lookup_time",
      fare: { value: 1200, kind: "toll" },
      source: { provider: "kakao_mobility", attempted: true },
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(new URL(String(url)).origin).toBe(
      "https://apis-navi.kakaomobility.com",
    );
    expect(new URL(String(url)).searchParams.get("origin")).toBe("127,37.5");
    expect(init).toMatchObject({
      redirect: "error",
      cache: "no-store",
      headers: { Authorization: "KakaoAK mock-car-secret" },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("9999");
    expect(Date.parse(result.source.checkedAt)).toBeGreaterThanOrEqual(
      Date.parse(result.source.requestedAt),
    );
  });
  it("parses transit seconds, walking sections, transfers, vehicles and stops from the documented schema", async () => {
    const { routing, fetcher } = setup(transit);
    const result = await routing.lookup({ ...request, mode: "transit" });
    expect(result).toMatchObject({
      status: "estimated",
      durationSeconds: 1800,
      transfers: 1,
      walking: { distanceMeters: 400, durationSeconds: 360 },
      fare: { value: 1550, kind: "transit" },
      source: { provider: "kakao_maps" },
    });
    expect(result.steps[1]).toMatchObject({
      mode: "bus",
      stops: ["출발역", "환승역"],
      vehicles: [{ name: "76", type: "마을" }],
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/v2/routing/publictraffic");
    expect(new URL(String(url)).origin).toBe("https://dapi.kakao.com");
    expect(new URL(String(url)).searchParams.get("start_x")).toBe("127");
    expect(init?.headers).toMatchObject({
      Authorization: "KakaoAK mock-transit-secret",
    });
  });
  it("never invents an absent fare", async () => {
    const body = structuredClone(transit);
    Reflect.deleteProperty(body.routes[0].properties, "fare");
    expect(
      await setup(body).routing.lookup({ ...request, mode: "transit" }),
    ).toMatchObject({ status: "estimated", fare: null });
  });
  it.each(["walking", "wheelchair"] as const)(
    "returns unknown for %s without any provider call",
    async (mode) => {
      const { routing, fetcher } = setup();
      expect(await routing.lookup({ ...request, mode })).toMatchObject({
        status: "unverified",
        reason: "unsupported_mode",
        durationSeconds: null,
        distanceMeters: null,
        fare: null,
        steps: [],
        source: { attempted: false, provider: "none" },
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("defaults disabled and zero-budget; missing optional keys do not crash", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await createKakaoRouting({ fetcher }).lookup(request)).toMatchObject(
      { reason: "disabled" },
    );
    expect(
      await createKakaoRouting({ enabled: true, fetcher }).lookup(request),
    ).toMatchObject({ reason: "disabled" });
    expect(
      await createKakaoRouting({
        enabled: true,
        carKey: "mock",
        fetcher,
      }).lookup(request),
    ).toMatchObject({ reason: "budget_exceeded" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, 91, " "])(
    "rejects invalid latitude %s before network",
    (lat) => {
      const { routing, fetcher } = setup();
      expect(() =>
        routing.lookup({
          ...request,
          origin: { lat, lng: 127 },
        } as TransportRequest),
      ).toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("allows intentional zero coordinates and rejects unknown modes/invalid budget", () => {
    expect(
      transportRequestSchema.safeParse({
        ...request,
        origin: { lat: 0, lng: 0 },
      }).success,
    ).toBe(true);
    expect(() => createKakaoRouting({ maxCalls: -1 })).toThrow();
    expect(
      transportRequestSchema.safeParse({ ...request, mode: "flying" }).success,
    ).toBe(false);
  });
  it.each([401, 403, 404, 429, 500, 503, 400])(
    "handles HTTP %s with empty metrics and no retry",
    async (status) => {
      const { routing, fetcher } = setup(
        { private: "provider-secret" },
        status,
      );
      const result = await routing.lookup(request);
      expect(result).toMatchObject({
        status: "unverified",
        reason:
          status === 401 || status === 403
            ? "unauthorized"
            : status === 404
              ? "no_results"
              : status === 429
                ? "rate_limited"
                : status >= 500
                  ? "provider_unavailable"
                  : "invalid_request",
        distanceMeters: null,
        durationSeconds: null,
        walking: null,
      });
      expect(JSON.stringify(result)).not.toContain("provider-secret");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["120", "Thu, 01 Jan 2026 00:02:00 GMT", "bad"])(
    "honors cooldown Retry-After %s",
    async (header) => {
      let now = Date.parse("2026-01-01T00:00:00Z");
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        async () =>
          new Response(null, {
            status: 429,
            headers: { "Retry-After": header },
          }),
      );
      const routing = createKakaoRouting({
        enabled: true,
        carKey: "mock",
        maxCalls: 5,
        fetcher,
        now: () => now,
      });
      const seconds = header === "bad" ? 60 : 120;
      expect(await routing.lookup(request)).toMatchObject({
        reason: "rate_limited",
        retryAfterSeconds: seconds,
      });
      expect(await routing.lookup(request)).toMatchObject({
        reason: "rate_limited",
        source: { attempted: false },
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      now += seconds * 1000;
      await routing.lookup(request);
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it("deduplicates concurrent identical requests, counts failed calls and resets a bounded budget", async () => {
    let now = 1000;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(null, { status: 500 }));
    const routing = createKakaoRouting({
      enabled: true,
      carKey: "mock",
      transitKey: "mock",
      maxCalls: 1,
      budgetWindowMs: 1000,
      fetcher,
      now: () => now,
    });
    const a = routing.lookup(request),
      b = routing.lookup(request);
    expect(a).toBe(b);
    await a;
    expect(await routing.lookup({ ...request, mode: "transit" })).toMatchObject(
      { reason: "budget_exceeded", source: { attempted: false } },
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 1000;
    await routing.lookup(request);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["headers", "body"])(
    "bounds %s timeout and aborts without assuming injected fetch supports abort",
    async (phase) => {
      let signal: AbortSignal | undefined;
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async (_url, init) => {
          signal = init?.signal ?? undefined;
          if (phase === "headers") return new Promise<Response>(() => {});
          return {
            status: 200,
            ok: true,
            json: () => new Promise(() => {}),
          } as Response;
        });
      const routing = createKakaoRouting({
        enabled: true,
        carKey: "mock",
        maxCalls: 1,
        timeoutMs: 10,
        fetcher,
      });
      expect(await routing.lookup(request)).toMatchObject({
        status: "unverified",
        reason: "timeout",
      });
      expect(signal?.aborted).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("redacts thrown network exceptions and handles malformed JSON", async () => {
    const { routing, fetcher } = setup();
    fetcher.mockRejectedValueOnce(
      new Error("mock-car-secret / user's coordinates"),
    );
    expect(await routing.lookup(request)).toMatchObject({
      reason: "provider_unavailable",
    });
    fetcher.mockResolvedValueOnce(new Response("not json"));
    expect(await routing.lookup(request)).toMatchObject({
      reason: "invalid_response",
    });
  });
  it.each([
    {},
    { routes: [] },
    { routes: [{ result_code: 1 }] },
    { routes: [{ result_code: 999 }] },
    { routes: [{ ...car.routes[0], summary: { distance: -1, duration: 40 } }] },
  ])("fails closed for car result %j", async (body) => {
    expect(await setup(body).routing.lookup(request)).toMatchObject({
      status: "unverified",
      durationSeconds: null,
    });
  });
  it.each([
    "NO_RESULTS",
    "STARTNODES_NULL",
    "ENDNODES_NULL",
    "EQUAL_POINTS",
    "INVALID_REQUEST",
    "NEW_UNKNOWN_STATUS",
  ])("fails closed for transit %s", async (status) => {
    expect(
      await setup({ status }).routing.lookup({ ...request, mode: "transit" }),
    ).toMatchObject({ status: "unverified", durationSeconds: null });
  });
  it("rejects incomplete/changed transit step schemas instead of assuming a line or travel speed", async () => {
    const body = structuredClone(transit);
    body.routes[0].steps[0].properties.type = "NEW_MODE";
    expect(
      await setup(body).routing.lookup({ ...request, mode: "transit" }),
    ).toMatchObject({ reason: "invalid_response" });
  });
  it("checks actual provider duration rather than straight-line speed, never passes unknown routes", async () => {
    const leg = await setup().routing.lookup(request);
    expect(validateTransportGap(leg, 600)).toMatchObject({
      status: "exceeds_gap",
      excessSeconds: 1,
    });
    expect(validateTransportGap(leg, 601)).toMatchObject({
      status: "fits_estimate",
      arrivalGuaranteed: false,
    });
    expect(validateTransportGap(leg, 601, 60)).toMatchObject({
      status: "exceeds_gap",
      excessSeconds: 60,
    });
    expect(validateTransportGap(leg, -1).status).toBe("invalid_gap");
    expect(validateTransportGap(leg, NaN).status).toBe("invalid_gap");
    expect(validateTransportGap(leg, 1000, Infinity).status).toBe(
      "invalid_gap",
    );
    const unknown = await createKakaoRouting().lookup(request);
    expect(validateTransportGap(unknown, 100000).status).toBe("unverified");
  });
});
