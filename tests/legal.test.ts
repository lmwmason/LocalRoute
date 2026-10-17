import { describe, expect, it, vi } from "vitest";
import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import {
  LEGAL_VERSION,
  legalConsentSchema,
  legalStatusSchema,
  legalDocuments,
} from "../shared/legal";
import {
  attachLegal,
  createLegalStore,
  SupabaseLegalStore,
  type LegalStore,
} from "../server/legal";
import { AppError } from "../server/errors";
import { notices } from "../src/legal/content";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));
const value = () => ({
  requestId: crypto.randomUUID(),
  version: LEGAL_VERSION,
  language: "en" as const,
  terms: true as const,
  privacy: true as const,
  supabaseTransfer: true as const,
  adult: true as const,
  publicLocalArea: false,
});
const current = {
  current: true,
  version: LEGAL_VERSION,
  recordedAt: "2026-10-17T00:00:00Z",
  publicLocalArea: false,
};
function fixture(enabled = true, consented = true) {
  const app = express();
  app.use(express.json());
  const store: LegalStore = {
    authenticate: vi.fn(async (token) => {
      if (token !== "verified")
        throw new AppError(401, "LEGAL_VERIFIED_EMAIL_REQUIRED");
      return "server-user";
    }),
    status: vi.fn(async () => ({ ...current, current: consented })),
    record: vi.fn(async () => current),
  };
  const limit = vi.fn();
  const { requireConsent, requirePublicAreaChoice } = attachLegal(app, {
    store: enabled ? store : undefined,
    limit,
  });
  app.post("/protected", requireConsent, (_req, res) => res.json({ ok: true }));
  app.put("/profile", requirePublicAreaChoice, (_req, res) =>
    res.json({ ok: true }),
  );
  const handler: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error.status || 500).json({ error: error.message });
  };
  app.use(handler);
  return { app, store, limit };
}
describe("legal endpoints and notice contracts", () => {
  it("rejects an old server claiming current acceptance without the current text/time", () => {
    expect(
      legalStatusSchema.safeParse({ ...current, version: "obsolete" }).success,
    ).toBe(false);
    expect(
      legalStatusSchema.safeParse({ ...current, recordedAt: null }).success,
    ).toBe(false);
  });
  it("exposes public version and fails closed if storage is disabled", async () => {
    const { app } = fixture(false);
    expect((await request(app).get("/api/legal")).body.version).toBe(
      LEGAL_VERSION,
    );
    expect((await request(app).get("/api/me/legal-consents")).status).toBe(503);
  });
  it("requires verified authentication and uses the server identity", async () => {
    const { app, store, limit } = fixture();
    expect(
      (await request(app).post("/api/me/legal-consents").send(value())).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/me/legal-consents")
          .set("Authorization", "Bearer unverified")
          .send(value())
      ).status,
    ).toBe(401);
    const body = value();
    expect(
      (
        await request(app)
          .post("/api/me/legal-consents")
          .set("Authorization", "Bearer verified")
          .send(body)
      ).status,
    ).toBe(200);
    expect(store.record).toHaveBeenCalledWith("server-user", body);
    expect(limit).toHaveBeenCalledWith("legal-write:server-user", 10, 60);
    expect(
      (
        await request(app)
          .get("/api/me/legal-consents")
          .set("Authorization", "Bearer verified")
      ).headers["cache-control"],
    ).toBe("no-store");
  });
  it("rejects stale/forged payloads and allows optional refusal", async () => {
    const { app, store } = fixture();
    for (const body of [
      { ...value(), version: "old" },
      { ...value(), adult: false },
      { ...value(), userId: "someone-else" },
      { ...value(), recordedAt: "yesterday" },
      { ...value(), guestPhone: "private" },
    ]) {
      expect(
        (
          await request(app)
            .post("/api/me/legal-consents")
            .set("Authorization", "Bearer verified")
            .send(body)
        ).status,
      ).toBe(400);
    }
    expect(store.record).not.toHaveBeenCalled();
    expect(legalConsentSchema.safeParse(value()).success).toBe(true);
  });
  it("enforces the membership gate server-side", async () => {
    expect(
      (
        await request(fixture(true, false).app)
          .post("/protected")
          .set("Authorization", "Bearer verified")
      ).status,
    ).toBe(403);
    expect(
      (
        await request(fixture().app)
          .post("/protected")
          .set("Authorization", "Bearer verified")
      ).status,
    ).toBe(200);
  });
  it("rejects profile publication that disagrees with separately recorded consent", async () => {
    const { app } = fixture();
    expect(
      (
        await request(app)
          .put("/profile")
          .set("Authorization", "Bearer verified")
          .send({ publicLocalArea: true })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .put("/profile")
          .set("Authorization", "Bearer verified")
          .send({ publicLocalArea: false })
      ).status,
    ).toBe(200);
  });
  it("does not report success when persistence fails", async () => {
    const { app, store } = fixture();
    vi.mocked(store.record).mockRejectedValueOnce(
      new AppError(503, "LEGAL_SAVE_FAILED"),
    );
    expect(
      (
        await request(app)
          .post("/api/me/legal-consents")
          .set("Authorization", "Bearer verified")
          .send(value())
      ).status,
    ).toBe(503);
  });
  it("locks project identity and requires confirmed non-anonymous email", async () => {
    expect(() =>
      createLegalStore({
        live: true,
        url: "https://other.supabase.co",
        secret: "test",
      }),
    ).toThrow(/mismatched/);
    expect(
      createLegalStore({ live: false, url: "", secret: "" }),
    ).toBeUndefined();
    const store = new SupabaseLegalStore(
      "https://pjdawapasozsrpnrtsfx.supabase.co",
      "test",
    );
    for (const user of [
      null,
      { id: "a", email: "a@test.invalid" },
      {
        id: "a",
        email: "a@test.invalid",
        email_confirmed_at: "now",
        is_anonymous: true,
      },
    ]) {
      mocks.getUser.mockResolvedValueOnce({ data: { user }, error: null });
      await expect(store.authenticate("token")).rejects.toThrow(/VERIFIED/);
    }
    mocks.getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "verified-id",
          email: "a@test.invalid",
          email_confirmed_at: "now",
          is_anonymous: false,
        },
      },
      error: null,
    });
    expect(await store.authenticate("token")).toBe("verified-id");
  });
  it("provides Korean/English documents and accurate operator/region notices", () => {
    for (const language of ["ko", "en"] as const) {
      for (const document of legalDocuments) {
        expect(notices[language][document].sections.length).toBeGreaterThan(2);
      }
      const all = JSON.stringify(notices[language]);
      expect(all).toContain("just_grassy");
      expect(all).toContain("lmw.hpc@gmail.com");
      expect(all).toContain("ap-south-1");
      expect(all).toContain("pjdawapasozsrpnrtsfx");
      expect(all).toContain("18");
    }
  });
});
