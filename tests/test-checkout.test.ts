import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { attachTestCheckout } from "../server/testcheckout";
import { readConfig } from "../server/config";
import { AppError } from "../server/errors";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create table auth.users(id uuid primary key,email text default 'bonus@test.invalid',email_confirmed_at timestamptz default now(),is_anonymous boolean default false);
    create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;grant select on auth.users to service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated;`);
  for (const file of readdirSync("supabase/migrations").filter(file => file.endsWith(".sql")).sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 60000);
afterAll(async () => { await db?.close(); });
async function member(consent = true) {
  const id = crypto.randomUUID();
  await db.query("insert into auth.users(id)values($1)", [id]);
  if (consent) await db.query("insert into public.legal_consent_events(user_id,request_id,version,language,terms,privacy,supabase_transfer,adult,public_local_area)values($1,$2,'2026-10-17.1','en',true,true,true,true,false)", [id, crypto.randomUUID()]);
  return id;
}
async function bonus(id: string | null, action = "claim", role = "service_role") {
  return db.transaction(async tx => {
    await tx.exec(`set local role ${role}`);
    return (await tx.query<{value: {claimed: boolean;granted: boolean;amount: number}}>("select public.test_checkout_bonus($1,$2)value", [id,action])).rows[0].value;
  });
}
describe("one-time free test bonus", () => {
  it("status never issues LP; repeated and concurrent claims issue exactly one fixed 100 LP", async () => {
    const id = await member();
    expect(await bonus(id, "status")).toEqual({claimed:false,granted:false,amount:100});
    const results = await Promise.all([bonus(id),bonus(id),bonus(id)]);
    expect(results.filter(value => value.granted)).toHaveLength(1);
    expect(await bonus(id, "status")).toEqual({claimed:true,granted:false,amount:100});
    expect((await db.query("select amount,bucket,event_key,expires_at from public.lp_ledger where user_id=$1",[id])).rows).toEqual([{amount:100,bucket:"earned",event_key:"test-checkout:welcome-v1",expires_at:null}]);
    expect((await db.query("select * from public.audit_logs where actor_id=$1 and action='checkout.free_test_bonus'",[id])).rows).toHaveLength(1);
  });
  it("rejects unverified, anonymous, email-less, missing and unconsented accounts", async () => {
    await expect(bonus(null)).rejects.toThrow("Verified email required");
    await expect(bonus(crypto.randomUUID())).rejects.toThrow("Verified email required");
    await expect(bonus(await member(false))).rejects.toThrow("Membership consent required");
    for (const patch of ["email=null","email_confirmed_at=null","is_anonymous=true"]) {
      const id = await member();
      await db.query(`update auth.users set ${patch} where id=$1`,[id]);
      await expect(bonus(id)).rejects.toThrow("Verified email required");
      expect((await db.query("select * from public.lp_ledger where user_id=$1",[id])).rows).toHaveLength(0);
    }
  });
  it("denies browser RPC access even with valid membership", async () => {
    const id = await member();
    for(const role of ["anon","authenticated"]) await expect(bonus(id,"claim",role)).rejects.toThrow("permission denied");
  });
  it("rolls back the ledger if the audit insert fails", async () => {
    const id = await member();
    await db.exec("create function public.fail_bonus_audit()returns trigger language plpgsql as $$begin if new.action='checkout.free_test_bonus'then raise exception 'fixture audit failure';end if;return new;end;$$;create trigger fail_bonus_audit before insert on public.audit_logs for each row execute function public.fail_bonus_audit()");
    try { await expect(bonus(id)).rejects.toThrow("fixture audit failure"); }
    finally { await db.exec("drop trigger fail_bonus_audit on public.audit_logs;drop function public.fail_bonus_audit()"); }
    expect((await db.query("select * from public.lp_ledger where user_id=$1",[id])).rows).toHaveLength(0);
    expect((await bonus(id)).granted).toBe(true);
  });
});
describe("test bonus HTTP boundary", () => {
  function app(auth = true) {
    const instance=express();instance.use(express.json());
    const execute=vi.fn(async()=>({claimed:true,granted:true,amount:100}));
    attachTestCheckout(instance,{config:{...readConfig({}),live:true},actor:async()=>{if(!auth)throw new AppError(401,"AUTH");return{id:"00000000-0000-4000-8000-000000000001",role:"traveler"};},limit:vi.fn(),execute});
    const error:ErrorRequestHandler=(cause,_req,res,_next)=>{res.status(cause instanceof AppError?cause.status:400).json({error:"rejected"});};instance.use(error);
    return{instance,execute};
  }
  it("requires authentication and explicit consent, rejects client-selected amount or account",async()=>{
    const denied=app(false);expect((await request(denied.instance).post("/api/checkout/test-bonus").send({accepted:true,requestId:crypto.randomUUID()})).status).toBe(401);expect(denied.execute).not.toHaveBeenCalled();
    const ready=app();
    for(const body of [{accepted:false,requestId:crypto.randomUUID()},{accepted:true,requestId:crypto.randomUUID(),amount:10000},{accepted:true,requestId:crypto.randomUUID(),actor:crypto.randomUUID()}])expect((await request(ready.instance).post("/api/checkout/test-bonus").send(body)).status).toBe(400);
    expect(ready.execute).not.toHaveBeenCalled();
    expect((await request(ready.instance).post("/api/checkout/test-bonus").send({accepted:true,requestId:crypto.randomUUID()})).body).toEqual({claimed:true,granted:true,amount:100});
    expect(ready.execute).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001","claim");
  });
});
