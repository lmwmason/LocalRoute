import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { createApp } from "../server/app";
import { readConfig } from "../server/config";
import { SupabaseLegalStore } from "../server/legal";
import {
  SupabaseRepository,
  type Actor,
  type Repository,
} from "../server/repository";
import { preparePlacePhoto, maxPhotoBytes } from "../server/photos";
import { attachBooking } from "../server/booking";
import type { BookingConfig } from "../server/booking/config";
import {
  publicReservation,
  type StoredReservation,
} from "../server/booking/store";
import { AppError } from "../server/errors";
import { reservationSchema } from "../shared/reservations";
import { LEGAL_VERSION } from "../shared/legal";

const owner: Actor = {
  id: "94000000-0000-4000-8000-000000000001",
  role: "traveler",
};
const stranger: Actor = {
  id: "94000000-0000-4000-8000-000000000002",
  role: "traveler",
};
const config = readConfig({
  VITE_DATA_MODE: "live",
  SUPABASE_URL: "https://pjdawapasozsrpnrtsfx.supabase.co",
  VITE_SUPABASE_ANON_KEY: "sb_publishable_fixture_public_key_only",
  SUPABASE_SECRET_KEY: "fake-private",
});
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Remote access forbidden in release review"),
  );
});
afterEach(() => vi.restoreAllMocks());
function repository() {
  return {
    authenticate: vi.fn(async () => owner),
    community: vi.fn(async () => ({ ok: true })),
    planning: vi.fn(async () => ({})),
    contribute: vi.fn(async () => ({ id: "fixture", status: "pending" })),
    photo: vi.fn(async () => Buffer.from("fixture image")),
    uploadPhoto: vi.fn(async () => ({ id: "fixture" })),
    bookingProfile: vi.fn(async () => ({ profile: null })),
    shares: vi.fn(async () => ({})),
    places: vi.fn(async () => []),
  } as unknown as Repository;
}
function legal(current = true) {
  vi.spyOn(SupabaseLegalStore.prototype, "authenticate").mockResolvedValue(
    owner.id,
  );
  vi.spyOn(SupabaseLegalStore.prototype, "status").mockResolvedValue({
    current,
    version: current ? LEGAL_VERSION : null,
    recordedAt: current ? new Date().toISOString() : null,
    publicLocalArea: false,
  });
}
describe("release security: real HTTP and repository boundaries with local mocks", () => {
  it("blocks missing legal acceptance before contributions, profile and generation", async () => {
    legal(false);
    const repo = repository(),
      app = createApp(config, repo);
    for (const path of [
      "/api/contributions",
      "/api/planning/generate",
      "/api/booking/reservations",
    ])
      expect(
        (
          await request(app)
            .post(path)
            .set("Authorization", "Bearer fixture-only")
            .send({})
        ).status,
      ).toBe(403);
    expect(
      (
        await request(app)
          .get("/api/me")
          .set("Authorization", "Bearer fixture-only")
      ).status,
    ).toBe(403);
    expect(repo.authenticate).not.toHaveBeenCalled();
    expect(repo.contribute).not.toHaveBeenCalled();
  });
  it("rejects a traveler at admin routes despite forged role fields", async () => {
    legal();
    const repo = repository(),
      app = createApp(config, repo);
    expect(
      (
        await request(app)
          .get("/api/admin/queue")
          .set("Authorization", "Bearer fixture-only")
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/admin/decisions")
          .set("Authorization", "Bearer fixture-only")
          .send({ role: "admin", app_metadata: { role: "admin" } })
      ).status,
    ).toBe(403);
    expect(repo.community).not.toHaveBeenCalled();
  });
  it("confirmed email and stored role override user-controlled Auth metadata", async () => {
    const repo = new SupabaseRepository(config);
    const getUser = vi.fn();
    const maybeSingle = vi.fn(async () => ({
      data: { role: "traveler" },
      error: null,
    }));
    const query = { select: () => query, eq: () => query, maybeSingle };
    Object.assign(repo, {
      auth: { auth: { getUser } },
      admin: { from: () => query },
    });
    const onboard = vi.spyOn(repo, "community").mockResolvedValue({ ok: true });
    for (const user of [
      null,
      { id: owner.id, email_confirmed_at: null },
      { id: owner.id, email_confirmed_at: "now", is_anonymous: true },
    ]) {
      getUser.mockResolvedValueOnce({ data: { user }, error: null });
      await expect(repo.authenticate("fixture-only")).rejects.toMatchObject({
        status: 401,
      });
    }
    expect(onboard).not.toHaveBeenCalled();
    getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: owner.id,
          email_confirmed_at: "now",
          is_anonymous: false,
          user_metadata: {
            role: "admin",
            guest_phone: "01000000000",
            home_city: "서울",
            home_area: "성동구",
            locality_scope: "area",
          },
        },
      },
      error: null,
    });
    expect(await repo.authenticate("fixture-only")).toEqual(owner);
    expect(JSON.stringify(onboard.mock.calls).includes("01000000000")).toBe(
      false,
    );
  });
  it("does not echo internal errors, credentials or contact details to clients or application logs", async () => {
    legal();
    const repo = repository();
    vi.mocked(repo.community).mockRejectedValue(
      new Error("REVIEW_FAKE_SECRET_AND_PHONE_01000000000"),
    );
    const logs = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];
    const response = await request(createApp(config, repo))
      .get("/api/me")
      .set("Authorization", "Bearer fixture-only");
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body).includes("REVIEW_FAKE_SECRET")).toBe(
      false,
    );
    expect(logs.flatMap((log) => log.mock.calls)).toEqual([]);
  });
  it("rejects unauthenticated, oversized and spoofed photo uploads before persistence", async () => {
    vi.spyOn(SupabaseLegalStore.prototype, "authenticate").mockRejectedValue(
      new AppError(401, "unverified"),
    );
    const repo = repository();
    let app = createApp(config, repo);
    expect(
      (
        await request(app)
          .post(`/api/place-photos/${crypto.randomUUID()}`)
          .set("Content-Type", "image/jpeg")
          .send(Buffer.from("invalid"))
      ).status,
    ).toBe(401);
    vi.mocked(SupabaseLegalStore.prototype.authenticate).mockResolvedValue(
      owner.id,
    );
    vi.spyOn(SupabaseLegalStore.prototype, "status").mockResolvedValue({
      current: true,
      version: LEGAL_VERSION,
      recordedAt: new Date().toISOString(),
      publicLocalArea: false,
    });
    app = createApp(config, repo);
    const headers = {
      Authorization: "Bearer fixture-only",
      "Content-Type": "image/jpeg",
      "X-Photo-Consent": "real-place-photo-v1",
      "X-Place-Target": encodeURIComponent(
        JSON.stringify({ placeId: crypto.randomUUID() }),
      ),
    };
    expect(
      (
        await request(app)
          .post(`/api/place-photos/${crypto.randomUUID()}`)
          .set(headers)
          .send(Buffer.alloc(maxPhotoBytes + 1))
      ).status,
    ).toBe(413);
    expect(
      (
        await request(app)
          .post(`/api/place-photos/${crypto.randomUUID()}`)
          .set(headers)
          .send(Buffer.from("<svg>not a jpeg</svg>"))
      ).status,
    ).toBe(400);
    expect(repo.uploadPhoto).not.toHaveBeenCalled();
  });
  it("strips EXIF/GPS metadata and normalizes actual image bytes", async () => {
    const input = await sharp({
      create: { width: 640, height: 400, channels: 3, background: "#478abb" },
    })
      .withMetadata({ orientation: 6 })
      .withExif({
        IFD0: { Artist: "PRIVATE_FIXTURE_ARTIST" },
        IFD2: {
          GPSLatitudeRef: "N",
          GPSLatitude: "37/1 30/1 0/1",
          GPSLongitudeRef: "E",
          GPSLongitude: "127/1 0/1 0/1",
        },
      })
      .jpeg()
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const photo = await preparePlacePhoto(input, "image/jpeg");
    const metadata = await sharp(photo.data).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(photo.data.includes(Buffer.from("PRIVATE_FIXTURE_ARTIST"))).toBe(
      false,
    );
    expect(metadata.format).toBe("jpeg");
    expect(Math.max(photo.width, photo.height)).toBeLessThanOrEqual(1600);
    await expect(
      preparePlacePhoto(
        await sharp({
          create: { width: 10, height: 10, channels: 3, background: "white" },
        })
          .png()
          .toBuffer(),
        "image/png",
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("serves private photos only to their owner or moderator; public photos need published parents", async () => {
    const repo = new SupabaseRepository(config);
    let row = {
      object_path: "PRIVATE_FIXTURE_PATH",
      user_id: owner.id,
      state: "linked",
      review: "pending",
      expires_at: "2099-01-01T00:00:00Z",
      places: { status: "pending" },
    };
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    };
    const download = vi.fn(async () => ({
      data: new Blob(["fixture bytes"]),
      error: null,
    }));
    Object.assign(repo, {
      admin: { from: () => query, storage: { from: () => ({ download }) } },
    });
    await expect(repo.photo(null, "fixture")).rejects.toMatchObject({
      status: 404,
    });
    await expect(repo.photo(stranger, "fixture")).rejects.toMatchObject({
      status: 404,
    });
    expect(download).not.toHaveBeenCalled();
    await expect(repo.photo(owner, "fixture")).resolves.toBeInstanceOf(Buffer);
    await expect(
      repo.photo({ ...stranger, role: "moderator" }, "fixture"),
    ).resolves.toBeInstanceOf(Buffer);
    row = { ...row, review: "approved" };
    await expect(repo.photo(null, "fixture")).rejects.toMatchObject({
      status: 404,
    });
    row = { ...row, places: { status: "published" } };
    await expect(repo.photo(null, "fixture")).resolves.toBeInstanceOf(Buffer);
  });
  it("keeps an ambiguous reservation unknown and never repeats provider POST on same-key retry", async () => {
    const bookingConfig: BookingConfig = {
      ...config,
      booking: {
        enabled: true,
        accessVerified: true,
        termsVerified: true,
        budget: 2,
      },
      heyyumiKey: "fake-provider",
    };
    const data = reservationSchema.parse({
      requestId: crypto.randomUUID(),
      placeId: crypto.randomUUID(),
      expectedName: "Fixture venue",
      expectedAddress: "Fixture street",
      reservationTime: "2099-11-01T12:00:00+09:00",
      guestCount: 2,
      guestName: "Fixture guest",
      guestPhone: "01000000000",
      note: "PRIVATE_FIXTURE_NOTE",
      consent: true,
      consentVersion: "heyyumi-reservation-v1",
    });
    let saved: StoredReservation | null = null;
    const action = vi.fn(
      async (_id: string, kind: string, p: Record<string, unknown> = {}) => {
        if (kind === "lookup") return saved;
        if (kind === "venue") return { externalId: "fixture-yumi" };
        if (kind === "claim") {
          saved = {
            id: crypto.randomUUID(),
            request_id: data.requestId,
            place_id: data.placeId,
            fingerprint: createHash("sha256")
              .update(JSON.stringify(data))
              .digest("hex"),
            external_id: "fixture-yumi",
            state: "submitting",
            reservation_time: data.reservationTime,
            guest_count: 2,
            provider_reference: null,
            expires_at: null,
            updated_at: new Date().toISOString(),
            revision: 1,
            reconciliation_required: false,
          };
          return { created: true, reservation: saved };
        }
        if (kind === "settle") {
          saved = {
            ...saved!,
            state: p.state as "unknown",
            reconciliation_required: true,
            revision: 2,
          };
          return saved;
        }
        throw new Error("unexpected fixture action");
      },
    );
    const provider = {
      venue: vi.fn(async () => ({
        id: "fixture-yumi",
        name: data.expectedName,
        address: data.expectedAddress,
        supported: true,
      })),
      submit: vi.fn(async () => {
        throw new Error("AMBIGUOUS_FAKE_TIMEOUT");
      }),
      status: vi.fn(),
    };
    const app = express();
    app.use(express.json());
    attachBooking(app, bookingConfig, async () => owner, {
      store: { action },
      provider,
    });
    const handler: ErrorRequestHandler = (error, _req, res, _next) =>
      res.status(error.status || 500).json({ error: error.message });
    app.use(handler);
    const first = await request(app)
      .post("/api/booking/reservations")
      .send(data);
    expect(first.status).toBe(201);
    expect(first.body.state).toBe("unknown");
    const replay = await request(app)
      .post("/api/booking/reservations")
      .send(data);
    expect(replay.status).toBe(200);
    expect(replay.body.state).toBe("unknown");
    expect(provider.submit).toHaveBeenCalledTimes(1);
    expect(provider.status).not.toHaveBeenCalled();
    expect(JSON.stringify(first.body).includes(data.guestPhone)).toBe(false);
    expect(JSON.stringify(publicReservation(saved!)).includes(data.note)).toBe(
      false,
    );
    expect(
      (
        await request(app)
          .post("/api/booking/reservations")
          .send({ ...data, note: "changed" })
      ).status,
    ).toBe(409);
  });
});
