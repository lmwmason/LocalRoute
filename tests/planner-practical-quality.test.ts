import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { evaluateSchedule } from "../shared/planner";
import { generateValidated } from "../server/planner/generate";
import { plannerInput } from "./fixtures/planning";

describe("practical itinerary quality with unchanged safety boundaries", () => {
  it("allows cross-day repeat visits with explicit warnings while rejecting repeats within a day", () => {
    const input = { ...plannerInput, endDate: "2026-11-02" };
    const schedule = demoSchedule(plannerInput);
    schedule.days.push({
      ...structuredClone(schedule.days[0]),
      date: input.endDate,
    });
    const evaluation = evaluateSchedule(schedule, input, demoCatalog);
    expect(evaluation.valid).toBe(true);
    expect(
      evaluation.warnings.filter((issue) => issue.code === "CROSS_DAY_REVISIT"),
    ).toHaveLength(schedule.days[0].stops.length);
    expect(
      evaluation.errors.some((issue) => issue.code === "DUPLICATE_STOP"),
    ).toBe(false);
    schedule.days[1].stops[1].candidateId =
      schedule.days[1].stops[0].candidateId;
    expect(
      evaluateSchedule(schedule, input, demoCatalog).errors.some(
        (issue) => issue.code === "DUPLICATE_STOP",
      ),
    ).toBe(true);
  });
  it("treats pace as a warning and keeps time conflicts and known closures as errors", () => {
    const input = { ...plannerInput, pace: "relaxed" as const };
    const schedule = demoSchedule(plannerInput);
    const evaluation = evaluateSchedule(schedule, input, demoCatalog);
    expect(evaluation.valid).toBe(true);
    expect(
      evaluation.warnings.some((issue) => issue.code === "PACE_OVERLOAD"),
    ).toBe(true);
    const conflict = structuredClone(schedule);
    conflict.days[0].stops[1].start = conflict.days[0].stops[0].start;
    expect(
      evaluateSchedule(conflict, input, demoCatalog).errors.some(
        (issue) => issue.code === "TIME_CONFLICT",
      ),
    ).toBe(true);
    const catalog = structuredClone(demoCatalog);
    catalog.find(
      (candidate) => candidate.id === schedule.days[0].stops[0].candidateId,
    )!.hours = { [input.startDate]: [] };
    expect(
      evaluateSchedule(schedule, input, catalog).errors.some(
        (issue) => issue.code === "CLOSED_VENUE",
      ),
    ).toBe(true);
  });
  it("uses daily restaurant capacity across days and repairs only chronological array order, preserving pins", async () => {
    const input = { ...plannerInput, endDate: "2026-11-02" };
    const original = demoSchedule(plannerInput);
    const schedule = structuredClone(original);
    schedule.days.push({
      ...structuredClone(schedule.days[0]),
      date: input.endDate,
    });
    for (const day of schedule.days) day.stops.reverse();
    const pin = {
      date: input.startDate,
      stop: structuredClone(original.days[0].stops[0]),
    };
    const gemini = {
      structured: async <T>(schema: z.ZodType<T>) => schema.parse(schedule),
    };
    const structured = vi.spyOn(gemini, "structured");
    const result = await generateValidated(gemini, input, demoCatalog, [pin]);
    expect(result.evaluation.valid).toBe(true);
    expect(structured).toHaveBeenCalledTimes(1);
    expect(result.schedule.days[0].stops).toEqual(original.days[0].stops);
    expect(result.schedule.days[1].stops).toEqual(original.days[0].stops);
    expect(
      result.evaluation.warnings.some(
        (issue) => issue.code === "CROSS_DAY_REVISIT",
      ),
    ).toBe(true);
  });
});
