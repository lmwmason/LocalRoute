import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateValidated } from "../server/planner/generate";
import type { Gemini } from "../server/gemini";
import {
  evaluateSchedule,
  requiredMeals,
  type Schedule,
  type TripInput,
} from "../shared/planner";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { plannerInput } from "./fixtures/planning";

describe("meal coverage windows", () => {
  it.each([
    ["08:00", "11:00", false, false],
    ["08:30", "12:29", false, false],
    ["08:30", "12:30", true, false],
    ["10:00", "13:30", true, false],
    ["12:30", "15:30", true, false],
    ["12:31", "15:31", false, false],
    ["14:00", "18:59", false, false],
    ["14:00", "19:00", false, true],
    ["16:00", "19:30", false, true],
    ["19:00", "22:00", false, true],
    ["19:01", "22:01", false, false],
  ])(
    "requires meals for %s–%s according to 90-minute overlap",
    (startTime, endTime, lunch, dinner) => {
      expect(requiredMeals({ startTime, endTime })).toEqual({ lunch, dinner });
    },
  );

  function shortSchedule(input: TripInput): Schedule {
    const schedule = demoSchedule(input);
    schedule.days[0].stops = [
      {
        candidateId: "demo-culture-1",
        start: input.startTime,
        end: input.startTime === "10:00" ? "11:00" : "17:00",
        purpose: "visit",
        explanation: "A nearby cultural stop with verified candidate identity.",
      },
      {
        candidateId: "demo-park-1",
        start: input.startTime === "10:00" ? "11:20" : "17:20",
        end: input.startTime === "10:00" ? "12:20" : "18:20",
        purpose: "visit",
        explanation: "An unhurried walk with time between the selected stops.",
      },
    ];
    return schedule;
  }

  it.each([
    ["10:00", "13:30", "LUNCH_COVERAGE"],
    ["16:00", "19:30", "DINNER_COVERAGE"],
  ])(
    "rejects the reproduced meal-free %s–%s schedule",
    (startTime, endTime, code) => {
      const input = { ...plannerInput, startTime, endTime, foodTypes: [] };
      const result = evaluateSchedule(shortSchedule(input), input, demoCatalog);
      expect(result.errors).toEqual([{ code, day: input.startDate }]);
    },
  );

  it("accepts a realistic 45-minute lunch within the partial meal window", () => {
    const input = { ...plannerInput, startTime: "10:00", endTime: "13:30" };
    const schedule = shortSchedule(input);
    schedule.days[0].stops.splice(1, 0, {
      candidateId: demoCatalog[0].id,
      start: "11:20",
      end: "12:05",
      purpose: "lunch",
      explanation: "A locally endorsed lunch with sufficient time to eat.",
    });
    Object.assign(schedule.days[0].stops[2], { start: "12:25", end: "13:10" });
    expect(evaluateSchedule(schedule, input, demoCatalog).valid).toBe(true);
    schedule.days[0].stops[1].end = "12:04";
    expect(
      evaluateSchedule(schedule, input, demoCatalog).errors.map(
        (issue) => issue.code,
      ),
    ).toContain("MEAL_WINDOW");
  });

  it("avoids a model call when distinct endorsed restaurants cannot cover required meals", async () => {
    const structured = vi.fn();
    const catalog = demoCatalog.filter(
      (candidate) =>
        candidate.kind !== "restaurant" || candidate.id === demoCatalog[0].id,
    );
    await expect(
      generateValidated({ structured }, plannerInput, catalog),
    ).rejects.toMatchObject({ message: "INSUFFICIENT_CANDIDATES" });
    expect(structured).not.toHaveBeenCalled();
  });

  it("rejects repeated meal-free model proposals rather than returning an approved result", async () => {
    const input = {
      ...plannerInput,
      startTime: "10:00",
      endTime: "13:30",
      foodTypes: [],
    };
    let calls = 0;
    const model: Pick<Gemini, "structured"> = {
      structured: async <T>(schema: z.ZodType<T>) => {
        calls++;
        return schema.parse(shortSchedule(input));
      },
    };
    await expect(
      generateValidated(model, input, demoCatalog),
    ).rejects.toMatchObject({ message: "SCHEDULE_QUALITY_FAILED" });
    expect(calls).toBe(2);
  });
});

