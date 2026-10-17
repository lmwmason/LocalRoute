import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../server/app";
import { readConfig } from "../server/config";
import { AppError } from "../server/errors";
import type { Repository } from "../server/repository";
import { destinationId, type Destination } from "../shared/destinations";
import { plannerInput } from "./fixtures/planning";
const label = "충북 충주시 살미면";
const destination: Destination = { id: destinationId(label), label, country: "KR", level: "township", region1: "충북", region2: "충주시", region3: "살미면", lat: 36.9, lng: 127.9, source: { provider: "kakao", endpoint: "https://dapi.kakao.com/v2/local/search/address.json", addressType: "REGION", observedAt: new Date().toISOString(), verification: "provider", coordinateMeaning: "region_representative" } };
function setup(status: "missing" | "ready" | "generating" = "missing") {
  const planning = vi.fn(async (_actor, action: string) => {
    if (action === "status") { if (status === "missing") throw new AppError(404, "REQUEST_NOT_FOUND"); return { status }; }
    if (action === "reserve") return { status, result: { id: "saved-result" } };
    return {};
  });
  const repo = { authenticate: vi.fn(async () => ({ id: "test-owner", role: "traveler" })), planning } as unknown as Repository;
  const deps = { gemini: { structured: vi.fn() }, activities: { search: vi.fn() }, destinations: { verifySelection: vi.fn(async () => { throw new AppError(400, "DESTINATION_SELECTION_INVALID"); }) } };
  const app = createApp({ ...readConfig({}), live: true, planning: true }, repo, undefined, deps);
  return { app, planning, deps };
}
const payload = { requestId: "73000000-0000-4000-8000-000000000001", input: { ...plannerInput, destination }, expectedCost: 100, policyVersion: "pilot-v1", consent: true };
describe("grounded destination and LP HTTP ordering", () => {
  it("verifies a new destination before reserving LP or calling Gemini", async () => {
    const { app, planning, deps } = setup();
    const response = await request(app).post("/api/planning/generate").set("Authorization", "Bearer valid").send(payload);
    expect(response.status).toBe(400);
    expect(deps.destinations.verifySelection).toHaveBeenCalledOnce();
    expect(planning.mock.calls.map((call) => call[1])).toEqual(["status"]);
    expect(deps.gemini.structured).not.toHaveBeenCalled();
  });
  it("replays a saved result through the original payload check without provider/model calls", async () => {
    const { app, planning, deps } = setup("ready");
    const response = await request(app).post("/api/planning/generate").set("Authorization", "Bearer valid").send(payload);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe("saved-result");
    expect(planning.mock.calls.map((call) => call[1])).toEqual(["status", "reserve"]);
    expect(deps.destinations.verifySelection).not.toHaveBeenCalled();
    expect(deps.gemini.structured).not.toHaveBeenCalled();
  });
  it("returns an in-progress replay without starting another generation", async () => {
    const { app, deps } = setup("generating");
    const response = await request(app).post("/api/planning/generate").set("Authorization", "Bearer valid").send(payload);
    expect(response.status).toBe(202);
    expect(deps.destinations.verifySelection).not.toHaveBeenCalled();
    expect(deps.gemini.structured).not.toHaveBeenCalled();
  });
  it("requires authentication before any destination verification or LP access", async () => {
    const { app, planning, deps } = setup();
    expect((await request(app).post("/api/planning/generate").send(payload)).status).toBe(401);
    expect(planning).not.toHaveBeenCalled();
    expect(deps.destinations.verifySelection).not.toHaveBeenCalled();
  });
});
