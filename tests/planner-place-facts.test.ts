import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approvedPlaceHours,
  hoursFactSchema,
  placeExternalIds,
} from "../shared/place-facts";
import { correctionSchema } from "../shared/community";
import { demoPlaces } from "../shared/demo";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { evaluateSchedule, type Candidate } from "../shared/planner";
import type { Place } from "../shared/domain";
import {
  deduplicateCandidates,
  localCandidates,
} from "../server/planner/catalog";
import { SupabaseRepository } from "../server/repository";
import { readConfig } from "../server/config";
import { plannerInput } from "./fixtures/planning";

const now = Date.parse("2026-10-17T04:00:00Z"),
  date = plannerInput.startDate;
const open = {
  timezone: "Asia/Seoul",
  dates: { [date]: [{ open: "09:00", close: "22:00" }] },
};
function fact(overrides: Record<string, unknown> = {}) {
  return {
    id: "fact-1",
    field: "hours",
    source: "owner",
    status: "approved",
    observed_at: new Date(now).toISOString(),
    value: open,
    ...overrides,
  };
}
function place(overrides: Partial<Place> = {}): Place {
  return {
    ...structuredClone(demoPlaces[0]),
    source: "localroute",
    endorsements: [
      {
        id: "endorsement-1",
        versionId: "version-1",
        author: "Local contributor",
        text: "A real local recommendation.",
        helpfulCount: 0,
      },
    ],
    ...overrides,
  };
}
afterEach(() => vi.restoreAllMocks());

describe("strict dated place hours", () => {
  it("preserves explicit closure, service intervals and known entry/order cutoffs", () => {
    const value = {
      timezone: "Asia/Seoul",
      dates: {
        [date]: [
          {
            open: "09:00",
            close: "14:00",
            lastEntry: "13:00",
            lastOrder: "13:15",
          },
          { open: "17:00", close: "21:00" },
        ],
        "2026-11-02": [],
      },
    };
    const result = approvedPlaceHours(
      [fact({ value: JSON.stringify(value) })],
      now,
    );
    expect(result.hours).toEqual(value.dates);
    expect(result.hoursProvenance?.[date]).toEqual({
      source: "owner",
      factId: "fact-1",
      observedAt: new Date(now).toISOString(),
    });
    expect(result.hours?.["2026-11-02"]).toEqual([]);
  });

  it.each([
    { timezone: "UTC", dates: open.dates },
    { timezone: "Asia/Seoul", dates: { "2026-02-30": [] } },
    { timezone: "Asia/Seoul", dates: {} },
    {
      timezone: "Asia/Seoul",
      dates: { [date]: [{ open: "22:00", close: "02:00" }] },
    },
    {
      timezone: "Asia/Seoul",
      dates: {
        [date]: [{ open: "09:00", close: "14:00", lastOrder: "15:00" }],
      },
    },
    {
      timezone: "Asia/Seoul",
      dates: {
        [date]: [
          { open: "09:00", close: "14:00" },
          { open: "13:00", close: "21:00" },
        ],
      },
    },
    {
      timezone: "Asia/Seoul",
      dates: { [date]: [{ open: "09:00", close: "14:00", inferred: true }] },
    },
    "Mon–Fri 09:00–22:00",
  ])("rejects malformed, inferred or free-form hours %j", (value) => {
    expect(hoursFactSchema.safeParse(value).success).toBe(false);
    expect(approvedPlaceHours([fact({ value })], now)).toEqual({});
  });

  it.each([
    { status: "pending" },
    { status: "rejected" },
    { source: "gemini" },
    { observed_at: new Date(now + 1).toISOString() },
    { observed_at: new Date(now - 30 * 86400000 - 1).toISOString() },
    { observed_at: "not-a-timestamp" },
  ])(
    "never supplies unapproved, AI, stale or future facts: %j",
    (overrides) => {
      expect(approvedPlaceHours([fact(overrides)], now)).toEqual({});
    },
  );

  it("includes the exact 30-day freshness boundary", () => {
    expect(
      approvedPlaceHours(
        [fact({ observed_at: new Date(now - 30 * 86400000).toISOString() })],
        now,
      ).hours,
    ).toEqual(open.dates);
  });

  it("uses the latest approved fact separately for each date", () => {
    const old = fact({
      id: "old",
      observed_at: new Date(now - 1000).toISOString(),
      value: {
        timezone: "Asia/Seoul",
        dates: { ...open.dates, "2026-11-02": [] },
      },
    });
    const latest = fact({
      id: "latest",
      value: { timezone: "Asia/Seoul", dates: { [date]: [] } },
    });
    const result = approvedPlaceHours([old, latest], now);
    expect(result.hours).toEqual({ [date]: [], "2026-11-02": [] });
    expect(result.hoursProvenance?.[date].factId).toBe("latest");
    expect(result.hoursProvenance?.["2026-11-02"].factId).toBe("old");
  });

  it.each([
    {
      value: {
        timezone: "Asia/Seoul",
        dates: { [date]: [{ open: "13:00", close: "12:00" }] },
      },
    },
    { value: "Unstructured replacement hours" },
    { observed_at: new Date(now + 1).toISOString() },
  ])(
    "does not resurrect an older open fact after a newer invalid fact: %j",
    (overrides) => {
      const old = fact({
        id: "old",
        observed_at: new Date(now - 1000).toISOString(),
      });
      expect(
        approvedPlaceHours([old, fact({ id: "latest", ...overrides })], now),
      ).toEqual({});
    },
  );

  it("treats conflicting facts with identical observation timestamps as unknown", () => {
    expect(
      approvedPlaceHours(
        [
          fact({ id: "a" }),
          fact({
            id: "b",
            value: { timezone: "Asia/Seoul", dates: { [date]: [] } },
          }),
        ],
        now,
      ),
    ).toEqual({});
  });

  it("serializes an evidence-backed correction within the existing text contract", () => {
    const value = JSON.stringify(hoursFactSchema.parse(open));
    expect(value.length).toBeLessThanOrEqual(1000);
    const request = {
      requestId: "00000000-0000-4000-8000-000000000009",
      placeId: demoPlaces[0].id,
      field: "hours",
      value,
      evidence: "Published on the official venue website today.",
      contact: "",
      consent: true,
    };
    expect(correctionSchema.safeParse(request).success).toBe(true);
    expect(
      correctionSchema.safeParse({ ...request, evidence: "" }).success,
    ).toBe(false);
  });
});