describe("independent activity and food preferences", () => {
  it.each([
    ["11:00", true],
    ["11:44", true],
    ["11:45", false],
  ])("handles food preference when morning window ends %s", (endTime, soft) => {
    const input = {
      ...plannerInput,
      purpose: "food" as const,
      activities: ["food" as const],
      startTime: "08:00",
      endTime,
    };
    const schedule = demoSchedule(input);
    schedule.days[0].stops = [
      {
        candidateId: "demo-culture-1",
        start: "08:00",
        end: "09:00",
        purpose: "visit",
        explanation:
          "Start with a cultural stop before visiting the restaurant.",
      },
      {
        candidateId: demoCatalog[0].id,
        start: "09:20",
        end: "10:20",
        purpose: "visit",
        explanation: "A restaurant visit outside the scheduled meal windows.",
      },
    ];
    const result = evaluateSchedule(schedule, input, demoCatalog);
    expect(result.valid).toBe(soft);
    expect(
      result.errors.some(
        (issue) => issue.code === "ACTIVITY_PREFERENCES_NOT_MATCHED",
      ),
    ).toBe(false);
    if (soft)
      expect(result.warnings.map((issue) => issue.code)).toContain(
        "FOOD_PREFERENCE_UNAVAILABLE",
      );
    else
      expect(result.errors.map((issue) => issue.code)).toContain(
        "FOOD_PREFERENCES_NOT_MATCHED",
      );
  });

  it("maps the food activity to restaurant kind without requiring a literal food tag", () => {
    const input = {
      ...plannerInput,
      purpose: "food" as const,
      activities: ["food" as const],
      foodTypes: [],
    };
    const result = evaluateSchedule(demoSchedule(input), input, demoCatalog);
    expect(result.valid).toBe(true);
    expect(result.checks.preferenceMatches).toBe(2);
  });

  it("does not let Japanese meals hide omission of available history activities", () => {
    const input = {
      ...plannerInput,
      purpose: "culture" as const,
      activities: ["history" as const],
      foodTypes: ["japanese" as const],
    };
    const result = evaluateSchedule(demoSchedule(input), input, demoCatalog);
    expect(result.errors.map((issue) => issue.code)).toEqual([
      "ACTIVITY_PREFERENCES_NOT_MATCHED",
    ]);
  });

  it("does not let matching art activities hide omission of available Western meals", () => {
    const input = {
      ...plannerInput,
      activities: ["art" as const],
      foodTypes: ["western" as const],
    };
    const result = evaluateSchedule(demoSchedule(input), input, demoCatalog);
    expect(result.errors.map((issue) => issue.code)).toEqual([
      "FOOD_PREFERENCES_NOT_MATCHED",
    ]);
  });

  it.each([
    { activities: ["art" as const], foodTypes: [] },
    { activities: [], foodTypes: ["japanese" as const] },
    {
      activities: ["history" as const, "art" as const],
      foodTypes: ["western" as const, "korean" as const],
    },
    { activities: [], foodTypes: [] },
  ])(
    "allows optional choices and at least one match within each selected dimension: %j",
    (preferences) => {
      const input = { ...plannerInput, ...preferences };
      expect(
        evaluateSchedule(demoSchedule(input), input, demoCatalog).valid,
      ).toBe(true);
    },
  );

  it("warns rather than inventing or rejecting unavailable soft preferences", () => {
    const input = {
      ...plannerInput,
      activities: ["hotspots" as const],
      foodTypes: ["western" as const],
    };
    const catalog = demoCatalog.filter(
      (candidate) => !candidate.tags.includes("western"),
    );
    const result = evaluateSchedule(demoSchedule(input), input, catalog);
    expect(result.valid).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "ACTIVITY_PREFERENCE_UNAVAILABLE",
        "FOOD_PREFERENCE_UNAVAILABLE",
      ]),
    );
  });

  it("requires a preferred food restaurant to be selected as a meal rather than a visit", () => {
    const input = { ...plannerInput, foodTypes: ["western" as const] };
    const schedule = demoSchedule(input);
    schedule.days[0].stops[3].candidateId = demoCatalog.find((candidate) =>
      candidate.tags.includes("western"),
    )!.id;
    const result = evaluateSchedule(schedule, input, demoCatalog);
    expect(result.errors.map((issue) => issue.code)).toContain(
      "FOOD_PREFERENCES_NOT_MATCHED",
    );
  });

  it("applies preference matching across the trip while still requiring meals on every day", () => {
    const input = {
      ...plannerInput,
      endDate: "2026-11-02",
      activities: ["history" as const],
    };
    const catalog = structuredClone(demoCatalog);
    catalog
      .find((candidate) => candidate.id === "demo-culture-1")!
      .tags.push("history");
    const secondCatalog = demoCatalog.map((candidate) => ({
      ...structuredClone(candidate),
      id: `${candidate.id}-day2`,
    }));
    const schedule = demoSchedule(input),
      secondDay = structuredClone(schedule.days[0]);
    secondDay.date = input.endDate;
    for (const stop of secondDay.stops) stop.candidateId += "-day2";
    schedule.days.push(secondDay);
    expect(
      evaluateSchedule(schedule, input, [...catalog, ...secondCatalog]).valid,
    ).toBe(true);
    secondDay.stops = secondDay.stops.filter(
      (stop) => stop.purpose !== "lunch",
    );
    expect(
      evaluateSchedule(schedule, input, [...catalog, ...secondCatalog]).errors,
    ).toContainEqual({ code: "LUNCH_COVERAGE", day: input.endDate });
  });
});
