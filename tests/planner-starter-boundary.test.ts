import { afterEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import request from "supertest";
import { createApp } from "../server/app";
import { readConfig } from "../server/config";
import { AppError } from "../server/errors";
import type { Repository } from "../server/repository";
import { destinationId, type Destination } from "../shared/destinations";
import type { Place } from "../shared/domain";
import type { Candidate, Itinerary, Schedule } from "../shared/planner";
import type { TransportLegResult, TransportRequest } from "../shared/transport";
import {
  persistPending,
  readPending,
  type PendingPlan,
} from "../src/planner/pending";
import { plannerInput } from "./fixtures/planning";

const destination: Destination = {
  id: destinationId("서울 성동구"),
  label: "서울 성동구",
  country: "KR",
  level: "district",
  region1: "서울",
  region2: "성동구",
  region3: "",
  lat: 37.5455,
  lng: 127.053,
  source: {
    provider: "kakao",
    endpoint: "https://dapi.kakao.com/v2/local/search/address.json",
    addressType: "REGION",
    observedAt: new Date().toISOString(),
    verification: "provider",
    coordinateMeaning: "region_representative",
  },
};
const input = {
  ...plannerInput,
  destination,
  startTime: "10:00",
  endTime: "16:00",
  activities: ["art"] as const,
  foodTypes: ["korean"] as const,
};
const restaurantId = "96000000-0000-4000-8000-000000000001";
const resultId = "96000000-0000-4000-8000-000000000002";
const galleryId = "kakao:qa-fixture-gallery";
function payload(): PendingPlan {
  return {
    requestId: crypto.randomUUID(),
    input: {
      ...input,
      activities: [...input.activities],
      foodTypes: [...input.foodTypes],
    },
    expectedCost: 0,
    policyVersion: "operator-free-v1",
    consent: true,
    aiConsentVersion: "planner-ai-v1",
    pinIds: [],
  };
}
const schedule: Schedule = {
  title: "QA fixture starter trip",
  summary: "Operator starter meal, independent local feedback unavailable.",
  days: [
    {
      date: plannerInput.startDate,
      stops: [
        {
          candidateId: galleryId,
          start: "10:00",
          end: "11:00",
          purpose: "visit",
          explanation: "A synthetic fixture gallery selected for art.",
        },
        {
          candidateId: restaurantId,
          start: "12:00",
          end: "13:00",
          purpose: "lunch",
          explanation:
            "Operator starter recommendation; independent local feedback unavailable.",
        },
      ],
    },
  ],
};

function setup(
  options: {
    reservationCost?: number | null;
    missingCost?: boolean;
    quoteCost?: number;
    quoteEnabled?: boolean;
    prior?: "missing" | "generating" | "ready";
  } = {},
) {
  let state: "missing" | "generating" | "failed" | "ready" =
    options.prior || "missing";
  let saved: Itinerary | undefined;
  const cost = options.missingCost
    ? undefined
    : options.reservationCost === undefined
      ? 0
      : options.reservationCost;
  const planning = vi.fn(
    async (_actor, action: string, _id, body: Record<string, unknown>) => {
      if (action === "balance")
        return {
          enabled: options.quoteEnabled !== false,
          cost: options.quoteCost ?? 0,
          promo: 0,
          earned: 0,
          held: 0,
          policyVersion: "operator-free-v1",
        };
      if (action === "status") {
        if (state === "missing") throw new AppError(404, "REQUEST_NOT_FOUND");
        return { id: resultId, status: state, result: saved };
      }
      if (action === "reserve") {
        const replay = state !== "missing";
        if (!replay) state = "generating";
        return { id: resultId, status: state, cost, replay, result: saved };
      }
      if (action === "fail") {
        state = "failed";
        return { status: state };
      }
      if (action === "finalize") {
        saved = body.result as Itinerary;
        state = "ready";
        return saved;
      }
      throw new Error(`Unexpected fixture action ${action}`);
    },
  );
  const place: Place = {
    id: restaurantId,
    name: "QA fixture operator restaurant",
    address: "Synthetic fixture address",
    kind: "restaurant",
    category: "한식",
    lat: destination.lat,
    lng: destination.lng,
    tags: ["korean"],
    endorsements: [],
    rating: null,
    reviewCount: 0,
    source: "localroute",
    officialSources: [
      {
        url: "https://tourism.example.test/fixture-restaurant",
        observedAt: new Date().toISOString(),
      },
    ],
  };
  const gallery: Candidate = {
    id: galleryId,
    name: "QA fixture gallery",
    kind: "culture",
    address: "Synthetic fixture gallery address",
    lat: destination.lat + 0.0005,
    lng: destination.lng,
    tags: ["art"],
    endorsements: [],
    source: {
      provider: "kakao",
      verification: "provider",
      observedAt: new Date().toISOString(),
    },
  };
  const places = vi.fn(async () => [structuredClone(place)]);
  const repository = {
    authenticate: vi.fn(async () => ({
      id: "fixture-owner",
      role: "traveler",
    })),
    planning,
    places,
  } as unknown as Repository;
  const gemini = {
    structured: async <T>(schema: z.ZodType<T>) =>
      schema.parse(structuredClone(schedule)),
  };
  vi.spyOn(gemini, "structured");
  const activities = { search: vi.fn(async () => [structuredClone(gallery)]) };
  const destinations = {
    verifySelection: vi.fn(async () => structuredClone(destination)),
  };
  const routing = {
    lookup: vi.fn(
      async (route: TransportRequest): Promise<TransportLegResult> => ({
        request: route,
        source: {
          provider: "kakao_maps",
          documentationUrl: null,
          checkedAt: new Date().toISOString(),
          requestedAt: new Date().toISOString(),
          attempted: false,
        },
        status: "unverified",
        reason: "unsupported_mode",
        timeBasis: "lookup_time",
        arrivalGuaranteed: false,
        accessibility: "unverified",
        distanceMeters: null,
        durationSeconds: null,
        transfers: null,
        walking: null,
        steps: [],
        fare: null,
      }),
    ),
  };
  const app = createApp(
    { ...readConfig({}), live: true, planning: true, starterPlanning: true },
    repository,
    undefined,
    { gemini, activities, destinations, routing },
  );
  return { app, planning, gemini, places, activities, destinations, routing };
}

afterEach(() => vi.unstubAllGlobals());
describe("operator starter HTTP price and AI consent boundary", () => {
  it.each([1, 2, 5])(
    "quotes the configured daily price for %s days",
    async (days) => {
      const test = setup({ quoteCost: 10 });
      const response = await request(test.app)
        .get(`/api/planning/quote?days=${days}`)
        .set("Authorization", "Bearer valid");
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        enabled: true,
        starter: true,
        dailyCost: 10,
        days,
        cost: 10 * days,
      });
    },
  );
  it.each(["0", "6", "1.5", "no", "", "1&days=2"])(
    "rejects invalid day counts before wallet operations (%s)",
    async (days) => {
      const test = setup({ quoteCost: 10 });
      const response = await request(test.app)
        .get(`/api/planning/quote?days=${days}`)
        .set("Authorization", "Bearer valid");
      expect(response.status).toBe(400);
      expect(test.planning).not.toHaveBeenCalled();
    },
  );
  it("accepts and saves a confirmed 10 LP starter itinerary once", async () => {
    const test = setup({ reservationCost: 10, quoteCost: 10 });
    const body = { ...payload(), expectedCost: 10 };
    const first = await request(test.app)
      .post("/api/planning/generate")
      .set("Authorization", "Bearer valid")
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body.cost).toBe(10);
    const replay = await request(test.app)
      .post("/api/planning/generate")
      .set("Authorization", "Bearer valid")
      .send(body);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(
      test.planning.mock.calls.filter((call) => call[1] === "finalize"),
    ).toHaveLength(1);
    expect(test.gemini.structured).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, null, "old-version"])(
    "requires the explicit current AI disclosure version (%s)",
    async (version) => {
      const test = setup();
      const body = { ...payload(), aiConsentVersion: version };
      const response = await request(test.app)
        .post("/api/planning/generate")
        .set("Authorization", "Bearer valid")
        .send(body);
      expect(response.status).toBe(400);
      expect(test.planning).not.toHaveBeenCalled();
      expect(test.destinations.verifySelection).not.toHaveBeenCalled();
      expect(test.gemini.structured).not.toHaveBeenCalled();
    },
  );

  it.each([-1, null, "0"])(
    "does not permit an invalid starter price (%s)",
    async (expectedCost) => {
      const test = setup();
      const response = await request(test.app)
        .post("/api/planning/generate")
        .set("Authorization", "Bearer valid")
        .send({ ...payload(), expectedCost });
      expect(response.status).toBe(400);
      expect(test.planning).not.toHaveBeenCalled();
      expect(test.destinations.verifySelection).not.toHaveBeenCalled();
      expect(test.gemini.structured).not.toHaveBeenCalled();
    },
  );

  it.each([
    [0, true],
    [100, true],
  ])(
    "enables a starter quote at the configured policy price (%s)",
    async (quoteCost, enabled) => {
      const test = setup({ quoteCost: quoteCost as number });
      const response = await request(test.app)
        .get("/api/planning/quote")
        .set("Authorization", "Bearer valid");
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        starter: true,
        cost: quoteCost,
        enabled,
        promo: 0,
        earned: 0,
      });
      expect(test.planning.mock.calls.map((call) => call[1])).toEqual([
        "balance",
      ]);
    },
  );

  it("keeps a disabled zero-cost policy disabled", async () => {
    const test = setup({ quoteCost: 0, quoteEnabled: false });
    const response = await request(test.app)
      .get("/api/planning/quote")
      .set("Authorization", "Bearer valid");
    expect(response.body).toMatchObject({
      starter: true,
      cost: 0,
      enabled: false,
    });
  });

  it.each([
    { reservationCost: 100 },
    { reservationCost: null },
    { missingCost: true },
  ])(
    "releases a mismatched or missing server reservation before generation providers run",
    async (options) => {
      const test = setup(options);
      const response = await request(test.app)
        .post("/api/planning/generate")
        .set("Authorization", "Bearer valid")
        .send(payload());
      expect(response.status).toBe(409);
      expect(response.body.error).toBe("PRICE_CONFIRMATION_REQUIRED");
      expect(test.planning.mock.calls.map((call) => call[1])).toEqual([
        "status",
        "reserve",
        "status",
        "fail",
      ]);
      expect(test.planning.mock.calls.at(-1)?.[3]).toEqual({
        code: "PRICE_CONFIRMATION_REQUIRED",
      });
      expect(test.places).not.toHaveBeenCalled();
      expect(test.activities.search).not.toHaveBeenCalled();
      expect(test.gemini.structured).not.toHaveBeenCalled();
      expect(test.routing.lookup).not.toHaveBeenCalled();
    },
  );

  it("persists a valid zero-cost result, keeps operator provenance distinct and replays without another generation", async () => {
    const test = setup();
    const body = payload();
    const first = await request(test.app)
      .post("/api/planning/generate")
      .set("Authorization", "Bearer valid")
      .send(body);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      cost: 0,
      provenance: "gemini",
      evaluation: { valid: true },
    });
    const meal = first.body.catalog.find(
      (candidate: { id: string }) => candidate.id === restaurantId,
    );
    expect(meal).toMatchObject({
      starterRecommendation: true,
      endorsements: [],
    });
    const finalized = test.planning.mock.calls.find(
      (call) => call[1] === "finalize",
    )?.[3].result as Itinerary;
    expect(finalized.cost).toBe(0);
    const second = await request(test.app)
      .post("/api/planning/generate")
      .set("Authorization", "Bearer valid")
      .send(body);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(test.gemini.structured).toHaveBeenCalledOnce();
    expect(
      test.planning.mock.calls.filter((call) => call[1] === "finalize"),
    ).toHaveLength(1);
    expect(
      test.planning.mock.calls.filter((call) => call[1] === "fail"),
    ).toHaveLength(0);
  });
});

describe("free starter pending request recovery", () => {
  it("preserves zero cost and the exact AI disclosure consent version across reloads per owner", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const original = payload();
    persistPending("owner-a", original);
    expect(readPending("owner-a")).toEqual(original);
    expect(readPending("owner-a")).toMatchObject({
      expectedCost: 0,
      aiConsentVersion: "planner-ai-v1",
    });
    expect(readPending("owner-b")).toBeNull();
    values.set(
      "localroute.planning.pending.owner-a",
      JSON.stringify({ ...original, aiConsentVersion: "stale-consent" }),
    );
    expect(readPending("owner-a")).toBeNull();
    persistPending("owner-a", null);
    expect(readPending("owner-a")).toBeNull();
  });
});
