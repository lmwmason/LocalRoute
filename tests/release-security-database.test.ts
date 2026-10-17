import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import request from "supertest";
import { createApp } from "../server/app";
import { readConfig } from "../server/config";
import { SupabaseLegalStore } from "../server/legal";
import type { Repository } from "../server/repository";
import { LEGAL_VERSION } from "../shared/legal";
import { hashShareToken } from "../server/sharing";
import { shareSnapshot } from "../shared/sharing";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { evaluateSchedule, type Itinerary } from "../shared/planner";
import { plannerInput } from "./fixtures/planning";

const owner = "91000000-0000-4000-8000-000000000001";
const stranger = "91000000-0000-4000-8000-000000000002";
const moderator = "91000000-0000-4000-8000-000000000003";
const unverified = "91000000-0000-4000-8000-000000000004";
const placeId = "92000000-0000-4000-8000-000000000001";
const planId = "93000000-0000-4000-8000-000000000001";
let db: PGlite;
const migrations = readdirSync("supabase/migrations")
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({
    name,
    sql: readFileSync(`supabase/migrations/${name}`, "utf8"),
  }));
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant select on auth.users to service_role;
    -- Model the legacy hosted project's broad default table/sequence grants too.
    alter default privileges in schema public grant all on tables to anon,authenticated;
    alter default privileges in schema public grant all on sequences to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant all on storage.objects to anon,authenticated;
    create policy legacy_other_app_policy on storage.objects for all to anon,authenticated using(true) with check(true);`);
  await db.exec(
    "alter default privileges in schema public grant execute on functions to anon,authenticated",
  );
  for (const migration of migrations) await db.exec(migration.sql);
  for (const id of [owner, stranger, moderator, unverified])
    await db.query("insert into auth.users values($1,$2,$3,false)", [
      id,
      `${id}@test.invalid`,
      id === unverified ? null : new Date().toISOString(),
    ]);
  await db.query("insert into public.user_roles values($1,'moderator')", [
    moderator,
  ]);
  await db.query(
    "insert into public.places(id,name,address,lat,lng,status) values($1,'Fixture venue','Fixture street 123',37.54,127.05,'published')",
    [placeId],
  );
  await db.query(
    "insert into public.place_external_ids(place_id,provider,external_id) values($1,'heyyumi','fixture-provider-id')",
    [placeId],
  );
  await db.exec(
    "update public.lp_policy set planning_enabled=true,monthly_promo=300,plan_cost=100,version='pilot-v1'",
  );
}, 30000);
afterAll(async () => {
  await db?.close();
  vi.restoreAllMocks();
});
async function role<T>(
  name: "anon" | "authenticated" | "service_role",
  userId: string,
  fn: (tx: Pick<PGlite, "query" | "exec">) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${name}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      userId,
    ]);
    return fn(tx);
  });
}
async function rpc(
  actor: string | null,
  fn:
    | "planning_action"
    | "community_action"
    | "legal_consent_action"
    | "reservation_action"
    | "itinerary_share_action",
  action: string,
  payload: Record<string, unknown> = {},
  requestId: string | null = null,
) {
  return role(
    "service_role",
    "",
    async (tx) =>
      (
        await tx.query<{ value: Record<string, unknown> }>(
          fn === "planning_action" || fn === "community_action"
            ? `select public.${fn}($1,$2,$3,$4) as value`
            : `select public.${fn}($1,$2,$3) as value`,
          fn === "planning_action" || fn === "community_action"
            ? [actor, action, requestId, payload]
            : [actor, action, payload],
        )
      ).rows[0].value,
  );
}
const consent = (publicLocalArea = false) => ({
  requestId: crypto.randomUUID(),
  version: LEGAL_VERSION,
  language: "ko",
  terms: true,
  privacy: true,
  supabaseTransfer: true,
  adult: true,
  publicLocalArea,
});
describe("release security: complete migration set in disposable PostgreSQL", () => {
  it("enables RLS on every public table despite broad inherited grants", async () => {
    const result = await db.query(
      "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
    );
    expect(result.rows).toEqual([]);
  });
  it("gives no client write/truncate grants or invoker/definer RPC execution", async () => {
    const writes = await db.query(
      "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and (has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') or has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'))",
    );
    expect(writes.rows).toEqual([]);
    const functions = await db.query(
      "select p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.prosecdef or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))",
    );
    expect(functions.rows).toEqual([]);
  });
  it("enforces verified-email legal consent, separate optional publication and immutable evidence", async () => {
    await expect(
      rpc(unverified, "legal_consent_action", "record", consent()),
    ).rejects.toThrow(/Verified email/);
    const value = consent();
    expect(
      await rpc(owner, "legal_consent_action", "record", value),
    ).toMatchObject({ current: true, publicLocalArea: false });
    await rpc(owner, "legal_consent_action", "record", value);
    expect(
      (
        await db.query(
          "select * from public.legal_consent_events where user_id=$1",
          [owner],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      role("authenticated", stranger, (tx) =>
        tx.query("select * from public.legal_consent_events where user_id=$1", [
          owner,
        ]),
      ),
    ).resolves.toMatchObject({ rows: [] });
    await expect(
      role("authenticated", owner, (tx) =>
        tx.query("select public.legal_consent_action($1,'status')", [stranger]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("RS-002 regression: quote cannot issue LP before membership consent", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Remote access forbidden by review"));
    const authenticate = vi
      .spyOn(SupabaseLegalStore.prototype, "authenticate")
      .mockResolvedValue(stranger);
    const status = vi
      .spyOn(SupabaseLegalStore.prototype, "status")
      .mockResolvedValue({
        current: false,
        version: null,
        recordedAt: null,
        publicLocalArea: false,
      });
    try {
      const config = readConfig({
        VITE_DATA_MODE: "live",
        SUPABASE_URL: "https://pjdawapasozsrpnrtsfx.supabase.co",
        VITE_SUPABASE_ANON_KEY: "sb_publishable_fixture_public_key_only",
        SUPABASE_SECRET_KEY: "fake-private",
        FEATURE_AI_PLANNING: "true",
        PLANNING_POLICY_APPROVED: "true",
        FEATURE_KAKAO_DISCOVERY: "true",
        KAKAO_TERMS_VERIFIED: "true",
        GEMINI_API_KEY: "fake-gemini",
        GEMINI_DATA_PROCESSING_APPROVED: "true",
        KAKAO_REST_API_KEY: "fake-kakao",
      });
      const repo = {
        authenticate: async () => ({ id: stranger, role: "traveler" }),
        planning: async (
          _user: unknown,
          action: string,
          requestId: string | null,
          body: Record<string, unknown>,
        ) => rpc(stranger, "planning_action", action, body, requestId),
      } as unknown as Repository;
      const app = createApp(config, repo);
      expect(
        (
          await request(app)
            .get("/api/me")
            .set("Authorization", "Bearer fixture-only")
        ).status,
      ).toBe(403);
      const response = await request(app)
        .get("/api/planning/quote")
        .set("Authorization", "Bearer fixture-only");
      expect(response.status).toBe(403);
      expect(
        (
          await db.query(
            "select * from public.legal_consent_events where user_id=$1",
            [stranger],
          )
        ).rows,
      ).toHaveLength(0);
      const grants = await db.query<{ amount: number }>(
        "select amount from public.lp_ledger where user_id=$1",
        [stranger],
      );
      expect(grants.rows).toEqual([]);
      await expect(rpc(stranger, "planning_action", "balance")).rejects.toThrow(
        /Membership consent required/,
      );
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
      authenticate.mockRestore();
      status.mockRestore();
    }
  });
  it("keeps grant/debit idempotent, releases failures and rejects foreign requests/stale edits", async () => {
    const value = {
      input: {
        destination: "fixture",
        startDate: "2026-11-01",
        endDate: "2026-11-01",
      },
      expectedCost: 100,
      policyVersion: "pilot-v1",
      consent: true,
    };
    const key = crypto.randomUUID();
    await rpc(owner, "planning_action", "balance");
    await rpc(owner, "planning_action", "balance");
    expect(
      (
        await db.query(
          "select * from public.monthly_lp_grants where user_id=$1",
          [owner],
        )
      ).rows,
    ).toHaveLength(1);
    const hold = await rpc(owner, "planning_action", "reserve", value, key);
    expect(
      await rpc(owner, "planning_action", "reserve", value, key),
    ).toMatchObject({ replay: true });
    await expect(
      rpc(
        owner,
        "planning_action",
        "reserve",
        { ...value, input: { destination: "changed" } },
        key,
      ),
    ).rejects.toThrow(/Idempotency/);
    await expect(
      rpc(stranger, "planning_action", "status", {}, key),
    ).rejects.toThrow(/not found/);
    const result = {
      evaluation: {
        valid: true,
        errors: [],
        warnings: [],
        checks: {
          stopCount: 2,
          localMeals: 0,
          preferenceMatches: 0,
          verifiedHours: 0,
        },
      },
      provenance: "gemini",
      catalog: [{ id: "one" }, { id: "two" }],
      schedule: {
        title: "Accounting regression fixture",
        summary: "Synthetic stops for accounting checks only.",
        days: [
          {
            date: "2026-11-01",
            stops: [
              {
                candidateId: "one",
                start: "10:00",
                end: "11:00",
                purpose: "visit",
                explanation: "First synthetic fixture stop.",
              },
              {
                candidateId: "two",
                start: "11:30",
                end: "12:30",
                purpose: "visit",
                explanation: "Second synthetic fixture stop.",
              },
            ],
          },
        ],
      },
    };
    await rpc(owner, "planning_action", "finalize", { result }, key);
    await rpc(owner, "planning_action", "finalize", { result }, key);
    expect(
      (
        await db.query(
          "select * from public.lp_ledger where user_id=$1 and amount<0",
          [owner],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      rpc(stranger, "planning_action", "get", { id: hold.id }),
    ).rejects.toThrow(/not found/);
    await expect(
      rpc(owner, "planning_action", "save", {
        id: hold.id,
        revision: 2,
        result,
      }),
    ).rejects.toThrow(/Revision conflict/);
    const failed = crypto.randomUUID();
    await rpc(owner, "planning_action", "reserve", value, failed);
    await rpc(
      owner,
      "planning_action",
      "fail",
      { code: "LOCAL_MOCK_FAILURE" },
      failed,
    );
    await expect(
      rpc(owner, "planning_action", "finalize", { result }, failed),
    ).rejects.toThrow(/expired/);
    expect(
      (
        await db.query(
          "select * from public.lp_ledger where user_id=$1 and amount<0",
          [owner],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      role("authenticated", owner, (tx) =>
        tx.query(
          "insert into public.lp_ledger(user_id,bucket,amount,event_key,reason) values($1,'earned',100,'forged','forged')",
          [owner],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      role("service_role", "", (tx) =>
        tx.query("delete from public.lp_ledger"),
      ),
    ).rejects.toThrow(/append-only/);
  });
  it("rejects non-admin moderation even through the trusted server RPC", async () => {
    await expect(rpc(owner, "community_action", "queue")).rejects.toThrow(
      /Moderator/,
    );
    await expect(
      role("authenticated", owner, (tx) =>
        tx.query("update public.user_roles set role='admin' where user_id=$1", [
          owner,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      rpc(moderator, "community_action", "queue"),
    ).resolves.toBeTruthy();
  });
  it("enforces reservation ownership, idempotency, active-slot uniqueness and private contact RLS", async () => {
    const data = {
      requestId: crypto.randomUUID(),
      fingerprint: "a".repeat(64),
      placeId,
      externalId: "fixture-provider-id",
      reservationTime: "2099-11-01T12:00:00+09:00",
      guestCount: 2,
      guestName: "Fixture guest",
      guestPhone: "01000000000",
      note: "FIXTURE_PRIVATE_NOTE",
      consent: true,
      consentVersion: "heyyumi-reservation-v1",
    };
    const first = await rpc(owner, "reservation_action", "claim", data);
    expect(first.created).toBe(true);
    const row = first.reservation as Record<string, unknown>;
    expect(await rpc(owner, "reservation_action", "claim", data)).toMatchObject(
      { created: false },
    );
    await expect(
      rpc(owner, "reservation_action", "claim", {
        ...data,
        fingerprint: "b".repeat(64),
      }),
    ).rejects.toThrow(/Changed/);
    await expect(
      rpc(owner, "reservation_action", "claim", {
        ...data,
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/Duplicate/);
    await expect(
      rpc(stranger, "reservation_action", "read", { id: row.id }),
    ).rejects.toThrow(/Not found/);
    expect(
      (
        await role("authenticated", stranger, (tx) =>
          tx.query("select * from public.reservations"),
        )
      ).rows,
    ).toEqual([]);
    const own = (
      await role("authenticated", owner, (tx) =>
        tx.query<{ guest_phone: string }>(
          "select guest_phone from public.reservations",
        ),
      )
    ).rows;
    expect(own).toEqual([{ guest_phone: "01000000000" }]);
    expect(
      JSON.stringify(
        (await db.query("select details from public.audit_logs")).rows,
      ).includes("01000000000"),
    ).toBe(false);
    expect(
      JSON.stringify(
        (await db.query("select * from public.reservation_status_events")).rows,
      ).includes("FIXTURE_PRIVATE_NOTE"),
    ).toBe(false);
  });
  it("allows share reads only by an unexpired secret token; excludes free text and protects owner revoke", async () => {
    const input = { ...plannerInput, dietary: "FIXTURE_PRIVATE_DIETARY" };
    const schedule = demoSchedule(input);
    const plan = {
      id: planId,
      revision: 1,
      input,
      schedule: {
        ...schedule,
        title: "FIXTURE_PRIVATE_TITLE",
        summary: "FIXTURE_PRIVATE_SUMMARY",
      },
      catalog: demoCatalog,
      evaluation: {
        ...evaluateSchedule(schedule, input, demoCatalog),
        valid: true,
      },
      createdAt: new Date().toISOString(),
      model: "private-model",
      provenance: "demo",
      cost: 0,
    } as Itinerary;
    const snapshot = shareSnapshot(plan);
    const token = "z".repeat(43);
    expect(JSON.stringify(snapshot).includes("FIXTURE_PRIVATE")).toBe(false);
    await db.query(
      "insert into public.itineraries(id,user_id,result) values($1,$2,$3)",
      [planId, owner, plan],
    );
    const data = {
      itineraryId: planId,
      revision: 1,
      consentVersion: "unlisted-itinerary-v1",
      expiresInDays: 7,
      tokenHash: hashShareToken(token),
      snapshot,
    };
    await expect(
      rpc(stranger, "itinerary_share_action", "create", data),
    ).rejects.toThrow(/not found/);
    const share = await rpc(owner, "itinerary_share_action", "create", data);
    await expect(
      rpc(null, "itinerary_share_action", "public", {
        tokenHash: hashShareToken("wrong"),
      }),
    ).rejects.toThrow(/not found/);
    expect(
      await rpc(null, "itinerary_share_action", "public", {
        tokenHash: hashShareToken(token),
      }),
    ).toEqual(snapshot);
    expect(
      (
        await role("authenticated", stranger, (tx) =>
          tx.query("select * from public.itinerary_shares"),
        )
      ).rows,
    ).toEqual([]);
    await expect(
      rpc(stranger, "itinerary_share_action", "revoke", { id: share.id }),
    ).rejects.toThrow(/not found/);
    await rpc(owner, "itinerary_share_action", "revoke", { id: share.id });
    await rpc(owner, "itinerary_share_action", "revoke", { id: share.id });
    await expect(
      rpc(null, "itinerary_share_action", "public", {
        tokenHash: hashShareToken(token),
      }),
    ).rejects.toThrow(/not found/);
    expect(
      (
        await db.query<{ token_hash: string }>(
          "select token_hash from public.itinerary_shares",
        )
      ).rows[0].token_hash,
    ).toBe(hashShareToken(token));
    const expiring = await rpc(owner, "itinerary_share_action", "create", {
      ...data,
      tokenHash: hashShareToken("y".repeat(43)),
    });
    await db.query(
      "update public.itinerary_shares set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=$1",
      [expiring.id],
    );
    await expect(
      rpc(null, "itinerary_share_action", "public", {
        tokenHash: hashShareToken("y".repeat(43)),
      }),
    ).rejects.toThrow(/not found/);
  });
  it("blocks photo Storage bypass even if another application granted broad access", async () => {
    await db.query(
      "insert into storage.objects(bucket_id,name) values('place-photos','private-fixture.jpg'),('other-app','public-fixture.jpg')",
    );
    for (const user of ["anon", "authenticated"] as const) {
      const rows = await role(user, owner, (tx) =>
        tx.query<{ bucket_id: string }>(
          "select bucket_id from storage.objects",
        ),
      );
      expect(rows.rows).toEqual([{ bucket_id: "other-app" }]);
      await expect(
        role(user, owner, (tx) =>
          tx.query(
            "insert into storage.objects(bucket_id,name) values('place-photos','forged.jpg')",
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    }
    expect(
      (
        await db.query<{ public: boolean }>(
          "select public from storage.buckets where id='place-photos'",
        )
      ).rows[0].public,
    ).toBe(false);
  });
  it("keeps newly added visit rewards human-authorized, attributable and idempotent", async () => {
    const reward = (
      actor: string,
      action: string,
      body: Record<string, unknown> = {},
      enabled = false,
    ) =>
      role(
        "service_role",
        "",
        async (tx) =>
          (
            await tx.query<{ value: Record<string, unknown> }>(
              "select public.visit_reward_action($1,$2,$3,$4) as value",
              [actor, action, body, enabled],
            )
          ).rows[0].value,
      );
    const endorsement = crypto.randomUUID(),
      version = crypto.randomUUID(),
      review = crypto.randomUUID(),
      rating = crypto.randomUUID();
    await db.query(
      "insert into public.endorsements(id,user_id,place_id) values($1,$2,$3)",
      [endorsement, stranger, placeId],
    );
    await db.query(
      "insert into public.endorsement_versions(id,endorsement_id,version,text,status) values($1,$2,1,'First-hand fixture endorsement','published')",
      [version, endorsement],
    );
    await db.query(
      "update public.endorsements set published_version_id=$1 where id=$2",
      [version, endorsement],
    );
    await db.query(
      "insert into public.place_reviews(id,user_id,place_id,rating,text,visited_on) values($1,$2,$3,1,'Honest negative fixture review',current_date-1)",
      [review, owner, placeId],
    );
    const visitedOn = (
      await db.query<{ date: string }>(
        "select (visited_on::text) as date from public.place_reviews where id=$1",
        [review],
      )
    ).rows[0].date;
    await db.query(
      "insert into public.endorsement_ratings(id,user_id,endorsement_version_id,review_id,helpfulness) values($1,$2,$3,$4,5)",
      [rating, owner, version, review],
    );
    const body = {
      requestId: crypto.randomUUID(),
      ratingId: rating,
      evidence: "Fixture independent evidence for human review",
      affiliated: false,
      consent: true,
      expectedHelpfulness: 5,
      expectedVisitedOn: visitedOn,
    };
    const visit = await reward(owner, "submit", body);
    await reward(owner, "submit", body);
    await expect(
      reward(unverified, "submit", { ...body, requestId: crypto.randomUUID() }),
    ).rejects.toThrow(/Verified email/);
    await expect(reward(stranger, "get", { id: visit.id })).rejects.toThrow(
      /Not found/,
    );
    await expect(
      reward(owner, "issue", { id: visit.id }, true),
    ).rejects.toThrow(/Admin/);
    await expect(
      reward(moderator, "issue", { id: visit.id }, true),
    ).rejects.toThrow(/Rewards disabled/);
    const decision = {
      id: visit.id,
      requestId: crypto.randomUUID(),
      decision: "approve",
      reason: "Independent fixture human review",
      evidenceSummary:
        "Independent fixture evidence checked by a human moderator",
      independentEvidence: true,
      affiliationsChecked: true,
      collusionChecked: true,
    };
    await expect(reward(owner, "decide", decision)).rejects.toThrow(/Admin/);
    await reward(moderator, "decide", decision);
    await db.exec(
      "update public.visit_reward_policy set enabled=true; update public.lp_policy set rewards_enabled=true;",
    );
    // Two retries are serialized by PostgreSQL transactions in this in-memory harness.
    await Promise.all([
      reward(moderator, "issue", { id: visit.id }, true),
      reward(moderator, "issue", { id: visit.id }, true),
    ]);
    const issued = await db.query<{ user_id: string; amount: number }>(
      "select user_id,amount from public.lp_ledger where event_key=$1",
      [`visit-reward:${visit.id}`],
    );
    expect(issued.rows).toEqual([{ user_id: stranger, amount: 20 }]);
    await db.query(
      "update public.place_reviews set visited_on=current_date where id=$1",
      [review],
    );
    const today = (
      await db.query<{ date: string }>(
        "select visited_on::text as date from public.place_reviews where id=$1",
        [review],
      )
    ).rows[0].date;
    const second = await reward(owner, "submit", {
      ...body,
      requestId: crypto.randomUUID(),
      expectedVisitedOn: today,
    });
    await reward(moderator, "decide", {
      ...decision,
      id: second.id,
      requestId: crypto.randomUUID(),
    });
    await expect(
      reward(moderator, "issue", { id: second.id }, true),
    ).rejects.toThrow(/90 day window/);
    await db.query(
      "insert into public.visit_reward_affiliations(user_id,place_id,kind,reason,updated_by) values($1,$2,'affiliate','Fixture conflict disclosure',$3)",
      [owner, placeId, moderator],
    );
    await expect(
      reward(moderator, "issue", { id: second.id }, true),
    ).rejects.toThrow(/Affiliation ineligible/);
    expect(
      (
        await db.query(
          "select id from public.lp_ledger where reason='Verified attributable endorsement outcome'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from public.visit_reward_grants where request_id=$1",
          [visit.id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await role("authenticated", stranger, (tx) =>
          tx.query("select * from public.visit_reward_requests"),
        )
      ).rows,
    ).toEqual([]);
    await expect(
      role("authenticated", owner, (tx) =>
        tx.query("select public.visit_reward_action($1,'issue',$2,true)", [
          owner,
          { id: visit.id },
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("update public.visit_reward_grants set amount=999"),
    ).rejects.toThrow(/append-only/);
  });
});
