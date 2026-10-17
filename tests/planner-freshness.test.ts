import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import request from "supertest";
import { createApp } from "../server/app";
import { readConfig } from "../server/config";
import { AppError } from "../server/errors";
import { localCandidates } from "../server/planner/catalog";
import type { Repository } from "../server/repository";
import { destinationId, type Destination } from "../shared/destinations";
import { demoPlaces } from "../shared/demo";
import type { Place } from "../shared/domain";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import {
  evaluateSchedule,
  type Candidate,
  type Itinerary,
} from "../shared/planner";
import type { TransportLegResult, TransportRequest } from "../shared/transport";
import { plannerInput } from "./fixtures/planning";
import { blueprintResponse } from "./fixtures/blueprint-response";

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
    observedAt: "2026-10-17T00:00:00Z",
    verification: "provider",
    coordinateMeaning: "region_representative",
  },
};
const input = { ...plannerInput, destination };
const sourceId = "90000000-0000-4000-8000-000000000001";
const resultId = "90000000-0000-4000-8000-000000000002";
const requestId = "90000000-0000-4000-8000-000000000003";
const freshTime = "2026-10-17T03:00:00Z";
function places(): Place[] {
  return structuredClone(demoPlaces).map((place) => ({
    ...place,
    source: "localroute",
    observedAt: freshTime,
    endorsements: place.endorsements.map((endorsement) => ({
      ...endorsement,
      versionId: `version-${endorsement.id}`,
    })),
  }));
}
function activities(): Candidate[] {
  return structuredClone(
    demoCatalog.filter(
      (candidate) =>
        candidate.kind === "culture" || candidate.kind === "attraction",
    ),
  ).map((candidate) => ({
    ...candidate,
    source: {
      provider: "kakao",
      observedAt: freshTime,
      verification: "provider",
    },
  }));
}
function unknownRoute(route: TransportRequest): TransportLegResult {
  return {
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
  };
}
function setup() {
  const current = { places: places(), activities: activities() };
  const original: Itinerary = {
    id: sourceId,
    revision: 1,
    input,
    schedule: demoSchedule(input),
    catalog: [...localCandidates(places(), input), ...activities()],
    evaluation: evaluateSchedule(demoSchedule(input), input, [
      ...localCandidates(places(), input),
      ...activities(),
    ]),
    createdAt: "2026-10-01T00:00:00Z",
    model: "test-only",
    provenance: "gemini",
    cost: 100,
  };
  for (const candidate of original.catalog) {
    candidate.source.observedAt = "2020-01-01T00:00:00Z";
    candidate.address = "Old saved address";
  }
  let state: "missing" | "generating" | "failed" | "ready" = "missing";
  const ledger = { balance: 300, held: 0, debits: 0 };
  const planning = vi.fn(
    async (
      _actor,
      action: string,
      _requestId,
      body: Record<string, unknown>,
    ) => {
      if (action === "get") return structuredClone(original);
      if (action === "status") {
        if (state === "missing") throw new AppError(404, "REQUEST_NOT_FOUND");
        return { status: state };
      }
      if (action === "reserve") {
        state = "generating";
        ledger.held = 100;
        return { id: resultId, status: state, cost: 100 };
      }
      if (action === "fail") {
        state = "failed";
        ledger.held = 0;
        return {};
      }
      if (action === "finalize") {
        state = "ready";
        ledger.held = 0;
        ledger.balance -= 100;
        ledger.debits++;
        return body.result;
      }
      if (action === "save") return body.result;
      throw new Error(`Unmocked planning action ${action}`);
    },
  );
  const repository = {
    authenticate: vi.fn(async () => ({
      id: "test-traveler",
      role: "traveler",
    })),
    places: vi.fn(async () => structuredClone(current.places)),
    planning,
  } as unknown as Repository;
  const gemini = {
    structured: async <T>(
      schema: z.ZodType<T>,
      _system: string,
      data: unknown,
    ) => schema.parse(blueprintResponse(original.schedule, data)),
  };
  vi.spyOn(gemini, "structured");
  const deps = {
    gemini,
    activities: {
      search: vi.fn(async () => structuredClone(current.activities)),
    },
    destinations: {
      verifySelection: vi.fn(async () => structuredClone(destination)),
    },
    routing: {
      lookup: vi.fn(async (route: TransportRequest) => unknownRoute(route)),
    },
  };
  const app = createApp(
    { ...readConfig({}), live: true, planning: true },
    repository,
    undefined,
    deps,
  );
  const payload = (
    pinIds = original.schedule.days.flatMap((day) =>
      day.stops.map((stop) => stop.candidateId),
    ),
  ) => ({
    requestId,
    input,
    expectedCost: 100,
    policyVersion: "test-only-v1",
    consent: true,
    sourcePlanId: sourceId,
    pinIds,
  });
  const generate = (pinIds?: string[]) =>
    request(app)
      .post("/api/planning/generate")
      .set("Authorization", "Bearer test-only")
      .send(payload(pinIds));
  const save = (schedule = original.schedule) =>
    request(app)
      .put(`/api/itineraries/${sourceId}`)
      .set("Authorization", "Bearer test-only")
      .send({ revision: 1, schedule });
  return {
    app,
    current,
    original,
    repository,
    deps,
    ledger,
    planning,
    generate,
    save,
  };
}
function expectUncharged(result: ReturnType<typeof setup>) {
  expect(result.ledger).toEqual({ balance: 300, held: 0, debits: 0 });
  expect(
    result.planning.mock.calls.filter((call) => call[1] === "finalize"),
  ).toHaveLength(0);
}
describe("fresh candidate facts for pinned regeneration", () => {
  it("cannot resurrect an entire itinerary from old snapshots when all current candidates disappear", async () => {
    const fixture = setup();
    fixture.current.places = [];
    fixture.current.activities = [];
    const response = await fixture.generate();
    expect(response.status).toBe(422);
    expect(fixture.deps.gemini.structured).not.toHaveBeenCalled();
    expect(fixture.planning.mock.calls.some((call) => call[1] === "fail")).toBe(
      true,
    );
    expectUncharged(fixture);
  });
  it.each(["removed", "unendorsed", "possibly_closed"] as const)(
    "rejects a %s local meal pin and releases its hold",
    async (state) => {
      const fixture = setup();
      const mealId = fixture.original.schedule.days[0].stops.find(
        (stop) => stop.purpose === "lunch",
      )!.candidateId;
      if (state === "removed")
        fixture.current.places = fixture.current.places.filter(
          (place) => place.id !== mealId,
        );
      else {
        const meal = fixture.current.places.find(
          (place) => place.id === mealId,
        )!;
        if (state === "unendorsed") meal.endorsements = [];
        else meal.possiblyClosed = true;
      }
      expect((await fixture.generate([mealId])).status).toBe(422);
      expect(fixture.deps.gemini.structured).not.toHaveBeenCalled();
      expectUncharged(fixture);
    },
  );
  it.each([{ hours: [] }, { hours: [{ open: "12:00", close: "18:00" }] }])(
    "current closure/opening intervals override an old open snapshot ($hours)",
    async ({ hours }) => {
      const fixture = setup();
      const pin = fixture.original.schedule.days[0].stops[0];
      fixture.original.catalog.find(
        (candidate) => candidate.id === pin.candidateId,
      )!.hours = { [input.startDate]: [{ open: "09:00", close: "21:00" }] };
      fixture.current.activities.find(
        (candidate) => candidate.id === pin.candidateId,
      )!.hours = { [input.startDate]: hours };
      const response = await fixture.generate([pin.candidateId]);
      expect(response.status).toBe(422);
      expect(fixture.deps.gemini.structured).not.toHaveBeenCalled();
      expectUncharged(fixture);
    },
  );
  it("retains pinned choices/times/private explanations but persists fresh source and place facts", async () => {
    const fixture = setup();
    fixture.current.activities = fixture.current.activities.flatMap(
      (candidate) => [candidate, structuredClone(candidate)],
    );
    const response = await fixture.generate();
    expect(response.status).toBe(201);
    for (const day of fixture.original.schedule.days)
      expect(
        response.body.schedule.days.find(
          (actual: { date: string }) => actual.date === day.date,
        ).stops,
      ).toEqual(expect.arrayContaining(day.stops));
    expect(
      response.body.catalog.every(
        (candidate: Candidate) => candidate.source.observedAt === freshTime,
      ),
    ).toBe(true);
    expect(
      response.body.catalog.some(
        (candidate: Candidate) => candidate.address === "Old saved address",
      ),
    ).toBe(false);
    expect(
      new Set(response.body.catalog.map((candidate: Candidate) => candidate.id))
        .size,
    ).toBe(response.body.catalog.length);
    expect(fixture.repository.places).toHaveBeenCalledOnce();
    expect(fixture.repository.places).toHaveBeenCalledWith(
      undefined,
      destination,
    );
    expect(fixture.deps.activities.search).toHaveBeenCalledOnce();
    expect(fixture.ledger).toEqual({ balance: 200, held: 0, debits: 1 });
  });
  it("blocks a newly flagged provider venue before regeneration", async () => {
    const fixture = setup();
    const pin = fixture.original.schedule.days[0].stops[0];
    fixture.current.activities.find(
      (candidate) => candidate.id === pin.candidateId,
    )!.possiblyClosed = true;
    expect((await fixture.generate([pin.candidateId])).status).toBe(422);
    expect(fixture.deps.gemini.structured).not.toHaveBeenCalled();
    expectUncharged(fixture);
  });
  it("does not fall back to saved candidates when current provider verification fails", async () => {
    const fixture = setup();
    fixture.deps.activities.search.mockRejectedValueOnce(
      new AppError(503, "ACTIVITY_SEARCH_UNAVAILABLE"),
    );
    expect((await fixture.generate()).status).toBe(503);
    expect(fixture.deps.gemini.structured).not.toHaveBeenCalled();
    expect(fixture.planning.mock.calls.some((call) => call[1] === "fail")).toBe(
      true,
    );
    expectUncharged(fixture);
  });
});
describe("freshness on free itinerary edits", () => {
  it("refuses removed selected places instead of reusing the saved catalog", async () => {
    const fixture = setup();
    fixture.current.places = [];
    const response = await fixture.save();
    expect(response.status).toBe(422);
    expect(response.body.issues).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_PLACE" }),
    );
    expect(fixture.planning.mock.calls.some((call) => call[1] === "save")).toBe(
      false,
    );
    expectUncharged(fixture);
  });
  it("refuses a selected venue that now has verified closed hours", async () => {
    const fixture = setup();
    fixture.current.activities[0].hours = { [input.startDate]: [] };
    const response = await fixture.save();
    expect(response.status).toBe(422);
    expect(response.body.issues).toContainEqual(
      expect.objectContaining({ code: "CLOSED_VENUE" }),
    );
    expectUncharged(fixture);
  });
  it("saves current facts, drops unavailable unselected choices, and makes no LP/model calls", async () => {
    const fixture = setup();
    const selected = new Set(
      fixture.original.schedule.days.flatMap((day) =>
        day.stops.map((stop) => stop.candidateId),
      ),
    );
    fixture.current.activities = fixture.current.activities.filter(
      (candidate) => selected.has(candidate.id),
    );
    const response = await fixture.save();
    expect(response.status).toBe(200);
    expect(response.body.schedule).toEqual(fixture.original.schedule);
    expect(
      response.body.catalog.every(
        (candidate: Candidate) => candidate.source.observedAt === freshTime,
      ),
    ).toBe(true);
    expect(
      response.body.catalog.some(
        (candidate: Candidate) => candidate.address === "Old saved address",
      ),
    ).toBe(false);
    expect(fixture.planning.mock.calls.map((call) => call[1])).toEqual([
      "get",
      "save",
    ]);
    expect(fixture.deps.gemini.structured).not.toHaveBeenCalled();
    expect(fixture.deps.destinations.verifySelection).toHaveBeenCalledWith(
      destination,
    );
    expectUncharged(fixture);
  });
  it("does not allow an edited stop outside the original authorized choice set", async () => {
    const fixture = setup();
    const schedule = structuredClone(fixture.original.schedule);
    schedule.days[0].stops[0].candidateId = "provider:unlisted-new-place";
    const response = await fixture.save(schedule);
    expect(response.status).toBe(422);
    expect(fixture.deps.destinations.verifySelection).not.toHaveBeenCalled();
    expect(fixture.deps.activities.search).not.toHaveBeenCalled();
    expectUncharged(fixture);
  });
  it("fails closed when a fresh provider lookup fails and does not save an old snapshot", async () => {
    const fixture = setup();
    fixture.deps.activities.search.mockRejectedValueOnce(
      new AppError(503, "ACTIVITY_SEARCH_UNAVAILABLE"),
    );
    expect((await fixture.save()).status).toBe(503);
    expect(fixture.planning.mock.calls.some((call) => call[1] === "save")).toBe(
      false,
    );
    expectUncharged(fixture);
  });
});
