import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Place } from "../shared/domain";
import {
  evaluateSchedule,
  isMealCandidate,
  type Candidate,
} from "../shared/planner";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { localCandidates } from "../server/planner/catalog";
import { generateValidated } from "../server/planner/generate";
import type { Gemini } from "../server/gemini";
import { plannerInput } from "./fixtures/planning";
import { blueprintResponse } from "./fixtures/blueprint-response";

function initialPlaces(): Place[] {
  return demoCatalog.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    kind: candidate.kind,
    category: candidate.tags.includes("korean")
      ? "한식"
      : candidate.tags.includes("japanese")
        ? "일식"
        : candidate.tags.includes("western")
          ? "양식"
          : candidate.kind === "cafe"
            ? "카페"
            : "여행 장소",
    address: candidate.address,
    lat: candidate.lat,
    lng: candidate.lng,
    tags: [...candidate.tags],
    source: "localroute",
    endorsements: [],
    rating: null,
    reviewCount: 0,
    observedAt: "2026-10-17T04:00:00Z",
    officialSources: [
      {
        url: "https://example.test/official-fixture",
        observedAt: "2026-10-17T04:00:00Z",
      },
    ],
  }));
}
const starterCatalog = () =>
  localCandidates(initialPlaces(), plannerInput, { allowStarter: true });

describe("explicit operator starter catalog", () => {
  it("matches activities from verified public place categories when the starter listing has no authored tags", () => {
    const places = initialPlaces().slice(0, 3);
    places[0].category = "도시공원";
    places[1].category = "박물관";
    places[2].category = "미술관";
    for (const place of places) {
      place.tags = [];
      place.kind = "attraction";
    }
    const catalog = localCandidates(places, plannerInput, {
      allowStarter: true,
    });
    expect(catalog.map((candidate) => candidate.tags)).toEqual([
      ["nature"],
      ["history"],
      ["art"],
    ]);
    expect(
      catalog.every((candidate) => candidate.endorsements.length === 0),
    ).toBe(true);
  });
  it("keeps official listings out of the independent recommendation pool by default", () => {
    const places = initialPlaces();
    expect(localCandidates(places, plannerInput)).toEqual([]);
    expect(
      localCandidates(places, plannerInput, { allowStarter: false }),
    ).toEqual([]);
    expect(places.every((place) => place.endorsements.length === 0)).toBe(true);
  });

  it("opts in only source-backed listings and keeps their true provenance and empty feedback", () => {
    const places = initialPlaces();
    places[0].officialSources = [];
    const candidates = localCandidates(places, plannerInput, {
      allowStarter: true,
    });
    expect(candidates.some((candidate) => candidate.id === places[0].id)).toBe(
      false,
    );
    for (const candidate of candidates) {
      expect(candidate.starterRecommendation).toBe(true);
      expect(candidate.endorsements).toEqual([]);
      expect(candidate.photo).toBeUndefined();
      expect(candidate.officialSources).toEqual(places[1].officialSources);
      expect(candidate.source).toMatchObject({
        provider: "localroute",
        verification: "canonical",
        url: "https://example.test/official-fixture",
      });
    }
  });

  it("retains independent endorsements without relabeling them as starter recommendations", () => {
    const places = initialPlaces();
    places[0].endorsements = [
      {
        id: "fixture-endorsement",
        versionId: "fixture-version",
        author: "Fixture contributor",
        text: "A genuine independent fixture endorsement.",
        helpfulCount: 0,
      },
    ];
    for (const allowStarter of [false, true]) {
      const candidate = localCandidates(places, plannerInput, {
        allowStarter,
      }).find((item) => item.id === places[0].id)!;
      expect(candidate.starterRecommendation).toBeUndefined();
      expect(candidate.endorsements).toEqual([
        {
          versionId: "fixture-version",
          text: "A genuine independent fixture endorsement.",
        },
      ]);
    }
  });

  it("never resurrects a demo, distant or possibly closed source-backed listing", () => {
    const places = initialPlaces();
    places[0].source = "demo";
    places[1].lat = 35;
    places[2].possiblyClosed = true;
    places[3].externalIds = [
      {
        provider: "heyyumi",
        externalId: "fixture",
        possiblyClosed: true,
        observedAt: null,
      },
    ];
    const ids = localCandidates(places, plannerInput, {
      allowStarter: true,
    }).map((candidate) => candidate.id);
    expect(ids).not.toEqual(
      expect.arrayContaining(places.slice(0, 4).map((place) => place.id)),
    );
    for (const place of places.slice(0, 4)) expect(ids).not.toContain(place.id);
  });
});

