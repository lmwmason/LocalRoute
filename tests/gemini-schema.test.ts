import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Gemini, geminiResponseSchema } from "../server/gemini";
import { scheduleSchema } from "../shared/planner";
import { demoSchedule } from "../shared/planner-demo";
import { plannerInput } from "./fixtures/planning";

describe("Gemini schema compatibility and authoritative validation", () => {
  it("removes provider-rejected string and array constraints without removing venue fields", () => {
    const wire = geminiResponseSchema(scheduleSchema);
    const serialized = JSON.stringify(wire);
    for (const keyword of [
      "$schema",
      "pattern",
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
      "format",
      "additionalProperties",
    ])
      expect(serialized).not.toContain(`"${keyword}":`);
    expect(serialized).toContain('"candidateId"');
    expect(serialized).toContain('"required"');
    expect(serialized).toContain('"lunch"');
  });
  it("preserves property names that resemble schema keywords", () => {
    const schema = z.object({
      pattern: z.string().min(3),
      minItems: z.number(),
    });
    expect(geminiResponseSchema(schema)).toMatchObject({
      properties: { pattern: { type: "string" }, minItems: { type: "number" } },
    });
  });
  it("still rejects a provider response with an impossible calendar date", async () => {
    const schedule = demoSchedule(plannerInput);
    schedule.days[0].date = "2026-02-30";
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: "STOP",
                content: { parts: [{ text: JSON.stringify(schedule) }] },
              },
            ],
          }),
        ),
    );
    await expect(
      new Gemini("test-key", "test-model", fetcher as typeof fetch).structured(
        scheduleSchema,
        "test",
        {},
      ),
    ).rejects.toThrow("AI_INVALID_OUTPUT");
  });
  it("sends the compatible wire schema and accepts only a fully valid response", async () => {
    const schedule = demoSchedule(plannerInput);
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(
        JSON.parse(String(init?.body)).generationConfig.responseJsonSchema,
      ).toEqual(geminiResponseSchema(scheduleSchema));
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify(schedule) }] },
            },
          ],
        }),
      );
    });
    expect(
      await new Gemini(
        "test-key",
        "test-model",
        fetcher as typeof fetch,
      ).structured(scheduleSchema, "test", {}),
    ).toEqual(schedule);
  });
});