describe("place facts through planning candidates", () => {
  it("carries approved closure, breaks and last order into deterministic validation", () => {
    const schedule = demoSchedule(plannerInput);
    const scenarios = [
      [],
      [
        { open: "09:00", close: "11:00" },
        { open: "14:00", close: "22:00" },
      ],
      [{ open: "09:00", close: "22:00", lastOrder: "11:59" }],
    ];
    for (const intervals of scenarios) {
      const facts = approvedPlaceHours(
        [
          fact({
            value: { timezone: "Asia/Seoul", dates: { [date]: intervals } },
          }),
        ],
        now,
      );
      const candidates = localCandidates([place(facts)], plannerInput);
      expect(candidates[0].hours).toEqual(facts.hours);
      expect(candidates[0].hoursProvenance).toEqual(facts.hoursProvenance);
      const catalog = demoCatalog.map((candidate) =>
        candidate.id === candidates[0].id ? candidates[0] : candidate,
      );
      expect(
        evaluateSchedule(schedule, plannerInput, catalog).errors.map(
          (issue) => issue.code,
        ),
      ).toContain("CLOSED_VENUE");
    }
  });

  it("keeps unavailable hours unknown and possible closure conservative", () => {
    const facts = approvedPlaceHours([fact({ source: "gemini" })], now);
    const candidate = localCandidates([place(facts)], plannerInput)[0];
    expect(candidate.hours).toBeUndefined();
    const catalog = demoCatalog.map((item) =>
      item.id === candidate.id ? candidate : item,
    );
    expect(
      evaluateSchedule(
        demoSchedule(plannerInput),
        plannerInput,
        catalog,
      ).warnings.map((issue) => issue.code),
    ).toContain("HOURS_UNKNOWN");
    const externalIds = placeExternalIds([
      {
        provider: "heyyumi",
        external_id: "restaurant-1",
        possibly_closed: true,
        observed_at: null,
      },
    ]);
    expect(localCandidates([place({ externalIds })], plannerInput)).toEqual([]);
  });
});

