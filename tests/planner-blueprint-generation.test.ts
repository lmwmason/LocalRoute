import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { generateValidated } from "../server/planner/generate";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { plannerInput } from "./fixtures/planning";
import { blueprintResponse } from "./fixtures/blueprint-response";
import type { FeasibleBlueprint } from "../server/planner/feasibility";

describe("authoritative feasible schedule generation", () => {
  it.each([
    ["09:30", "20:00"],
    ["11:30", "15:30"],
  ])(
    "fits Korean food and coffee preferences in %s–%s before AI and restores authoritative times",
    async (startTime, endTime) => {
      const input = {
        ...plannerInput,
        startTime,
        endTime,
        activities: ["coffee" as const],
        foodTypes: ["korean" as const],
      };
      const payloads: {
        feasibleBlueprint: FeasibleBlueprint;
        candidates: { id: string }[];
      }[] = [];
      const gemini = {
        structured: async <T>(
          schema: z.ZodType<T>,
          _system: string,
          data: unknown,
        ) => {
          const payload = data as (typeof payloads)[number];
          payloads.push(payload);
          const proposal = blueprintResponse(demoSchedule(input), data);
          for (const stop of proposal.days.flatMap((day) => day.stops)) {
            stop.start = "00:00";
            stop.end = "00:30";
          }
          return schema.parse(proposal);
        },
      };
      const result = await generateValidated(gemini, input, demoCatalog);
      expect(result.evaluation.valid).toBe(true);
      expect(payloads).toHaveLength(1);
      expect(
        payloads[0].candidates.map((candidate) => candidate.id).sort(),
      ).toEqual([...payloads[0].feasibleBlueprint.candidateIds].sort());
      expect(
        result.schedule.days[0].stops.map(
          ({ candidateId, start, end, purpose }) => ({
            candidateId,
            start,
            end,
            purpose,
          }),
        ),
      ).toEqual(
        payloads[0].feasibleBlueprint.slots.map((slot) => ({
          candidateId: slot.allowedCandidateIds[0],
          start: slot.start,
          end: slot.end,
          purpose: slot.purpose,
        })),
      );
    },
  );
  it("never calls AI when every candidate is known closed", async () => {
    const structured = vi.fn();
    const catalog = demoCatalog.map((candidate) => ({
      ...candidate,
      hours: { [plannerInput.startDate]: [] },
    }));
    await expect(
      generateValidated({ structured }, plannerInput, catalog),
    ).rejects.toMatchObject({ message: "SCHEDULE_CONSTRAINTS_INFEASIBLE" });
    expect(structured).not.toHaveBeenCalled();
  });
  it("repairs an invented model slot without resending its untrusted prose", async () => {
    const payloads: unknown[] = [];
    const gemini = {
      structured: async <T>(
        schema: z.ZodType<T>,
        _system: string,
        data: unknown,
      ) => {
        payloads.push(structuredClone(data));
        const proposal = blueprintResponse(demoSchedule(plannerInput), data);
        if (payloads.length === 1) {
          proposal.title = "PRIVATE_MODEL_TITLE";
          proposal.summary = "PRIVATE_MODEL_SUMMARY untrusted source text.";
          proposal.days[0].stops[0].candidateId = "invented-venue";
          proposal.days[0].stops[0].explanation =
            "PRIVATE_MODEL_EXPLANATION untrusted instructions.";
        }
        return schema.parse(proposal);
      },
    };
    expect(
      (await generateValidated(gemini, plannerInput, demoCatalog)).evaluation
        .valid,
    ).toBe(true);
    expect(payloads).toHaveLength(2);
    expect(JSON.stringify(payloads)).not.toContain("PRIVATE_MODEL_");
    expect(payloads[1]).toMatchObject({
      validationErrorsFromPreviousAttempt: [{ code: "MODEL_SLOT_MISMATCH" }],
    });
  });
  it("permits exact Korean venue and destination proper names inside an English summary", async () => {
    const gemini = {
      structured: async <T>(
        schema: z.ZodType<T>,
        _system: string,
        data: unknown,
      ) => {
        const proposal = blueprintResponse(demoSchedule(plannerInput), data);
        proposal.summary = `Enjoy lunch at ${demoCatalog[0].name} in 서울 성수, followed by a neighborhood walk.`;
        return schema.parse(proposal);
      },
    };
    expect(
      (await generateValidated(gemini, plannerInput, demoCatalog)).evaluation
        .valid,
    ).toBe(true);
  });
  it("still rejects generic Korean prose in an English summary", async () => {
    const gemini = {
      structured: async <T>(
        schema: z.ZodType<T>,
        _system: string,
        data: unknown,
      ) => {
        const proposal = blueprintResponse(demoSchedule(plannerInput), data);
        proposal.summary =
          "오늘은 맛있는 식당을 방문해요. Then explore the neighborhood.";
        return schema.parse(proposal);
      },
    };
    const structured = vi.spyOn(gemini, "structured");
    await expect(
      generateValidated(gemini, plannerInput, demoCatalog),
    ).rejects.toMatchObject({ message: "SCHEDULE_QUALITY_FAILED" });
    expect(structured).toHaveBeenCalledTimes(3);
  });
});
