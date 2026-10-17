import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { LEGAL_VERSION } from "../shared/legal";
const a = "10000000-0000-4000-8000-000000000001";
const b = "10000000-0000-4000-8000-000000000002";
const unverified = "10000000-0000-4000-8000-000000000003";
let db: PGlite;
const payload = (publicLocalArea = false) => ({
  requestId: crypto.randomUUID(),
  version: LEGAL_VERSION,
  language: "ko",
  terms: true,
  privacy: true,
  supabaseTransfer: true,
  adult: true,
  publicLocalArea,
});
beforeAll(async () => {
  db = new PGlite();
  // Disposable in-memory fixture; never stores application data or connects remotely.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant select on auth.users to service_role;
    create table public.profiles(user_id uuid primary key,home_city text,home_area text,locality_scope text,public_local_area boolean default false);
    create table public.curator_identities(user_id uuid primary key,local_area_label text);
    create function public.locality_label(text,text,text) returns text language sql as $$select concat_ws(' ',$1,$2)$$;
    grant select,update on public.profiles,public.curator_identities to service_role;
    insert into auth.users values('${a}','a@test.invalid',now(),false),('${b}','b@test.invalid',now(),false),('${unverified}','c@test.invalid',null,false);
    insert into public.profiles values('${a}','서울','성동구','area',false),('${b}','서울','','city',false);
    insert into public.curator_identities(user_id) values('${a}'),('${b}');`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261017034938_legal_consents.sql",
      "utf8",
    ),
  );
});
afterAll(async () => {
  await db?.close();
});
async function role<T>(
  name: string,
  userId: string,
  fn: (tx: Pick<PGlite, "exec" | "query">) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${name}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      userId,
    ]);
    return fn(tx);
  });
}
function action(userId: string, value: unknown, name = "record") {
  return role("service_role", "", (tx) =>
    tx.query<{
      result: {
        current: boolean;
        recordedAt: string;
        publicLocalArea: boolean;
      };
    }>("select public.legal_consent_action($1,$2,$3::jsonb) as result", [
      userId,
      name,
      JSON.stringify(value),
    ]),
  );
}
describe("legal consent actual PostgreSQL authorization and idempotency", () => {
  it("does not publish locality from untrusted Auth/profile metadata without consent", async () => {
    await db.query(
      "update public.profiles set public_local_area=true where user_id=$1",
      [b],
    );
    await db.query(
      "update public.curator_identities set local_area_label='injected area' where user_id=$1",
      [b],
    );
    expect(
      (
        await db.query<{ public_local_area: boolean }>(
          "select public_local_area from public.profiles where user_id=$1",
          [b],
        )
      ).rows[0].public_local_area,
    ).toBe(false);
    expect(
      (
        await db.query<{ local_area_label: string | null }>(
          "select local_area_label from public.curator_identities where user_id=$1",
          [b],
        )
      ).rows[0].local_area_label,
    ).toBeNull();
  });
  it("starts incomplete and rejects unverified, anonymous and missing accounts", async () => {
    expect((await action(b, {}, "status")).rows[0].result.current).toBe(false);
    await expect(action(unverified, payload())).rejects.toThrow(
      /Verified email/,
    );
    await db.query(
      "update auth.users set email_confirmed_at=now(),is_anonymous=true where id=$1",
      [unverified],
    );
    await expect(action(unverified, payload())).rejects.toThrow(
      /Verified email/,
    );
    await expect(action(crypto.randomUUID(), payload())).rejects.toThrow(
      /Verified email/,
    );
  });
  it("records DB time once and never accepts a caller timestamp or changed replay", async () => {
    const value = payload(true);
    const first = (await action(a, value)).rows[0].result;
    expect(first.current).toBe(true);
    expect(Math.abs(Date.now() - Date.parse(first.recordedAt))).toBeLessThan(
      10000,
    );
    expect((await action(a, value)).rows[0].result.recordedAt).toBe(
      first.recordedAt,
    );
    await expect(
      action(a, { ...value, publicLocalArea: false }),
    ).rejects.toThrow(/Idempotency conflict/);
    await expect(
      action(a, { ...payload(), recordedAt: "2000-01-01" }),
    ).rejects.toThrow(/Unknown consent fields/);
    const count = await db.query<{ count: number }>(
      "select count(*)::int as count from public.legal_consent_events where user_id=$1",
      [a],
    );
    expect(count.rows[0].count).toBe(1);
  });
  it("rejects missing/false/string required choices and obsolete versions", async () => {
    for (const field of ["terms", "privacy", "supabaseTransfer", "adult"]) {
      for (const value of [false, "true", null])
        await expect(
          action(a, { ...payload(), [field]: value }),
        ).rejects.toThrow(/Invalid/);
    }
    await expect(action(a, { ...payload(), version: "old" })).rejects.toThrow(
      /outdated/,
    );
    await expect(action(a, { ...payload(), userId: b })).rejects.toThrow(
      /Unknown/,
    );
  });
  it("atomically removes the public label on optional withdrawal, including old replay", async () => {
    const old = payload(true);
    await action(a, old);
    expect(
      (
        await db.query<{ local_area_label: string }>(
          "select local_area_label from public.curator_identities where user_id=$1",
          [a],
        )
      ).rows[0].local_area_label,
    ).toBe("서울 성동구");
    await action(a, payload(false));
    expect((await action(a, old)).rows[0].result.publicLocalArea).toBe(false);
    expect(
      (
        await db.query<{ local_area_label: string | null }>(
          "select local_area_label from public.curator_identities where user_id=$1",
          [a],
        )
      ).rows[0].local_area_label,
    ).toBeNull();
  });
  it("isolates owner reads with RLS and denies client writes/RPC and server rewrites", async () => {
    await action(b, payload());
    const own = await role("authenticated", a, (tx) =>
      tx.query<{ user_id: string }>(
        "select user_id from public.legal_consent_events",
      ),
    );
    expect(own.rows.length).toBeGreaterThan(0);
    expect(own.rows.every((row) => row.user_id === a)).toBe(true);
    await expect(
      role("anon", "", (tx) =>
        tx.query("select * from public.legal_consent_events"),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      role("authenticated", a, (tx) =>
        tx.query("select public.legal_consent_action($1,'status')", [b]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      role("authenticated", a, (tx) =>
        tx.query("delete from public.legal_consent_events"),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      role("authenticated", a, (tx) =>
        tx.query("insert into public.legal_consent_events default values"),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      role("service_role", "", (tx) =>
        tx.query("update public.legal_consent_events set adult=false"),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("update public.legal_consent_events set language='en'"),
    ).rejects.toThrow(/immutable/);
    const rls = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where oid='public.legal_consent_events'::regclass",
    );
    expect(rls.rows[0].relrowsecurity).toBe(true);
  });
  it("supports concurrent duplicate retries with one event", async () => {
    const value = payload();
    await Promise.all([action(b, value), action(b, value)]);
    const rows = await db.query<{ count: number }>(
      "select count(*)::int as count from public.legal_consent_events where request_id=$1",
      [value.requestId],
    );
    expect(rows.rows[0].count).toBe(1);
  });
});
