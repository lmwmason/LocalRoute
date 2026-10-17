import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../server/app";
import { readConfig } from "../server/config";
import type { Repository } from "../server/repository";
import { AppError } from "../server/errors";

describe("LP planning requires an authenticated server actor", () => {
  it("rejects absent and invalid credentials before LP or provider work", async () => {
    const planning = vi.fn();
    const authenticate = vi.fn(async () => {
      throw new AppError(401, "Invalid account");
    });
    const repo = { authenticate, planning } as unknown as Repository;
    const deps = {
      gemini: { structured: vi.fn() },
      activities: { search: vi.fn() },
      destinations: { verifySelection: vi.fn() },
    };
    const app = createApp(
      { ...readConfig({}), live: true, planning: true },
      repo,
      undefined,
      deps,
    );
    for (const authorization of [undefined, "Bearer invalid-fixture-only"]) {
      let req = request(app).post("/api/planning/generate");
      if (authorization) req = req.set("Authorization", authorization);
      expect((await req.send({})).status).toBe(401);
    }
    expect(planning).not.toHaveBeenCalled();
    expect(deps.gemini.structured).not.toHaveBeenCalled();
    expect(deps.activities.search).not.toHaveBeenCalled();
    expect(deps.destinations.verifySelection).not.toHaveBeenCalled();
  });
  it("cannot generate a real itinerary in demo mode even with a supplied token", async () => {
    const deps = {
      gemini: { structured: vi.fn() },
      activities: { search: vi.fn() },
    };
    const app = createApp(readConfig({}), undefined, undefined, deps);
    const response = await request(app)
      .post("/api/planning/generate")
      .set("Authorization", "Bearer fixture-only")
      .send({});
    expect(response.status).toBe(503);
    expect(deps.gemini.structured).not.toHaveBeenCalled();
    expect(deps.activities.search).not.toHaveBeenCalled();
  });
});
