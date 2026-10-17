import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { readConfig } from "../server/config";
import { createApp } from "../server/app";
import { AppError } from "../server/errors";
import type { Repository } from "../server/repository";
import { demoPlaces } from "../shared/demo";

const live = readConfig({ VITE_DATA_MODE: "live" });
function repository(): Repository {
  return {
    shares: vi.fn(async () => ({})),
    bookingProfile: vi.fn(async () => ({
      profile: null,
      onboardingSeen: false,
    })),
    uploadPhoto: vi.fn(async () => ({ id: crypto.randomUUID() })),
    photo: vi.fn(async () => Buffer.from("test-image")),
    planning: vi.fn(async () => ({})),
    community: vi.fn(async () => ({})),
    authenticate: vi.fn(async (token) => {
      if (token !== "valid-token")
        throw new AppError(401, "로그인 후 이용해 주세요.");
      return { id: "user-a", role: "traveler" as const };
    }),
    places: vi.fn(async () => []),
    contribute: vi.fn(async () => ({
      id: "submitted",
      status: "pending" as const,
    })),
  };
}
describe("HTTP boundary", () => {
  it("rejects non-moderator queue reads and decisions even with forged client role data", async () => {
    const repo = repository();
    const app = createApp(live, repo);
    expect(
      (
        await request(app)
          .get("/api/admin/queue")
          .set("Authorization", "Bearer valid-token")
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/admin/decisions")
          .set("Authorization", "Bearer valid-token")
          .send({ role: "admin" })
      ).status,
    ).toBe(403);
    expect(repo.community).not.toHaveBeenCalled();
  });
  it("starts in demo without keys and never writes provider data", async () => {
    const app = createApp(readConfig({}));
    const res = await request(app).get("/api/places");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("demo");
    expect((await request(app).get("/api/search?q=국밥")).status).toBe(503);
    expect(
      (await request(app).post("/api/contributions").send({})).status,
    ).toBe(503);
  });
  it("authenticates before accepting contributions and validates again on the server", async () => {
    const repo = repository();
    const app = createApp(live, repo);
    expect(
      (await request(app).post("/api/contributions").send({})).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/contributions")
          .set("Authorization", "Bearer bad")
          .send({})
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/contributions")
          .set("Authorization", "Bearer valid-token")
          .send({})
      ).status,
    ).toBe(400);
    expect(repo.contribute).not.toHaveBeenCalled();
    const payload = {
      photoId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      placeId: demoPlaces[0].id,
      text: "직접 방문한 추천 한마디입니다.",
      confirmed: true,
      userId: "attacker",
    };
    const result = await request(app)
      .post("/api/contributions")
      .set("Authorization", "Bearer valid-token")
      .send(payload);
    expect(result.status).toBe(201);
    expect(result.body.status).toBe("pending");
    expect(repo.contribute).toHaveBeenCalledWith(
      { id: "user-a", role: "traveler" },
      expect.not.objectContaining({ userId: "attacker" }),
      undefined,
    );
  });
  it("returns safe errors, limits requests, and never returns a database error message", async () => {
    const repo = repository();
    repo.contribute = vi.fn(async () => {
      throw new Error("secret-database-details");
    });
    const app = createApp(live, repo);
    const payload = {
      photoId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      placeId: demoPlaces[0].id,
      text: "맛있는 메뉴를 추천합니다.",
      confirmed: true,
    };
    const failed = await request(app)
      .post("/api/contributions")
      .set("Authorization", "Bearer valid-token")
      .send(payload);
    expect(failed.status).toBe(500);
    expect(JSON.stringify(failed.body)).not.toContain("secret-database");
    for (let i = 0; i < 9; i++)
      await request(app)
        .post("/api/contributions")
        .set("Authorization", "Bearer valid-token")
        .send(payload);
    const limited = await request(app)
      .post("/api/contributions")
      .set("Authorization", "Bearer valid-token")
      .send(payload);
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
  });
});
