import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { z } from "zod";
import { readConfig } from "../server/config";
import { attachBooking } from "../server/booking";
import { bookingEnabled, readBookingSettings } from "../server/booking/config";
import {
  HeyYumiBooking,
  type BookingProvider,
  type ProviderResult,
} from "../server/booking/provider";
import { bookingDatabaseError } from "../server/booking/store";
import { AppError } from "../server/errors";
import {
  mayTransition,
  providerState,
  reservationConsent,
} from "../shared/reservations";

const a = "70000000-0000-4000-8000-000000000001",
  b = "70000000-0000-4000-8000-000000000002";
const place = "70000000-0000-4000-8000-000000000003";
let db: PGlite;
const config = {
  ...readConfig({
    VITE_DATA_MODE: "live",
    SUPABASE_URL: "https://pjdawapasozsrpnrtsfx.supabase.co",
    VITE_SUPABASE_ANON_KEY: "sb_publishable_fixture_public_key_only",
    SUPABASE_SECRET_KEY: "mock-secret",
    HEY_YUMI_API_KEY: "mock-provider",
  }),
  booking: {
    enabled: true,
    accessVerified: true,
    termsVerified: true,
    budget: 30,
  },
};
const value = (status = "pending"): ProviderResult => ({
  reservationId: "provider-1",
  placeId: "yumi-123",
  status,
  expiresAt: "2099-12-01T10:05:00Z",
});
const provider = {
  venue: vi.fn<BookingProvider["venue"]>(async () => ({
    id: "yumi-123",
    name: "Test restaurant",
    address: "Seoul test address",
    supported: true,
    phone: "0212345678",
  })),
  submit: vi.fn<BookingProvider["submit"]>(async () => value()),
  status: vi.fn<BookingProvider["status"]>(async () => value("confirmed")),
};
const input = () => ({
  requestId: crypto.randomUUID(),
  placeId: place,
  expectedName: "Test restaurant",
  expectedAddress: "Seoul test address",
  reservationTime: "2099-12-01T19:00:00+09:00",
  guestCount: 2,
  guestName: "Private guest",
  guestPhone: "+821012345678",
  note: "Private note",
  consentVersion: reservationConsent,
  consent: true,
});
async function action(
  actor: string,
  name: string,
  payload: Record<string, unknown> = {},
) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (
      await tx.query<{ value: unknown }>(
        "select public.reservation_action($1,$2,$3) value",
        [actor, name, payload],
      )
    ).rows[0].value;
  });
}
function app(enabled = true) {
  const app = express();
  app.use(express.json());
  attachBooking(
    app,
    { ...config, booking: { ...config.booking, enabled } },
    async (req) => {
      if (!req.get("Authorization")) throw new AppError(401, "login");
      if (req.get("Authorization") === "unverified")
        throw new AppError(403, "verify");
      return {
        id: req.get("Authorization") === "other" ? b : a,
        role: "traveler",
      };
    },
    {
      store: {
        async action(...args) {
          try {
            return await action(...args);
          } catch (e) {
            throw bookingDatabaseError(e as { code?: string });
          }
        },
      },
      provider,
    },
  );
  const handler: ErrorRequestHandler = (e, _req, res, _next) => {
    if (e instanceof AppError && e.retryAfter) res.set("Retry-After", e.retryAfter);
    res
      .status(
        e instanceof z.ZodError ? 400 : e instanceof AppError ? e.status : 500,
      )
      .json({ error: e.message });
  };
  app.use(handler);
  return app;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role; grant select on auth.users to service_role;
    insert into auth.users(id) values('${a}'),('${b}');`);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(`insert into public.places(id,name,address,lat,lng,status) values('${place}','Test restaurant','Seoul test address',37,127,'published');
    insert into public.place_external_ids(place_id,provider,external_id) values('${place}','heyyumi','yumi-123');`);
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "delete from public.reservation_status_events; delete from public.reservations",
  );
  vi.clearAllMocks();
  provider.submit.mockImplementation(async () => value());
  provider.status.mockImplementation(async () => value("confirmed"));
  provider.venue.mockImplementation(async () => ({
    id: "yumi-123",
    name: "Test restaurant",
    address: "Seoul test address",
    supported: true,
    phone: "0212345678",
  }));
});

describe("existing reservation recovery and independent rate limits", () => {
  it("finds only the owner's active reservation on the Korean calendar date without provider submission", async () => {
    const instance = app();
    const body = { ...input(), reservationTime: "2099-12-01T00:30:00+09:00" };
    const created = await request(instance).post("/api/booking/reservations").set("Authorization", "owner").send(body).expect(201);
    const path = `/api/booking/reservations/existing?placeId=${place}&date=2099-12-01`;
    const existing = await request(instance).get(path).set("Authorization", "owner").expect(200);
    expect(existing.body.reservation.id).toBe(created.body.id);
    expect(existing.body.reservation.state).toBe("pending");
    expect(JSON.stringify(existing.body)).not.toContain("Private");
    expect((await request(instance).get(path).set("Authorization", "other").expect(200)).body.reservation).toBeNull();
    expect((await request(instance).get(path.replace("2099-12-01", "2099-11-30")).set("Authorization", "owner").expect(200)).body.reservation).toBeNull();
    await request(instance).get(path).expect(401);
    for (const state of ["submitting", "unknown", "confirmed"]) {
      await db.query("update public.reservations set state=$1 where id=$2", [state, created.body.id]);
      expect((await request(instance).get(path).set("Authorization", "owner")).body.reservation.state).toBe(state);
    }
    await db.query("update public.reservations set state='declined',reconciliation_required=false where id=$1", [created.body.id]);
    expect((await request(instance).get(path).set("Authorization", "owner")).body.reservation).toBeNull();
    await db.query("update public.reservations set reconciliation_required=true where id=$1", [created.body.id]);
    expect((await request(instance).get(path).set("Authorization", "owner")).body.reservation.id).toBe(created.body.id);
    expect(provider.submit).toHaveBeenCalledTimes(1);
  });
  it("allows 120 reads independently of mutations and returns a decreasing Retry-After", async () => {
    const instance = app();
    const path = `/api/booking/reservations/existing?placeId=${place}&date=2099-12-01`;
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      for (let i=0;i<120;i++) await request(instance).get(path).set("Authorization","owner").expect(200);
      clock.mockReturnValue(now+15000);
      const limited=await request(instance).get(path).set("Authorization","owner").expect(429);
      expect(limited.body.error).toBe("booking.limit");
      expect(limited.headers["retry-after"]).toBe("45");
      // Heavy status reads must not consume the separate mutation bucket.
      await request(instance).post("/api/booking/reservations").set("Authorization","owner").send(input()).expect(201);
    } finally { clock.mockRestore(); }
  });
});
describe("booking access, consent and durable state", () => {
  it("recovers abandoned submitting state, honors provider expiry, and denies anonymous table access", async () => {
    const api = app();
    const body = input();
    const saved = (
      await request(api)
        .post("/api/booking/reservations")
        .set("Authorization", "owner")
        .send(body)
        .expect(201)
    ).body;
    await db.query(
      "update public.reservations set state='submitting',provider_reference=null,updated_at=now()-interval '1 minute' where id=$1",
      [saved.id],
    );
    const recovered = (
      await request(api)
        .post(`/api/booking/reservations/${saved.id}/refresh`)
        .set("Authorization", "owner")
        .send({})
        .expect(200)
    ).body;
    expect(recovered).toMatchObject({
      state: "unknown",
      reconciliationRequired: true,
    });
    expect(provider.submit).toHaveBeenCalledTimes(1);
    expect(provider.status).not.toHaveBeenCalled();
    await db.query(
      "update public.reservations set state='pending',provider_reference='provider-1' where id=$1",
      [saved.id],
    );
    provider.status.mockResolvedValueOnce(value("expired"));
    expect(
      (
        await request(api)
          .post(`/api/booking/reservations/${saved.id}/refresh`)
          .set("Authorization", "owner")
          .send({})
          .expect(200)
      ).body.state,
    ).toBe("expired");
    for (const table of ["reservations", "reservation_status_events"]) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec("set local role anon");
          await tx.exec(`select * from public.${table}`);
        }),
      ).rejects.toThrow(/permission denied/);
    }
  });
  it("fails closed without flags/access/terms and rejects another Supabase project", async () => {
    expect(readBookingSettings({})).toMatchObject({
      enabled: false,
      accessVerified: false,
      termsVerified: false,
    });
    expect(
      bookingEnabled({
        ...config,
        booking: { ...config.booking, accessVerified: false },
      }),
    ).toBe(false);
    expect(
      bookingEnabled({
        ...config,
        booking: { ...config.booking, termsVerified: false },
      }),
    ).toBe(false);
    expect(() =>
      bookingEnabled({ ...config, url: "https://other.supabase.co" }),
    ).toThrow(/pjdawapasozsrpnrtsfx/);
    await request(app(false))
      .post("/api/booking/reservations")
      .set("Authorization", "owner")
      .send(input())
      .expect(503);
    expect(provider.submit).not.toHaveBeenCalled();
    expect(provider.venue).not.toHaveBeenCalled();
  });
  it("requires verified authentication, exact venue identity, future time and consent", async () => {
    const api = app();
    const body = input();
    await request(api).post("/api/booking/reservations").send(body).expect(401);
    await request(api)
      .post("/api/booking/reservations")
      .set("Authorization", "unverified")
      .send(body)
      .expect(403);
    for (const patch of [
      { consent: false },
      { consentVersion: "old" },
      { guestCount: 0 },
      { guestPhone: "bad" },
      { reservationTime: "2000-01-01T10:00:00Z" },
    ])
      await request(api)
        .post("/api/booking/reservations")
        .set("Authorization", "owner")
        .send({ ...body, ...patch })
        .expect(400);
    await request(api)
      .post("/api/booking/reservations")
      .set("Authorization", "owner")
      .send({ ...body, expectedName: "Other restaurant" })
      .expect(409);
    provider.venue.mockResolvedValueOnce({
      id: "yumi-123",
      name: "Test restaurant",
      address: "Seoul test address",
      supported: false,
      phone: "0212345678",
    });
    await request(api)
      .post("/api/booking/reservations")
      .set("Authorization", "owner")
      .send(body)
      .expect(422);
    expect(provider.submit).not.toHaveBeenCalled();
  });
  it("creates pending once under concurrent retries, blocks changed payloads and alternate duplicate keys", async () => {
    const api = app();
    const body = input();
    const responses = await Promise.all(
      [1, 2, 3].map(() =>
        request(api)
          .post("/api/booking/reservations")
          .set("Authorization", "owner")
          .send(body),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(provider.submit).toHaveBeenCalledTimes(1);
    const saved = responses.find((r) => r.status === 201)!.body;
    expect(saved.state).toBe("pending");
    expect(saved).not.toHaveProperty("guestPhone");
    expect(saved).not.toHaveProperty("note");
    expect(provider.submit.mock.calls[0][2]).toBe(saved.id);
    await request(api)
      .post("/api/booking/reservations")
      .set("Authorization", "owner")
      .send({ ...body, guestCount: 3 })
      .expect(409);
    await request(api)
      .post("/api/booking/reservations")
      .set("Authorization", "owner")
      .send({ ...body, requestId: crypto.randomUUID(), guestCount: 4 })
      .expect(409);
    const confirmed = await request(api)
      .post(`/api/booking/reservations/${saved.id}/refresh`)
      .set("Authorization", "owner")
      .send({})
      .expect(200);
    expect(confirmed.body.state).toBe("confirmed");
    expect(
      (await db.query("select * from public.lp_ledger")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("select * from public.reservation_status_events")
      ).rows.every((row) => !JSON.stringify(row).includes("Private")),
    ).toBe(true);
  });
  it("preserves unknown after lost create response and never repeats provider POST", async () => {
    const api = app();
    const body = input();
    provider.submit.mockRejectedValueOnce(new Error("timeout"));
    const created = await request(api)
      .post("/api/booking/reservations")
      .set("Authorization", "owner")
      .send(body)
      .expect(201);
    expect(created.body).toMatchObject({
      state: "unknown",
      providerReference: null,
      reconciliationRequired: true,
    });
    await request(api)
      .post("/api/booking/reservations")
      .set("Authorization", "owner")
      .send(body)
      .expect(200);
    const polled = await request(api)
      .post(`/api/booking/reservations/${created.body.id}/refresh`)
      .set("Authorization", "owner")
      .send({})
      .expect(200);
    expect(polled.body.state).toBe("unknown");
    expect(provider.status).not.toHaveBeenCalled();
    expect(provider.submit).toHaveBeenCalledTimes(1);
    await request(api)
      .post("/api/booking/reservations")
      .set("Authorization", "owner")
      .send({ ...body, requestId: crypto.randomUUID() })
      .expect(409);
  });
  it("keeps pending on failed lookup; maps merchant cancellation to declined and respects expiresAt", async () => {
    const api = app();
    const created = await request(api)
      .post("/api/booking/reservations")
      .set("Authorization", "owner")
      .send(input())
      .expect(201);
    const url = `/api/booking/reservations/${created.body.id}/refresh`;
    provider.status.mockRejectedValueOnce(new Error("404"));
    expect(
      (
        await request(api)
          .post(url)
          .set("Authorization", "owner")
          .send({})
          .expect(200)
      ).body,
    ).toMatchObject({ state: "pending", reconciliationRequired: true });
    provider.status.mockResolvedValueOnce(value("cancelled"));
    const declined = (
      await request(api)
        .post(url)
        .set("Authorization", "owner")
        .send({})
        .expect(200)
    ).body;
    expect(declined.state).toBe("declined");
    expect(Date.parse(declined.expiresAt)).toBe(Date.parse(value().expiresAt!));
  });
  it("prevents stale/contradictory provider responses from regressing confirmed bookings", async () => {
    const api = app();
    const created = await request(api)
      .post("/api/booking/reservations")
      .set("Authorization", "owner")
      .send(input())
      .expect(201);
    const url = `/api/booking/reservations/${created.body.id}/refresh`;
    const confirmed = (
      await request(api)
        .post(url)
        .set("Authorization", "owner")
        .send({})
        .expect(200)
    ).body;
    await action(a, "settle", {
      id: confirmed.id,
      revision: 1,
      state: "pending",
    });
    provider.status.mockResolvedValueOnce(value("pending"));
    const stale = (
      await request(api)
        .post(url)
        .set("Authorization", "owner")
        .send({})
        .expect(200)
    ).body;
    expect(stale).toMatchObject({
      state: "confirmed",
      reconciliationRequired: true,
    });
    provider.status.mockResolvedValueOnce({
      ...value(),
      placeId: "wrong-place",
    });
    expect(
      (
        await request(api)
          .post(url)
          .set("Authorization", "owner")
          .send({})
          .expect(200)
      ).body.state,
    ).toBe("confirmed");
    expect(mayTransition("confirmed", "pending")).toBe(false);
    expect(providerState("new-status")).toBe("unknown");
  });
  it("enforces read/poll/cancel ownership and RLS; no fake cancellation endpoint", async () => {
    const api = app();
    const body = input();
    const saved = (
      await request(api)
        .post("/api/booking/reservations")
        .set("Authorization", "owner")
        .send(body)
        .expect(201)
    ).body;
    await request(api)
      .get(`/api/booking/reservations/${saved.id}`)
      .set("Authorization", "other")
      .expect(404);
    await request(api)
      .post(`/api/booking/reservations/${saved.id}/refresh`)
      .set("Authorization", "other")
      .expect(404);
    await request(api)
      .post(`/api/booking/reservations/${saved.id}/cancel`)
      .set("Authorization", "other")
      .expect(404);
    await request(api)
      .post(`/api/booking/reservations/${saved.id}/cancel`)
      .set("Authorization", "owner")
      .expect(409);
    await request(api)
      .get(`/api/booking/requests/${body.requestId}`)
      .set("Authorization", "other")
      .expect(404);
    // Existing records stay readable when submissions are disabled.
    await request(app(false))
      .get(`/api/booking/reservations/${saved.id}`)
      .set("Authorization", "owner")
      .expect(200);
    for (const user of [a, b])
      await db.transaction(async (tx) => {
        await tx.exec(
          `set local role authenticated;select set_config('request.jwt.claim.sub','${user}',true)`,
        );
        expect(
          (await tx.query("select * from public.reservations")).rows,
        ).toHaveLength(user === a ? 1 : 0);
        expect(
          (await tx.query("select * from public.reservation_status_events"))
            .rows,
        ).toHaveLength(user === a ? 2 : 0);
      });
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select public.reservation_action($1,'profile','{}')", [
          a,
        ]);
      }),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.exec("update public.reservations set state='confirmed'");
      }),
    ).rejects.toThrow(/permission denied/);
  });
  it("loads existing private booking profile and redacts old contact snapshots without altering history", async () => {
    await db.query(
      "insert into public.booking_profiles(user_id,guest_name,guest_phone,consent_version) values($1,'Saved Guest','01011112222','booking-profile-v1')",
      [a],
    );
    const api = app();
    expect(
      (
        await request(api)
          .get("/api/booking/profile")
          .set("Authorization", "owner")
          .expect(200)
      ).body.guestName,
    ).toBe("Saved Guest");
    expect(
      (
        await request(api)
          .get("/api/booking/profile")
          .set("Authorization", "other")
          .expect(200)
      ).body,
    ).toBeNull();
    const saved = (
      await request(api)
        .post("/api/booking/reservations")
        .set("Authorization", "owner")
        .send(input())
        .expect(201)
    ).body;
    await db.query(
      "update public.reservations set reservation_time=now()-interval '31 days' where id=$1",
      [saved.id],
    );
    await action(a, "redact");
    expect(
      (
        await db.query(
          "select guest_phone,guest_name,note from public.reservations",
        )
      ).rows[0],
    ).toEqual({ guest_phone: null, guest_name: null, note: null });
    expect(
      (await db.query("select * from public.reservation_status_events")).rows,
    ).toHaveLength(2);
  });
});
describe("official HeyYumi adapter contract (mock network only)", () => {
  it("distinguishes the local budget from provider throttling and does not retry either automatically", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        success: true,
        data: { id: "place", name: "Test", address: {}, yumiReservable: true },
      }),
    );
    const local = new HeyYumiBooking("mock-key", 1, fetcher);
    await local.venue("place");
    await expect(local.venue("place")).rejects.toMatchObject({
      status: 429,
      message: "booking.budget",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const limitedFetch = vi.fn<typeof fetch>(
      async () =>
        new Response("{}", { status: 429, headers: { "Retry-After": "90" } }),
    );
    const external = new HeyYumiBooking("mock-key", 30, limitedFetch);
    await expect(external.venue("place")).rejects.toMatchObject({
      message: "booking.providerLimit",
      retryAfter: "90",
    });
    await expect(external.venue("place")).rejects.toMatchObject({
      message: "booking.providerLimit",
    });
    expect(limitedFetch).toHaveBeenCalledTimes(1);
  });

  it("uses official paths, minimal tiers and stable idempotency key without availability or cancel calls", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "yumi-123",
              name: "Test",
              address: { road: "Seoul" },
              yumiReservable: true,
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: value() })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: value("confirmed") }),
        ),
      );
    const adapter = new HeyYumiBooking("mock-key", 30, fetcher);
    expect((await adapter.venue("yumi-123")).supported).toBe(true);
    await adapter.submit(
      "yumi-123",
      { ...input(), consent: true },
      "stable-key",
    );
    await adapter.status("provider-1");
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.heyyumi.ai/api/v1/places/yumi-123?fields=core,contact_hours",
    );
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toMatchObject({
      placeId: "yumi-123",
      idempotencyKey: "stable-key",
      guestPhone: "+821012345678",
    });
    expect(fetcher.mock.calls[2][0]).toBe(
      "https://api.heyyumi.ai/api/v1/reservations/provider-1",
    );
  });
  it("propagates 401/404/422/5xx, honors Retry-After, and fails closed on missing eligibility", async () => {
    for (const status of [401, 404, 422, 500])
      await expect(
        new HeyYumiBooking(
          "key",
          30,
          vi.fn().mockResolvedValue(new Response("{}", { status })),
        ).venue("id"),
      ).rejects.toBeInstanceOf(AppError);
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 429, headers: { "Retry-After": "120" } }),
      );
    const adapter = new HeyYumiBooking("key", 30, fetcher);
    await expect(adapter.venue("id")).rejects.toMatchObject({
      status: 429,
      retryAfter: "120",
    });
    await expect(adapter.venue("id")).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const noFlag = new HeyYumiBooking(
      "key",
      30,
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: "id", name: "Test", address: {} },
          }),
        ),
      ),
    );
    expect((await noFlag.venue("id")).supported).toBe(false);
  });
});
