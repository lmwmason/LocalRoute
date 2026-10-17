import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Gemini } from "../server/gemini";
import { generateValidated } from "../server/planner/generate";
import type { Candidate, Schedule, TripInput } from "../shared/planner";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { destinationId, kakaoAddressEndpoint } from "../shared/destinations";
import type { TransportLegResult, TransportRequest } from "../shared/transport";
import { plannerInput } from "./fixtures/planning";

function modelReturning(proposals: Schedule[]) {
  const inputs: unknown[] = [];
  const model: Pick<Gemini, "structured"> = {
    structured: async <T>(
      schema: z.ZodType<T>,
      _system: string,
      data: unknown,
    ) => {
      inputs.push(structuredClone(data));
      return schema.parse(
        proposals[Math.min(inputs.length - 1, proposals.length - 1)],
      );
    },
  };
  return { model, inputs };
}

describe("planner model data minimization", () => {
  it("allowlists trip conditions and planning facts on both initial and repair calls", async () => {
    const input: TripInput = Object.assign(
      {
        ...plannerInput,
        dietary: "PRIVATE_DIETARY_HISTORY",
        allowUnverifiedDietary: true,
      },
      {
        userId: "PRIVATE_TRAVELER_ID",
        customerPhone: "PRIVATE_PHONE",
        metadata: "PRIVATE_METADATA",
      },
    );
    const catalog: Candidate[] = structuredClone(demoCatalog);
    for (const candidate of catalog) {
      candidate.source.url = "https://example.test/PRIVATE_PROVIDER_SOURCE";
      candidate.photo = {
        id: "PRIVATE_PHOTO",
        width: 500,
        height: 500,
        source: "contributor",
        review: "approved",
      };
      candidate.endorsements = candidate.endorsements.map((endorsement) =>
        Object.assign(
          { ...endorsement, text: "PRIVATE_CONTRIBUTOR_PROSE" },
          { userId: "PRIVATE_CURATOR_ID" },
        ),
      );
      Object.assign(candidate, { ownerId: "PRIVATE_OWNER_ID" });
    }
    catalog[0].hours = {
      "2026-11-01": [
        Object.assign(
          { open: "09:00", close: "22:00" },
          { privateNote: "PRIVATE_HOURS_NOTE" },
        ),
      ],
    };
    const valid = demoSchedule(input),
      bad = structuredClone(valid);
    bad.days[0].stops[0].candidateId = "not-a-candidate";
    const { model, inputs } = modelReturning([bad, valid]);
    const result = await generateValidated(model, input, catalog);
    expect(result.evaluation.valid).toBe(true);
    expect(inputs).toHaveLength(2);
    expect(JSON.stringify(inputs)).not.toContain("PRIVATE_");
    for (const payload of inputs) {
      expect(payload).toMatchObject({
        input: {
          destination: { name: "Seongsu, Seoul", lat: 37.5455, lng: 127.053 },
          startDate: input.startDate,
          endDate: input.endDate,
          startTime: input.startTime,
          endTime: input.endTime,
          purpose: input.purpose,
          activities: input.activities,
          foodTypes: input.foodTypes,
          budget: input.budget,
          companions: input.companions,
          mobility: input.mobility,
          pace: input.pace,
          transferBufferMinutes: input.transferBufferMinutes,
          language: input.language,
        },
      });
      const trip = (payload as { input: Record<string, unknown> }).input;
      expect(Object.keys(trip).sort()).toEqual(
        [
          "destination",
          "startDate",
          "endDate",
          "startTime",
          "endTime",
          "purpose",
          "activities",
          "foodTypes",
          "budget",
          "companions",
          "mobility",
          "pace",
          "transferBufferMinutes",
          "language",
        ].sort(),
      );
      const first = (payload as { candidates: Record<string, unknown>[] })
        .candidates[0];
      expect(first).toMatchObject({
        id: catalog[0].id,
        name: catalog[0].name,
        localEndorsementCount: catalog[0].endorsements.length,
        endorsementVersionIds: catalog[0].endorsements.map(
          (item) => item.versionId,
        ),
        hours: { "2026-11-01": [{ open: "09:00", close: "22:00" }] },
      });
      expect(first).not.toHaveProperty("source");
      expect(first).not.toHaveProperty("endorsements");
      expect(first).not.toHaveProperty("photo");
    }
    expect(
      result.evaluation.warnings.some(
        (issue) => issue.code === "DIETARY_UNVERIFIED",
      ),
    ).toBe(true);
  });

  it("sends only destination name and coordinates rather than provider identity metadata", async () => {
    const input: TripInput = {
      ...plannerInput,
      destination: {
        id: destinationId("서울특별시 성동구"),
        label: "서울특별시 성동구",
        country: "KR",
        level: "district",
        region1: "서울특별시",
        region2: "성동구",
        region3: "",
        lat: 37.5455,
        lng: 127.053,
        source: {
          provider: "kakao",
          endpoint: kakaoAddressEndpoint,
          addressType: "REGION",
          observedAt: "2026-10-17T00:00:00Z",
          verification: "provider",
          coordinateMeaning: "region_representative",
        },
      },
    };
    const { model, inputs } = modelReturning([demoSchedule(input)]);
    await generateValidated(model, input, demoCatalog);
    expect(
      (inputs[0] as { input: { destination: unknown } }).input.destination,
    ).toEqual({ name: "서울특별시 성동구", lat: 37.5455, lng: 127.053 });
    expect(JSON.stringify(inputs)).not.toContain("kakao");
    expect(JSON.stringify(inputs)).not.toContain("region_representative");
  });

  it("keeps pinned explanations private and restores them without changing other pinned fields", async () => {
    const original = demoSchedule(plannerInput);
    original.days[0].stops[0].explanation =
      "PRIVATE_PIN_EXPLANATION stays only on the server.";
    const pin = {
      date: original.days[0].date,
      stop: structuredClone(original.days[0].stops[0]),
    };
    const proposed = structuredClone(original);
    proposed.days[0].stops[0].explanation =
      "A generic model explanation for this pinned stop.";
    const { model, inputs } = modelReturning([proposed]);
    const result = await generateValidated(model, plannerInput, demoCatalog, [
      pin,
    ]);
    expect(result.schedule.days[0].stops[0]).toEqual(pin.stop);
    expect(result.evaluation.valid).toBe(true);
    expect(JSON.stringify(inputs)).not.toContain("PRIVATE_PIN_EXPLANATION");
    expect((inputs[0] as { pinnedStops: unknown[] }).pinnedStops).toEqual([
      {
        date: pin.date,
        candidateId: pin.stop.candidateId,
        start: pin.stop.start,
        end: pin.stop.end,
        purpose: pin.stop.purpose,
      },
    ]);
    expect(proposed.days[0].stops[0].explanation).not.toBe(
      pin.stop.explanation,
    );
  });

  it("still rejects strict unverified dietary restrictions locally without sending the restriction", async () => {
    const input = { ...plannerInput, dietary: "PRIVATE_MEDICAL_RESTRICTION" };
    const { model, inputs } = modelReturning([demoSchedule(input)]);
    await expect(
      generateValidated(model, input, demoCatalog),
    ).rejects.toMatchObject({ message: "SCHEDULE_QUALITY_FAILED" });
    expect(inputs).toHaveLength(2);
    expect(JSON.stringify(inputs)).not.toContain("PRIVATE_MEDICAL_RESTRICTION");
    expect(JSON.stringify(inputs[1])).toContain("DIETARY_UNVERIFIED");
  });

  it("repairs route conflicts with timing evidence rather than provider payloads", async () => {
    const { model, inputs } = modelReturning([demoSchedule(plannerInput)]);
    const lookup = async (
      request: TransportRequest,
    ): Promise<TransportLegResult> => ({
      request,
      source: {
        provider: "kakao_maps",
        documentationUrl: "https://example.test/PRIVATE_PROVIDER_URL",
        checkedAt: new Date().toISOString(),
        requestedAt: new Date().toISOString(),
        attempted: true,
      },
      status: "estimated",
      timeBasis: "lookup_time",
      arrivalGuaranteed: false,
      accessibility: "unverified",
      distanceMeters: 100,
      durationSeconds: 36000,
      transfers: 0,
      walking: null,
      steps: [],
      fare: null,
    });
    await expect(
      generateValidated(model, plannerInput, demoCatalog, [], lookup),
    ).rejects.toMatchObject({ message: "SCHEDULE_QUALITY_FAILED" });
    expect(inputs).toHaveLength(2);
    expect(JSON.stringify(inputs)).not.toContain("PRIVATE_PROVIDER_URL");
    const repair = inputs[1] as {
      validationErrorsFromPreviousAttempt: {
        currentTransportEvidence: Record<string, unknown>[];
      };
    };
    expect(
      repair.validationErrorsFromPreviousAttempt.currentTransportEvidence[0],
    ).toMatchObject({
      durationSeconds: 36000,
      distanceMeters: 100,
      status: "estimated",
      provider: "kakao_maps",
    });
    expect(
      repair.validationErrorsFromPreviousAttempt.currentTransportEvidence[0],
    ).not.toHaveProperty("leg");
  });
});
