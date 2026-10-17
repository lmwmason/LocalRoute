import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Gemini } from "../server/gemini";
import { AppError } from "../server/errors";
import { generateValidated } from "../server/planner/generate";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { plannerInput } from "./fixtures/planning";

describe("bounded itinerary quality repair", () => {
  it("accepts a valid third proposal and feeds back structural data without prose", async () => {
    const payloads: unknown[] = [];
    const valid = demoSchedule(plannerInput);
    const bad = structuredClone(valid);
    bad.title = "PRIVATE_PREVIOUS_TITLE";
    bad.summary = "PRIVATE_PREVIOUS_SUMMARY";
    bad.days[0].stops[0].explanation = "PRIVATE_PREVIOUS_EXPLANATION";
    bad.days[0].stops[1].start = "10:00";
    const model: Pick<Gemini, "structured"> = {
      structured: async <T>(schema: z.ZodType<T>, _system: string, data: unknown) => {
        payloads.push(structuredClone(data));
        return schema.parse(payloads.length < 3 ? bad : valid);
      },
    };
    const result = await generateValidated(model, plannerInput, demoCatalog);
    expect(result.evaluation.valid).toBe(true);
    expect(payloads).toHaveLength(3);
    expect(JSON.stringify(payloads)).not.toContain("PRIVATE_PREVIOUS_");
    for (const payload of payloads.slice(1)) {
      const feedback = (payload as {
        validationErrorsFromPreviousAttempt: {
          errors: { code: string }[];
          previousSchedule: { date: string; stops: Record<string, unknown>[] }[];
        };
      }).validationErrorsFromPreviousAttempt;
      expect(feedback.errors.some((issue) => issue.code === "TIME_CONFLICT")).toBe(true);
      expect(feedback.previousSchedule[0].stops[0]).toEqual({
        candidateId: bad.days[0].stops[0].candidateId,
        start: bad.days[0].stops[0].start,
        end: bad.days[0].stops[0].end,
        purpose: bad.days[0].stops[0].purpose,
      });
    }
  });

  it("rejects all three invalid proposals without weakening validation", async () => {
    let calls = 0;
    const bad = demoSchedule(plannerInput);
    bad.days[0].stops[0].candidateId = "invented-venue";
    const model: Pick<Gemini, "structured"> = {
      structured: async <T>(schema: z.ZodType<T>) => {
        calls++;
        return schema.parse(bad);
      },
    };
    await expect(generateValidated(model, plannerInput, demoCatalog)).rejects.toMatchObject({
      message: "SCHEDULE_QUALITY_FAILED",
    });
    expect(calls).toBe(3);
  });

  it.each(["AI_INVALID_OUTPUT", "AI_INCOMPLETE"])(
    "repairs %s twice and accepts the third response",
    async (code) => {
      let calls = 0;
      const model: Pick<Gemini, "structured"> = {
        structured: async <T>(schema: z.ZodType<T>) => {
          calls++;
          if (calls < 3) throw new AppError(502, code);
          return schema.parse(demoSchedule(plannerInput));
        },
      };
      expect((await generateValidated(model, plannerInput, demoCatalog)).evaluation.valid).toBe(true);
      expect(calls).toBe(3);
    },
  );

  it.each(["AI_INVALID_OUTPUT", "AI_INCOMPLETE"])(
    "caps repeated %s failures at three calls",
    async (code) => {
      let calls = 0;
      const model: Pick<Gemini, "structured"> = {
        structured: async () => {
          calls++;
          throw new AppError(502, code);
        },
      };
      await expect(generateValidated(model, plannerInput, demoCatalog)).rejects.toMatchObject({message: code});
      expect(calls).toBe(3);
    },
  );

  it.each([
    [401, "AI_UNAVAILABLE"],
    [429, "AI_PROVIDER_LIMIT"],
    [429, "AI_HOURLY_LIMIT"],
    [504, "AI_TIMEOUT"],
    [502, "AI_UNAVAILABLE"],
    [401, "AI_INVALID_OUTPUT"],
    [429, "AI_INCOMPLETE"],
  ])("does not retry provider failure %s/%s", async (status, code) => {
    let calls = 0;
    const error = new AppError(status as number, code as string);
    const model: Pick<Gemini, "structured"> = {
      structured: async () => {
        calls++;
        throw error;
      },
    };
    await expect(generateValidated(model, plannerInput, demoCatalog)).rejects.toBe(error);
    expect(calls).toBe(1);
  });
});