describe("verified external identity deduplication", () => {
  const mapped = () =>
    place({
      externalIds: [
        {
          provider: "kakao",
          externalId: "123",
          possiblyClosed: false,
          observedAt: null,
        },
      ],
    });
  const external = (): Candidate => ({
    ...structuredClone(demoCatalog[0]),
    id: "kakao:123",
    source: {
      provider: "kakao",
      externalId: "123",
      verification: "provider",
      observedAt: new Date(now).toISOString(),
    },
  });
  it("prefers the canonical candidate only with an exact persisted provider mapping", () => {
    const canonical = localCandidates([mapped()], plannerInput)[0];
    expect(deduplicateCandidates([external(), canonical], [mapped()])).toEqual([
      canonical,
    ]);
    expect(deduplicateCandidates([external()], [mapped()])).toHaveLength(1);
  });
  it("never merges matching names, addresses or coordinates without a verified mapping", () => {
    const canonical = localCandidates([place()], plannerInput)[0];
    expect(
      deduplicateCandidates([external(), canonical], [place()]),
    ).toHaveLength(2);
  });
  it("does not let discovery resurrect a mapped place flagged as possibly closed", () => {
    const closed = mapped();
    closed.externalIds![0].possiblyClosed = true;
    expect(deduplicateCandidates([external()], [closed])).toEqual([]);
  });
});

class MockQuery {
  constructor(
    private data: unknown,
    readonly selected: string[] = [],
  ) {}
  select(columns: string) {
    this.selected.push(columns);
    return this;
  }
  eq() {
    return this;
  }
  limit() {
    return this;
  }
  in() {
    return this;
  }
  order() {
    return this;
  }
  then(resolve: (value: { data: unknown; error: null }) => unknown) {
    return Promise.resolve({ data: this.data, error: null }).then(resolve);
  }
}

describe("anonymous RLS repository facts boundary", () => {
  it("loads only the public query path and preserves approved-photo behavior", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const config = readConfig({
      VITE_DATA_MODE: "live",
      VITE_SUPABASE_URL: "https://pjdawapasozsrpnrtsfx.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture_public_key",
      SUPABASE_SERVICE_ROLE_KEY: "fixture-server-only-key",
    });
    const repository = new SupabaseRepository(config),
      selected: string[] = [];
    const rawPlace = {
      ...place(),
      kind: "restaurant",
      created_at: new Date(now).toISOString(),
      place_reviews: [],
      place_facts: [
        fact({
          value: JSON.stringify({
            timezone: "Asia/Seoul",
            dates: { [date]: [] },
          }),
        }),
      ],
      place_external_ids: [
        {
          provider: "kakao",
          external_id: "123",
          possibly_closed: false,
          observed_at: null,
        },
      ],
      endorsements: [
        {
          id: "endorsement-1",
          user_id: "user-1",
          endorsement_versions: [
            {
              id: "version-1",
              text: "Independent recommendation",
              endorsement_ratings: [],
            },
          ],
        },
      ],
    };
    const publicFrom = vi.fn(
      (table: string) =>
        new MockQuery(
          table === "places"
            ? [rawPlace]
            : [
                {
                  user_id: "user-1",
                  display_name: "Local contributor",
                  local_area_label: null,
                },
              ],
          selected,
        ),
    );
    const adminFrom = vi.fn(
      () =>
        new MockQuery([
          { id: "photo-1", place_id: rawPlace.id, width: 600, height: 400 },
        ]),
    );
    Object.assign(repository, {
      auth: { from: publicFrom },
      admin: { from: adminFrom },
    });
    const places = await repository.places();
    expect(places[0].hours).toEqual({ [date]: [] });
    expect(places[0].hoursProvenance?.[date].source).toBe("owner");
    expect(places[0].externalIds?.[0].externalId).toBe("123");
    expect(places[0].photo).toMatchObject({
      id: "photo-1",
      review: "approved",
      source: "contributor",
    });
    expect(selected[0]).toContain(
      "place_facts(id,field,value,source,status,observed_at)",
    );
    expect(selected[0]).toContain(
      "place_external_ids(provider,external_id,possibly_closed,observed_at)",
    );
    expect(adminFrom.mock.calls).toEqual([["place_photos"]]);
    expect(publicFrom.mock.calls.map(([table]) => table)).toEqual([
      "places",
      "curator_identities",
    ]);
  });
});
