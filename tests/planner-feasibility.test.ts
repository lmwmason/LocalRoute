import { describe, expect, it } from "vitest";
import { buildFeasibleBlueprint } from "../server/planner/feasibility";
import { evaluateSchedule, minutes, type Candidate } from "../shared/planner";
import { plannerInput } from "./fixtures/planning";

const date = plannerInput.startDate;
function candidate(
  id: string,
  kind: Candidate["kind"] = "attraction",
  hours?: Candidate["hours"],
): Candidate {
  return {
    id,
    name: id,
    kind,
    address: "Synthetic fixture",
    lat: 37.5455,
    lng: 127.053,
    tags: kind === "restaurant" ? ["korean"] : ["art"],
    source: {
      provider: "localroute",
      verification: "canonical",
      observedAt: "2026-10-17",
    },
    endorsements:
      kind === "restaurant" ? [{ versionId: `v-${id}`, text: "Fixture" }] : [],
    hours,
  };
}
const places = [
  candidate("r1", "restaurant"),
  candidate("r2", "restaurant"),
  candidate("a1"),
  candidate("a2"),
  candidate("a3"),
  candidate("a4"),
];
describe("deterministic itinerary feasibility before Gemini", () => {
  it.each([
    ["09:30", "20:00"],
    ["11:30", "15:30"],
    ["13:00", "16:00"],
  ])(
    "satisfies coffee and Korean food at %s–%s while retaining a non-food activity",
    (startTime, endTime) => {
      const input = {
        ...plannerInput,
        startTime,
        endTime,
        activities: ["coffee" as const],
      };
      const cafe = { ...candidate("coffee-stop", "cafe"), tags: ["coffee"] };
      const catalog = [...places, cafe];
      const blueprint = buildFeasibleBlueprint(input, catalog);
      expect(blueprint.candidateIds).toContain(cafe.id);
      expect(blueprint.slots.some((slot) => slot.purpose === "lunch")).toBe(
        true,
      );
      const schedule = {
        title: "Temporal fixture",
        summary: "Synthetic preference scheduling fixture.",
        days: [
          {
            date,
            stops: blueprint.slots.map((slot) => ({
              candidateId: slot.allowedCandidateIds[0],
              start: slot.start,
              end: slot.end,
              purpose: slot.purpose,
              explanation: "Synthetic scheduling fixture stop.",
            })),
          },
        ],
      };
      expect(evaluateSchedule(schedule, input, catalog).errors).toEqual([]);
    },
  );
  it("preserves a pinned meal whose valid start is before the window cutoff and end is later", () => {
    const plan = buildFeasibleBlueprint(
      { ...plannerInput, startTime: "11:30", endTime: "15:30" },
      places,
      [
        {
          date,
          stop: {
            candidateId: "r1",
            start: "13:45",
            end: "14:30",
            purpose: "lunch",
          },
        },
      ],
    );
    expect(plan.slots.find((slot) => slot.pinned)).toMatchObject({
      start: "13:45",
      end: "14:30",
    });
  });
  it("constructs ordered non-overlapping slots, real meal windows and the user buffer", () => {
    const plan = buildFeasibleBlueprint(plannerInput, places);
    expect(plan).toEqual(buildFeasibleBlueprint(plannerInput, places));
    expect(plan.slots.some((slot) => slot.purpose === "visit")).toBe(true);
    for (let i = 0; i < plan.slots.length; i++) {
      const slot = plan.slots[i];
      expect(minutes(slot.start)).toBeGreaterThanOrEqual(
        minutes(plannerInput.startTime),
      );
      expect(minutes(slot.end)).toBeLessThanOrEqual(
        minutes(plannerInput.endTime),
      );
      if (i)
        expect(
          minutes(slot.start) - minutes(plan.slots[i - 1].end),
        ).toBeGreaterThanOrEqual(plannerInput.transferBufferMinutes);
      if (slot.purpose === "lunch" || slot.purpose === "dinner") {
        expect(minutes(slot.end) - minutes(slot.start)).toBe(45);
        expect(minutes(slot.start)).toBeGreaterThanOrEqual(
          slot.purpose === "lunch" ? 660 : 1050,
        );
        expect(minutes(slot.end)).toBeLessThanOrEqual(
          slot.purpose === "lunch" ? 840 : 1230,
        );
      }
    }
    expect(
      new Set(plan.slots.flatMap((slot) => slot.allowedCandidateIds)).size,
    ).toBe(plan.slots.length);
    expect(plan.durationBasis).toBe("planned_visit_allocation");
    expect(plan.transferBasis).toBe("user_buffer_not_travel_estimate");
  });
  it("excludes confirmed closed venues per day and retains explicit unknown hours", () => {
    const closed = candidate("closed", "restaurant", { [date]: [] });
    const unknown = candidate("unknown", "restaurant");
    const plan = buildFeasibleBlueprint(plannerInput, [
      closed,
      unknown,
      places[1],
      ...places.slice(2),
    ]);
    expect(plan.candidateIds).not.toContain("closed");
    expect(
      plan.slots.filter((slot) => slot.unknownHoursCandidateIds.length),
    ).not.toHaveLength(0);
    const suspect = { ...candidate("suspect"), possiblyClosed: true };
    expect(
      buildFeasibleBlueprint(plannerInput, [...places, suspect]).candidateIds,
    ).not.toContain("suspect");
  });
  it("only selects visits fully inside known hours and respects last entry/order", () => {
    const catalog = [
      candidate("lunch", "restaurant", {
        [date]: [{ open: "12:03", close: "12:48", lastOrder: "12:03" }],
      }),
      candidate("dinner", "restaurant", {
        [date]: [{ open: "18:07", close: "18:52", lastOrder: "18:07" }],
      }),
      candidate("gallery", "culture", {
        [date]: [{ open: "09:47", close: "10:47", lastEntry: "09:47" }],
      }),
    ];
    const plan = buildFeasibleBlueprint(plannerInput, catalog);
    for (const slot of plan.slots) {
      const place = catalog.find(
        (place) => place.id === slot.allowedCandidateIds[0],
      )!;
      const interval = place.hours![date][0];
      expect(minutes(slot.start)).toBeGreaterThanOrEqual(
        minutes(interval.open),
      );
      expect(minutes(slot.end)).toBeLessThanOrEqual(minutes(interval.close));
      expect(slot.unknownHoursCandidateIds).toEqual([]);
    }
    expect(plan.slots.find((slot) => slot.purpose === "lunch")?.start).toBe(
      "12:03",
    );
  });
  it("fails deterministically when all meal venues are closed or their visits cannot fit", () => {
    for (const hours of [
      [],
      [{ open: "12:00", close: "12:20" }],
      [{ open: "12:00", close: "14:00", lastOrder: "11:00" }],
    ])
      expect(() =>
        buildFeasibleBlueprint(plannerInput, [
          candidate("closed1", "restaurant", { [date]: hours }),
          candidate("closed2", "restaurant", { [date]: hours }),
          ...places.slice(2),
        ]),
      ).toThrow("SCHEDULE_CONSTRAINTS_INFEASIBLE");
  });
  it("preserves exact pins, rejects conflicts before a model call, and keeps pace soft", () => {
    const pin = {
      date,
      stop: {
        candidateId: "a1",
        start: "10:00",
        end: "11:00",
        purpose: "visit" as const,
      },
    };
    const plan = buildFeasibleBlueprint(
      { ...plannerInput, pace: "relaxed" },
      places,
      [pin],
    );
    expect(plan.slots.find((slot) => slot.pinned)).toMatchObject({
      date,
      start: "10:00",
      end: "11:00",
      allowedCandidateIds: ["a1"],
    });
    expect(() =>
      buildFeasibleBlueprint(plannerInput, places, [
        pin,
        {
          date,
          stop: {
            ...pin.stop,
            candidateId: "a2",
            start: "10:30",
            end: "11:30",
          },
        },
      ]),
    ).toThrow("SCHEDULE_CONSTRAINTS_INFEASIBLE");
    expect(() =>
      buildFeasibleBlueprint(plannerInput, places, [
        { date, stop: { ...pin.stop, candidateId: "missing" } },
      ]),
    ).toThrow("SCHEDULE_CONSTRAINTS_INFEASIBLE");
  });
  it("supports up to five days with disclosed repeated candidates and different date closures", () => {
    const input = { ...plannerInput, endDate: "2026-11-05" };
    const plan = buildFeasibleBlueprint(input, places);
    expect(new Set(plan.slots.map((slot) => slot.date)).size).toBe(5);
    expect(() =>
      buildFeasibleBlueprint({ ...input, endDate: "2026-11-06" }, places),
    ).toThrow("SCHEDULE_CONSTRAINTS_INFEASIBLE");
  });
});
