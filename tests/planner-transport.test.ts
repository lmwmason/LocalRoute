import { describe, expect, it, vi } from "vitest";
import { assessTransport } from "../server/planner/transport";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { plannerInput } from "./fixtures/planning";
import type { TransportLegResult, TransportRequest } from "../shared/transport";
const input = { ...plannerInput, mobility: "transit" as const };
function response(
  request: TransportRequest,
  durationSeconds: number,
): TransportLegResult {
  return {
    request,
    source: {
      provider: "kakao_maps",
      documentationUrl: null,
      checkedAt: new Date().toISOString(),
      requestedAt: new Date().toISOString(),
      attempted: true,
    },
    status: "estimated",
    timeBasis: "lookup_time",
    arrivalGuaranteed: false,
    accessibility: "unverified",
    distanceMeters: 100,
    durationSeconds,
    transfers: 0,
    walking: null,
    steps: [],
    fare: null,
  };
}
describe("itinerary transport integration", () => {
  it("checks exact ordered endpoints and rejects travel plus buffer exceeding the gap", async () => {
    const lookup = vi.fn(async (request: TransportRequest) =>
      response(request, 36000),
    );
    const result = await assessTransport(
      demoSchedule(input),
      input,
      demoCatalog,
      lookup,
    );
    expect(lookup).toHaveBeenCalledTimes(4);
    expect(result.errors).toHaveLength(4);
    expect(result.errors[0].code).toBe("ROUTE_TIME_CONFLICT");
    const first = demoCatalog.find(
      (place) => place.id === result.transport[0].fromId,
    )!;
    expect(lookup.mock.calls[0][0].origin).toEqual({
      lat: first.lat,
      lng: first.lng,
    });
    expect(JSON.stringify(lookup.mock.calls)).not.toContain("dietary");
  });
  it("keeps unsupported routes explicitly unknown without manufacturing duration", async () => {
    const result = await assessTransport(
      demoSchedule(input),
      input,
      demoCatalog,
      async (request) => ({
        ...response(request, 0),
        status: "unverified",
        reason: "unsupported_mode",
        distanceMeters: null,
        durationSeconds: null,
        transfers: null,
        walking: null,
        steps: [],
        fare: null,
      }),
    );
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(4);
    expect(
      result.transport.every((item) => item.leg.durationSeconds === null),
    ).toBe(true);
  });
  it("rejects stale or mismatched route evidence", async () => {
    const result = await assessTransport(
      demoSchedule(input),
      input,
      demoCatalog,
      async (request) => {
        const leg = response(request, 10);
        leg.source.checkedAt = "2020-01-01T00:00:00Z";
        return leg;
      },
    );
    expect(result.transport).toHaveLength(0);
    expect(
      result.errors.every((issue) => issue.code === "ROUTE_EVIDENCE_INVALID"),
    ).toBe(true);
  });
});
