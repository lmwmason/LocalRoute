import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Gemini } from "../server/gemini";
import { AppError } from "../server/errors";
import { generateValidated } from "../server/planner/generate";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { plannerInput } from "./fixtures/planning";
import { blueprintResponse } from "./fixtures/blueprint-response";

describe("bounded itinerary quality repair", () => {
  it("restores non-pinned model timing from the server blueprint without another AI call", async () => {
    const payloads: unknown[] = [];
    const valid = demoSchedule(plannerInput);
    const bad = structuredClone(valid);
    bad.title = "PRIVATE_PREVIOUS_TITLE";
    bad.summary = "PRIVATE_PREVIOUS_SUMMARY";
    bad.days[0].stops[0].explanation = "PRIVATE_PREVIOUS_EXPLANATION";
    bad.days[0].stops[1].start = "10:00";
    const model: Pick<Gemini, "structured"> = {
      structured: async <T>(
        schema: z.ZodType<T>,
        _system: string,
        data: unknown,
      ) => {
        payloads.push(structuredClone(data));
        const response = blueprintResponse(valid, data);
        response.days[0].stops[0].start = "08:00";
        response.days[0].stops[0].end = "08:30";
        return schema.parse(response);
      },
    };
    const result = await generateValidated(model, plannerInput, demoCatalog);
    expect(result.evaluation.valid).toBe(true);
    expect(payloads).toHaveLength(1);
    expect(JSON.stringify(payloads)).not.toContain("PRIVATE_PREVIOUS_");
    expect(result.schedule.days[0].stops[0].start).not.toBe("08:00");
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
    await expect(
      generateValidated(model, plannerInput, demoCatalog),
    ).rejects.toMatchObject({
      message: "SCHEDULE_QUALITY_FAILED",
    });
    expect(calls).toBe(3);
  });

  it.each(["AI_INVALID_OUTPUT", "AI_INCOMPLETE"])(
    "repairs %s twice and accepts the third response",
    async (code) => {
      let calls = 0;
      const model: Pick<Gemini, "structured"> = {
        structured: async <T>(
          schema: z.ZodType<T>,
          _system: string,
          data: unknown,
        ) => {
          calls++;
          if (calls < 3) throw new AppError(502, code);
          return schema.parse(
            blueprintResponse(demoSchedule(plannerInput), data),
          );
        },
      };
      expect(
        (await generateValidated(model, plannerInput, demoCatalog)).evaluation
          .valid,
      ).toBe(true);
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
      await expect(
        generateValidated(model, plannerInput, demoCatalog),
      ).rejects.toMatchObject({ message: code });
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
    await expect(
      generateValidated(model, plannerInput, demoCatalog),
    ).rejects.toBe(error);
    expect(calls).toBe(1);
  });
});
