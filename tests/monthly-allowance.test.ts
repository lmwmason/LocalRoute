import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import request from "supertest";
import express from "express";
import { SupabaseRepository, type Repository } from "../server/repository";
import { attachPlanner } from "../server/planner/routes";
import { readConfig } from "../server/config";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text default 'allowance@example.test',email_confirmed_at timestamptz default now(),is_anonymous boolean default false);
    create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant select on auth.users to service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated;`);
  for (const file of readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 60_000);
afterAll(async () => {
  await db?.close();
});
async function member(consent = true) {
  const id = crypto.randomUUID();
  await db.query("insert into auth.users(id)values($1)", [id]);
  if (consent)
    await db.query(
      "insert into public.legal_consent_events(user_id,request_id,version,language,terms,privacy,supabase_transfer,adult,public_local_area)values($1,$2,'2026-10-17.1','en',true,true,true,true,false)",
      [id, crypto.randomUUID()],
    );
  return id;
}
async function claim(actor: string | null, role = "service_role") {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    return (
      await tx.query<{ value: { granted: boolean; amount: number } }>(
        "select public.claim_monthly_lp($1)value",
        [actor],
      )
    ).rows[0].value;
  });
}
async function ledger(actor: string) {
  return (
    await db.query<{
      grants: number;
      rows: number;
      promo: number;
      debits: number;
    }>(
      `select
    (select count(*)::int from public.monthly_lp_grants where user_id=$1)grants,
    count(*)::int rows,coalesce(sum(amount),0)::int promo,
    count(*)filter(where amount<0)::int debits from public.lp_ledger where user_id=$1`,
      [actor],
    )
  ).rows[0];
}
async function plan(
  actor: string,
  action: string,
  requestId: string | null,
  payload: unknown = {},
) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (
      await tx.query<{ value: Record<string, unknown> }>(
        "select public.planning_action($1,$2,$3,$4::jsonb)value",
        [actor, action, requestId, JSON.stringify(payload)],
      )
    ).rows[0].value;
  });
}
describe("monthly membership allowance", () => {
  it("defaults to 100 LP independently of disabled/free planning", async () => {
    expect(
      (
        await db.query<{ monthly_promo: number }>(
          "select monthly_promo from public.lp_policy",
        )
      ).rows[0].monthly_promo,
    ).toBe(100);
    await db.exec(
      "update public.lp_policy set planning_enabled=false,plan_cost=0",
    );
    const actor = await member();
    expect(await claim(actor)).toMatchObject({ granted: true, amount: 100 });
    expect(await plan(actor, "balance", null)).toMatchObject({
      enabled: false,
      cost: 0,
      promo: 100,
    });
    expect(await ledger(actor)).toEqual({
      grants: 1,
      rows: 1,
      promo: 100,
      debits: 0,
    });
  });
  it("rejects missing/unconfirmed/anonymous/email-less identities and unaccepted membership", async () => {
    await expect(claim(null)).rejects.toThrow("Verified email required");
    await expect(claim(crypto.randomUUID())).rejects.toThrow(
      "Verified email required",
    );
    for (const patch of [
      "email_confirmed_at=null",
      "is_anonymous=true",
      "email=null",
    ]) {
      const actor = await member();
      await db.query(`update auth.users set ${patch} where id=$1`, [actor]);
      await expect(claim(actor)).rejects.toThrow("Verified email required");
      expect(await ledger(actor)).toEqual({
        grants: 0,
        rows: 0,
        promo: 0,
        debits: 0,
      });
    }
    const actor = await member(false);
    await expect(claim(actor)).rejects.toThrow("Membership consent required");
    expect(await ledger(actor)).toEqual({
      grants: 0,
      rows: 0,
      promo: 0,
      debits: 0,
    });
  });
  it("serializes duplicate claims into one Seoul-month grant and immutable ledger row", async () => {
    const actor = await member();
    const results = await Promise.all([
      claim(actor),
      claim(actor),
      claim(actor),
    ]);
    expect(results.filter((result) => result.granted)).toHaveLength(1);
    expect(results.every((result) => result.amount === 100)).toBe(true);
    expect(await ledger(actor)).toEqual({
      grants: 1,
      rows: 1,
      promo: 100,
      debits: 0,
    });
    const dates = (
      await db.query<{ correct: boolean }>(
        "select month=date_trunc('month',now()at time zone'Asia/Seoul')::date and expires_at=(month+interval'1 month')at time zone'Asia/Seoul' correct from public.monthly_lp_grants g join public.lp_ledger l on l.user_id=g.user_id where g.user_id=$1",
        [actor],
      )
    ).rows[0];
    expect(dates.correct).toBe(true);
    await expect(
      db.query("update public.lp_ledger set amount=99 where user_id=$1", [
        actor,
      ]),
    ).rejects.toThrow("append-only");
  });
  it("rolls back a grant if its ledger insert fails", async () => {
    const actor = await member();
    await db.query(
      "insert into public.lp_ledger(user_id,bucket,amount,event_key,reason,expires_at)values($1,'promo',10,'monthly:'||date_trunc('month',now()at time zone'Asia/Seoul')::date::text,'Conflicting test fixture',now()+interval'1 day')",
      [actor],
    );
    await expect(claim(actor)).rejects.toThrow();
    expect(await ledger(actor)).toEqual({
      grants: 0,
      rows: 1,
      promo: 10,
      debits: 0,
    });
  });
  it("denies browser RPC access", async () => {
    const actor = await member();
    for (const role of ["anon", "authenticated"])
      await expect(claim(actor, role)).rejects.toThrow("permission denied");
    expect(await ledger(actor)).toEqual({
      grants: 0,
      rows: 0,
      promo: 0,
      debits: 0,
    });
  });
  it("preserves historical 300-LP grants without granting again", async () => {
    const actor = await member();
    await db.exec("update public.lp_policy set monthly_promo=300");
    await claim(actor);
    await db.exec("update public.lp_policy set monthly_promo=100");
    expect(await claim(actor)).toMatchObject({ granted: false, amount: 300 });
    expect(await ledger(actor)).toEqual({
      grants: 1,
      rows: 1,
      promo: 300,
      debits: 0,
    });
  });
  it("keeps failed/retried free generation at zero debit after the benefit was granted", async () => {
    const actor = await member();
    await claim(actor);
    await db.exec(
      "update public.lp_policy set planning_enabled=true,plan_cost=0,version='operator-free-v1'",
    );
    const requestId = crypto.randomUUID();
    const payload = {
      input: { destination: "seongsu" },
      expectedCost: 0,
      policyVersion: "operator-free-v1",
      consent: true,
    };
    expect(await plan(actor, "reserve", requestId, payload)).toMatchObject({
      cost: 0,
      replay: false,
    });
    expect(await plan(actor, "reserve", requestId, payload)).toMatchObject({
      replay: true,
    });
    await plan(actor, "fail", requestId, { code: "GENERATION_FAILED" });
    expect(await plan(actor, "reserve", requestId, payload)).toMatchObject({
      status: "failed",
      replay: true,
    });
    expect(await plan(actor, "balance", null)).toMatchObject({
      promo: 100,
      held: 0,
    });
    expect(await ledger(actor)).toEqual({
      grants: 1,
      rows: 1,
      promo: 100,
      debits: 0,
    });
  });
});
describe("server allowance integration", () => {
  it("claims before reading balance and fails closed on a failed claim", async () => {
    const repository = Object.create(
      SupabaseRepository.prototype,
    ) as SupabaseRepository;
    const rpc = vi.fn(
      async (
        _name: string,
        _args: unknown,
      ): Promise<{ data: unknown; error: { code: string } | null }> => ({
        data: { promo: 100 },
        error: null,
      }),
    );
    Object.defineProperty(repository, "admin", { value: { rpc } });
    const actor = { id: crypto.randomUUID(), role: "traveler" as const };
    await expect(
      repository.planning(actor, "balance", null, {}),
    ).resolves.toEqual({ promo: 100 });
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "claim_monthly_lp",
      "planning_action",
    ]);
    rpc.mockClear();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(
      repository.planning(actor, "balance", null, {}),
    ).rejects.toMatchObject({ status: 403 });
    expect(rpc).toHaveBeenCalledOnce();
  });
  it("returns wallet balance while generation is disabled", async () => {
    const planning = vi.fn(async () => ({
      enabled: true,
      cost: 0,
      promo: 100,
      earned: 0,
    }));
    const app = express();
    attachPlanner(
      app,
      { ...readConfig({}), planning: false },
      { planning } as unknown as Repository,
      async () => ({ id: crypto.randomUUID(), role: "traveler" }),
    );
    const response = await request(app).get("/api/planning/quote");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      enabled: false,
      promo: 100,
      cost: 0,
    });
    expect(planning).toHaveBeenCalledOnce();
  });
});
