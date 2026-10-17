import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
const user = "50000000-0000-4000-8000-000000000001",
  other = "50000000-0000-4000-8000-000000000002";
let db: PGlite;
async function action(
  actor: string,
  name: string,
  requestId: string | null,
  payload: Record<string, unknown> = {},
) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (
      await tx.query<{ value: Record<string, unknown> }>(
        "select public.planning_action($1,$2,$3,$4)value",
        [actor, name, requestId, payload],
      )
    ).rows[0].value;
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),is_anonymous boolean default false);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant select on auth.users to service_role;insert into auth.users(id,email) values('${user}','planner@test.invalid'),('${other}','other-planner@test.invalid');`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  // Membership was independently accepted before these accounting-only fixtures.
  for (const id of [user, other])
    await db.query(
      "insert into public.legal_consent_events(user_id,request_id,version,language,terms,privacy,supabase_transfer,adult,public_local_area)values($1,$2,'2026-10-17.1','en',true,true,true,true,false)",
      [id, crypto.randomUUID()],
    );
  // Exercise multiple paid reservations with an explicit test-only budget;
  // the production default allowance is verified in monthly-allowance.test.ts.
  await db.exec(
    "update public.lp_policy set planning_enabled=true,monthly_promo=300,plan_cost=100,version='pilot-v1'",
  );
});
afterAll(async () => {
  await db?.close();
});
describe("atomic LP reservations, save and debit", () => {
  it("shows existing balances while planning is disabled without granting a new allowance", async () => {
    await db.exec("update public.lp_policy set planning_enabled=false");
    expect(await action(other, "balance", null)).toMatchObject({
      enabled: false,
      promo: 0,
      earned: 0,
    });
    expect(
      (
        await db.query(
          "select * from public.monthly_lp_grants where user_id=$1",
          [other],
        )
      ).rows,
    ).toHaveLength(0);
    await db.exec("update public.lp_policy set planning_enabled=true");
  });
  const payload = {
    input: {
      destination: "seongsu",
      startDate: "2026-11-01",
      endDate: "2026-11-01",
    },
    expectedCost: 100,
    policyVersion: "pilot-v1",
    consent: true,
  };
  it("issues promotional LP exactly once per Seoul calendar month", async () => {
    expect(await action(user, "balance", null)).toMatchObject({
      promo: 300,
      earned: 0,
    });
    expect(await action(user, "balance", null)).toMatchObject({ promo: 300 });
    expect(
      (
        await db.query(
          "select * from public.monthly_lp_grants where user_id=$1",
          [user],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("reserves without debiting, replays an identical key, releases failed generation", async () => {
    const id = crypto.randomUUID();
    await action(user, "reserve", id, payload);
    expect(await action(user, "reserve", id, payload)).toMatchObject({
      replay: true,
    });
    expect(await action(user, "balance", null)).toMatchObject({
      promo: 200,
      held: 100,
    });
    expect(
      (await db.query("select * from public.lp_ledger where amount<0")).rows,
    ).toHaveLength(0);
    await expect(
      action(user, "reserve", id, { ...payload, expectedCost: 101 }),
    ).rejects.toThrow();
    await action(user, "fail", id, { code: "SCHEDULE_QUALITY_FAILED" });
    expect(await action(user, "balance", null)).toMatchObject({
      promo: 300,
      held: 0,
    });
  });
  it("does not save or charge an invalid plan; stores a valid result and charges once", async () => {
    const id = crypto.randomUUID();
    const reserved = await action(user, "reserve", id, payload);
    await expect(
      action(user, "finalize", id, {
        result: {
          evaluation: { valid: false },
          catalog: [{}, {}],
          provenance: "gemini",
        },
      }),
    ).rejects.toThrow(/Invalid generated plan/);
    expect(
      (await db.query("select * from public.lp_ledger where amount<0")).rows,
    ).toHaveLength(0);
    const result = {
      id: reserved.id,
      evaluation: {
        valid: true,
        errors: [],
        warnings: [],
        checks: {
          stopCount: 2,
          localMeals: 1,
          preferenceMatches: 1,
          verifiedHours: 0,
        },
      },
      catalog: [{ id: "grounded-1" }, { id: "grounded-2" }],
      provenance: "gemini",
      title: "A validated test plan",
      schedule: {
        title: "A validated test plan",
        summary: "Grounded, validated accounting fixture.",
        days: [
          {
            date: "2026-11-01",
            stops: [
              {
                candidateId: "grounded-1",
                start: "10:00",
                end: "11:00",
                purpose: "visit",
                explanation: "Grounded test attraction stop.",
              },
              {
                candidateId: "grounded-2",
                start: "12:00",
                end: "13:00",
                purpose: "lunch",
                explanation: "Grounded test restaurant stop.",
              },
            ],
          },
        ],
      },
    };
    const first = await action(user, "finalize", id, { result });
    const second = await action(user, "finalize", id, { result });
    expect(second).toEqual(first);
    expect(
      (await db.query("select * from public.lp_ledger where amount<0")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.itineraries")).rows,
    ).toHaveLength(1);
    expect(await action(user, "balance", null)).toMatchObject({
      promo: 200,
      held: 0,
    });
    await action(user, "fail", id, { code: "LOST_HTTP_RESPONSE" });
    expect(await action(user, "status", id)).toMatchObject({ status: "ready" });
  });
  it("prevents overspending concurrent reservations and releases holds without a refund mutation", async () => {
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const results = await Promise.allSettled(
      ids.map((id) => action(user, "reserve", id, payload)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    for (let i = 0; i < ids.length; i++)
      if (results[i].status === "fulfilled") await action(user, "fail", ids[i]);
    expect(await action(user, "balance", null)).toMatchObject({
      promo: 200,
      held: 0,
    });
  });
  it("spends promo first and keeps earned LP after promotional expiration", async () => {
    await db.query(
      "insert into public.lp_ledger(user_id,bucket,amount,event_key,reason)values($1,'earned',150,'earned-test','Verified test outcome')",
      [user],
    );
    await db.query(
      "insert into public.lp_ledger(user_id,bucket,amount,event_key,reason,expires_at)values($1,'promo',500,'expired-test','Expired test allowance',now()-interval'1 day')",
      [user],
    );
    expect(await action(user, "balance", null)).toMatchObject({
      promo: 200,
      earned: 150,
    });
    const id = crypto.randomUUID();
    await action(user, "reserve", id, payload);
    const holds = await db.query<{
      promo_reserved: number;
      earned_reserved: number;
    }>(
      "select promo_reserved,earned_reserved from public.planning_requests where request_id=$1",
      [id],
    );
    expect(holds.rows[0]).toEqual({ promo_reserved: 100, earned_reserved: 0 });
    await action(user, "fail", id);
  });
  it("enforces ledger immutability and owner-only access even through direct SQL", async () => {
    await expect(
      db.query("update public.lp_ledger set amount=999 where user_id=$1", [
        user,
      ]),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.query("delete from public.lp_ledger where user_id=$1", [user]),
    ).rejects.toThrow(/append-only/);
    await db.transaction(async (tx) => {
      await tx.exec(
        `set local role authenticated;select set_config('request.jwt.claim.sub','${other}',true)`,
      );
      expect(
        (await tx.query("select * from public.itineraries")).rows,
      ).toHaveLength(0);
    });
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(
          `set local role authenticated;select set_config('request.jwt.claim.sub','${other}',true)`,
        );
        await tx.query(
          "insert into public.lp_ledger(user_id,bucket,amount,event_key,reason)values($1,'earned',999,'attack','attack')",
          [other],
        );
      }),
    ).rejects.toThrow(/permission denied/);
    const id = (
      await db.query<{ id: string }>(
        "select id from public.itineraries limit 1",
      )
    ).rows[0].id;
    await expect(action(other, "get", null, { id })).rejects.toThrow(
      /not found/,
    );
  });
});
