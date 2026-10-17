import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { evaluateSchedule, tripSchema } from "../shared/planner";
import { generateValidated } from "../server/planner/generate";
import type { Gemini } from "../server/gemini";
import { plannerInput } from "./fixtures/planning";
describe("server schedule quality pipeline", () => {
  it("accepts a grounded schedule and distinguishes unknown facts from calculated straight-line checks", () => {
    const result = evaluateSchedule(
      demoSchedule(plannerInput),
      plannerInput,
      demoCatalog,
    );
    expect(result.valid).toBe(true);
    expect(result.checks.localMeals).toBe(2);
    expect(result.warnings.some((w) => w.code === "HOURS_UNKNOWN")).toBe(true);
    expect(
      result.warnings.some((w) => w.code === "ROUTE_TIME_UNAVAILABLE"),
    ).toBe(true);
  });
  it.each([
    "UNKNOWN_PLACE",
    "DUPLICATE_STOP",
    "TIME_CONFLICT",
    "MEAL_WINDOW",
    "TIME_BOUNDS",
    "INVALID_FORMAT",
  ])(`rejects %s`, (code) => {
    const schedule = demoSchedule(plannerInput),
      stops = schedule.days[0].stops;
    if (code === "UNKNOWN_PLACE") stops[0].candidateId = "invented-venue";
    if (code === "DUPLICATE_STOP") stops[2].candidateId = stops[0].candidateId;
    if (code === "TIME_CONFLICT") stops[1].start = "10:00";
    if (code === "MEAL_WINDOW") stops[1].start = "10:45";
    if (code === "TIME_BOUNDS") stops.at(-1)!.end = "22:00";
    if (code === "INVALID_FORMAT") stops[0].start = "";
    const result = evaluateSchedule(schedule, plannerInput, demoCatalog);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain(code);
  });
  it("rejects known closed venues, unrealistic travel and unverified strict dietary restrictions", () => {
    const schedule = demoSchedule(plannerInput);
    const closed = structuredClone(demoCatalog);
    closed[0].hours = { "2026-11-01": [] };
    expect(
      evaluateSchedule(schedule, plannerInput, closed).errors.map(
        (e) => e.code,
      ),
    ).toContain("CLOSED_VENUE");
    const far = structuredClone(demoCatalog);
    far[0].lng = 128;
    expect(
      evaluateSchedule(schedule, plannerInput, far).errors.map((e) => e.code),
    ).toContain("UNREALISTIC_ROUTE");
    expect(
      evaluateSchedule(
        schedule,
        { ...plannerInput, dietary: "peanut allergy" },
        demoCatalog,
      ).errors.map((e) => e.code),
    ).toContain("DIETARY_UNVERIFIED");
  });
  it("rejects missing meals, mismatched dates and excessive pace instead of optimizing away safety", () => {
    const schedule = demoSchedule(plannerInput);
    schedule.days[0].stops = schedule.days[0].stops.filter(
      (s) => s.purpose !== "dinner",
    );
    expect(
      evaluateSchedule(schedule, plannerInput, demoCatalog).errors.map(
        (e) => e.code,
      ),
    ).toContain("DINNER_COVERAGE");
    expect(
      tripSchema.safeParse({ ...plannerInput, endDate: "2026-12-01" }).success,
    ).toBe(false);
    expect(
      evaluateSchedule(
        demoSchedule(plannerInput),
        { ...plannerInput, pace: "relaxed" },
        demoCatalog,
      ).errors.map((e) => e.code),
    ).toContain("PACE_OVERLOAD");
  });
  it("repairs a bad proposal once, validates exact pins and caps repeated invalid proposals", async () => {
    let calls = 0;
    const valid = demoSchedule(plannerInput),
      bad = structuredClone(valid);
    bad.days[0].stops[0].candidateId = "fabricated";
    const model: Pick<Gemini, "structured"> = {
      structured: async <T>(schema: z.ZodType<T>) => {
        calls++;
        return schema.parse(calls === 1 ? bad : valid);
      },
    };
    const result = await generateValidated(model, plannerInput, demoCatalog);
    expect(result.evaluation.valid).toBe(true);
    expect(calls).toBe(2);
    const pin = { date: valid.days[0].date, stop: valid.days[0].stops[0] };
    let tries = 0;
    const changed: Pick<Gemini, "structured"> = {
      structured: async <T>(schema: z.ZodType<T>) => {
        tries++;
        const altered = structuredClone(valid);
        altered.days[0].stops[0].start = "09:35";
        return schema.parse(altered);
      },
    };
    await expect(
      generateValidated(changed, plannerInput, demoCatalog, [pin]),
    ).rejects.toMatchObject({ message: "SCHEDULE_QUALITY_FAILED" });
    expect(tries).toBe(2);
  });
  it("never calls Gemini when identified candidates are insufficient", async () => {
    const fn = vi.fn();
    await expect(
      generateValidated({ structured: fn }, plannerInput, []),
    ).rejects.toMatchObject({ message: "INSUFFICIENT_CANDIDATES" });
    expect(fn).not.toHaveBeenCalled();
  });
});