describe("honest starter meal validation", () => {
  it("allows starter meals with explicit warnings while counting zero independent local meals", () => {
    const catalog = starterCatalog(),
      schedule = demoSchedule(plannerInput);
    const result = evaluateSchedule(schedule, plannerInput, catalog);
    expect(result.valid).toBe(true);
    expect(result.checks.localMeals).toBe(0);
    expect(
      result.warnings.filter(
        (warning) => warning.code === "STARTER_RECOMMENDATION",
      ),
    ).toHaveLength(schedule.days[0].stops.length);
    expect(
      catalog.every((candidate) => candidate.endorsements.length === 0),
    ).toBe(true);
  });

  it("counts only a genuine independent meal in a mixed schedule", () => {
    const catalog = starterCatalog();
    const lunch = catalog.find(
      (candidate) => candidate.id === demoCatalog[0].id,
    )!;
    delete lunch.starterRecommendation;
    lunch.endorsements = [
      { versionId: "fixture-version", text: "Independent fixture feedback." },
    ];
    const result = evaluateSchedule(
      demoSchedule(plannerInput),
      plannerInput,
      catalog,
    );
    expect(result.valid).toBe(true);
    expect(result.checks.localMeals).toBe(1);
  });

  it.each(["kakao", "demo", "not-canonical"])(
    "does not let a starter flag bypass canonical source requirements: %s",
    (kind) => {
      const catalog = starterCatalog(),
        lunch = catalog.find(
          (candidate) => candidate.id === demoCatalog[0].id,
        )!;
      if (kind === "not-canonical") lunch.source.verification = "provider";
      else lunch.source.provider = kind as Candidate["source"]["provider"];
      expect(isMealCandidate(lunch)).toBe(false);
      expect(
        evaluateSchedule(
          demoSchedule(plannerInput),
          plannerInput,
          catalog,
        ).errors.map((error) => error.code),
      ).toContain("LOCAL_MEAL_REQUIRED");
    },
  );

  it("retains closed-hours, meal-time and duplicate-stop protections", () => {
    const catalog = starterCatalog(),
      schedule = demoSchedule(plannerInput);
    const lunch = catalog.find(
      (candidate) => candidate.id === demoCatalog[0].id,
    )!;
    lunch.hours = { [plannerInput.startDate]: [] };
    expect(
      evaluateSchedule(schedule, plannerInput, catalog).errors.map(
        (error) => error.code,
      ),
    ).toContain("CLOSED_VENUE");
    delete lunch.hours;
    schedule.days[0].stops[1].start = "10:45";
    expect(
      evaluateSchedule(schedule, plannerInput, catalog).errors.map(
        (error) => error.code,
      ),
    ).toContain("MEAL_WINDOW");
    schedule.days[0].stops[2].candidateId =
      schedule.days[0].stops[0].candidateId;
    expect(
      evaluateSchedule(schedule, plannerInput, catalog).errors.map(
        (error) => error.code,
      ),
    ).toContain("DUPLICATE_STOP");
  });

  it("still rejects an ordinary unendorsed restaurant without the explicit starter flag", () => {
    const catalog = starterCatalog();
    for (const candidate of catalog) delete candidate.starterRecommendation;
    expect(
      evaluateSchedule(
        demoSchedule(plannerInput),
        plannerInput,
        catalog,
      ).errors.map((error) => error.code),
    ).toContain("LOCAL_MEAL_REQUIRED");
  });
});

describe("starter-aware Gemini boundary", () => {
  it("passes honest endorsement counts and starter flags without sending source metadata or inventing endorsements", async () => {
    const catalog = starterCatalog(),
      inputs: unknown[] = [],
      systems: string[] = [];
    const model: Pick<Gemini, "structured"> = {
      structured: async <T>(
        schema: z.ZodType<T>,
        system: string,
        input: unknown,
      ) => {
        systems.push(system);
        inputs.push(input);
        return schema.parse(
          blueprintResponse(demoSchedule(plannerInput), input),
        );
      },
    };
    const result = await generateValidated(model, plannerInput, catalog);
    expect(result.evaluation.valid).toBe(true);
    expect(result.evaluation.checks.localMeals).toBe(0);
    expect(
      (inputs[0] as { candidates: Record<string, unknown>[] }).candidates.every(
        (candidate) =>
          candidate.localEndorsementCount === 0 &&
          candidate.starterRecommendation === true,
      ),
    ).toBe(true);
    expect(JSON.stringify(inputs)).not.toContain("official-fixture");
    expect(systems[0]).toContain(
      "NOT independent local endorsements or verified personal visits",
    );
    expect(systems[0]).toContain(
      "positive localEndorsementCount OR starterRecommendation=true",
    );
  });

  it("rejects insufficient starter meals before a model call", async () => {
    const structured = vi.fn();
    const catalog = starterCatalog().filter(
      (candidate) =>
        candidate.kind !== "restaurant" || candidate.id === demoCatalog[0].id,
    );
    await expect(
      generateValidated({ structured }, plannerInput, catalog),
    ).rejects.toMatchObject({ message: "INSUFFICIENT_CANDIDATES" });
    expect(structured).not.toHaveBeenCalled();
  });
});
