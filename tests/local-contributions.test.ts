import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { LEGAL_VERSION } from "../shared/legal";
const a = "60000000-0000-4000-8000-000000000001",
  b = "60000000-0000-4000-8000-000000000002",
  mod = "60000000-0000-4000-8000-000000000003";
let db: PGlite;
async function service(sql: string, args: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (await tx.query<{ value: Record<string, unknown> }>(sql, args))
      .rows[0]?.value;
  });
}
const community = (
  actor: string,
  action: string,
  payload: Record<string, unknown>,
  requestId: string | null = crypto.randomUUID(),
) =>
  service("select public.community_action($1,$2,$3,$4)value", [
    actor,
    action,
    requestId,
    payload,
  ]);
// Public locality now requires versioned evidence, independently of profile metadata.
const acceptLocality = (actor: string, publicLocalArea: boolean) =>
  service("select public.legal_consent_action($1,'record',$2)value", [actor, {
    requestId: crypto.randomUUID(), version: LEGAL_VERSION, language: "ko",
    terms: true, privacy: true, supabaseTransfer: true, adult: true, publicLocalArea,
  }]);
const target = {
  manualPlace: {
    kind: "culture",
    name: "Test cultural venue",
    address: "Seoul test street 1",
    lat: 37.545,
    lng: 127.053,
  },
};
async function photo(
  actor: string,
  requestId: string,
  selected: unknown = target,
) {
  const record = await service(
    "select public.register_place_photo($1,$2,$3,$4,640,400)value",
    [actor, requestId, selected, "a".repeat(64)],
  );
  await db.query("update public.place_photos set state='ready'where id=$1", [
    record!.id,
  ]);
  return record!;
}
const contribute = (
  actor: string,
  requestId: string,
  photoId: unknown,
  selected = target,
) =>
  service(
    "select public.submit_photographed_contribution($1,$2,$3,null)value",
    [
      actor,
      requestId,
      {
        ...selected,
        photoId,
        text: "A first-hand recommendation from my own visit.",
      },
    ],
  );
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant select on auth.users to service_role;insert into auth.users values('${a}'),('${b}'),('${mod}');
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant all on storage.objects to anon,authenticated;create policy broad_other_app_policy on storage.objects for all to anon,authenticated using(true)with check(true);`);
  await db.exec(`alter table auth.users add column email text, add column email_confirmed_at timestamptz, add column is_anonymous boolean default false;
    update auth.users set email=id::text||'@test.invalid', email_confirmed_at=now();`);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query("insert into public.user_roles values($1,'moderator')", [mod]);
});
afterAll(async () => {
  await db?.close();
});
describe("private home area and required, attributed place photos", () => {
  it('enables RLS on every exposed table, including private booking and photo records',async()=>{
    expect((await db.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relkind='r'and not c.relrowsecurity")).rows).toEqual([]);
  });
  it("stores optional booking contact details only for the owner and allows deletion without leaking them to audit or public identity", async () => {
    const call = (
      actor: string,
      action: string,
      payload: Record<string, unknown> = {},
    ) =>
      service("select public.booking_profile_action($1,$2,$3)value", [
        actor,
        action,
        payload,
      ]);
    await expect(
      call(a, "save", { guestName: "Test Guest", guestPhone: "01000000000" }),
    ).rejects.toThrow(/Invalid booking profile/);
    await call(a, "save", {
      guestName: "Test Guest",
      guestPhone: "01000000000",
      consentVersion: "booking-profile-v1",
    });
    expect(await call(a, "get")).toMatchObject({
      profile: { guestName: "Test Guest", guestPhone: "01000000000" },
    });
    expect(await call(b, "get")).toMatchObject({ profile: null });
    await db.transaction(async (tx) => {
      await tx.exec(
        `set local role authenticated;select set_config('request.jwt.claim.sub','${b}',true)`,
      );
      expect(
        (await tx.query("select * from public.booking_profiles")).rows,
      ).toHaveLength(0);
    });
    expect(
      (
        await db.query(
          "select * from public.audit_logs where details::text like '%01000000000%'",
        )
      ).rows,
    ).toHaveLength(0);
    await call(a, "delete");
    expect(await call(a, "get")).toMatchObject({ profile: null });
  });
  it("stores a rural home area privately while exposing only the chosen city recommendation scope", async () => {
    await acceptLocality(a, true);
    await community(
      a,
      "onboard_profile",
      {
        displayName: "Rural contributor",
        homeCity: "충주시",
        homeArea: "살미면",
        localityScope: "auto",
        publicLocalArea: true,
      },
      null,
    );
    expect(await community(a, "workspace", {}, null)).toMatchObject({
      homeCity: "충주시",
      homeArea: "살미면",
      localityScope: "auto",
    });
    expect(
      (
        await db.query<{ local_area_label: string }>(
          "select local_area_label from public.curator_identities where user_id=$1",
          [a],
        )
      ).rows[0].local_area_label,
    ).toBe("충주시");
    await acceptLocality(a, false);
    await community(a, "profile", {
      displayName: "City contributor",
      homeCity: "서울특별시",
      homeArea: "성동구",
      localityScope: "auto",
      publicLocalArea: false,
    });
  });
  it("keeps home areas private by default and only publishes explicit opt-in labels", async () => {
    await acceptLocality(b, true);
    await community(
      a,
      "onboard_profile",
      {
        displayName: "Curator A",
        homeRegion: "서울 성동구",
        publicLocalArea: false,
      },
      null,
    );
    await community(
      b,
      "onboard_profile",
      {
        displayName: "Curator B",
        homeRegion: "London, Camden",
        publicLocalArea: true,
      },
      null,
    );
    await db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      const ids = await tx.query<{ local_area_label: string | null }>(
        "select local_area_label from public.curator_identities order by user_id",
      );
      expect(ids.rows.map((r) => r.local_area_label)).toEqual([
        null,
        "London, Camden",
      ]);
    });
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query("select home_region from public.profiles");
      }),
    ).rejects.toThrow(/permission denied/);
    await acceptLocality(a, true);
    await community(a, "profile", {
      displayName: "Curator A",
      homeRegion: "서울 성동구",
      publicLocalArea: true,
    });
    await community(
      a,
      "onboard_profile",
      {
        displayName: "Overwriting metadata",
        homeRegion: "Wrong area",
        publicLocalArea: false,
      },
      null,
    );
    expect(await community(a, "workspace", {}, null)).toMatchObject({
      displayName: "Curator A",
      homeRegion: "서울 성동구",
      publicLocalArea: true,
    });
  });
  it("rejects missing photos, cross-user photos, changed places and expired uploads before creating anything", async () => {
    const id = crypto.randomUUID(),
      record = await photo(a, id);
    await expect(contribute(a, id, crypto.randomUUID())).rejects.toThrow(
      /photograph required/,
    );
    await expect(contribute(b, id, record.id)).rejects.toThrow(
      /photograph required/,
    );
    await expect(
      contribute(a, id, record.id, {
        manualPlace: { ...target.manualPlace, name: "A different place" },
      }),
    ).rejects.toThrow(/photograph required/);
    await db.query(
      "update public.place_photos set expires_at=now()-interval'1 minute'where id=$1",
      [record.id],
    );
    await expect(contribute(a, id, record.id)).rejects.toThrow(
      /photograph required/,
    );
    expect(
      (await db.query("select * from public.place_submissions")).rows,
    ).toHaveLength(0);
  });
  it("atomically links one photograph, replays without duplicates, requires human photo review and preserves the experience kind", async () => {
    const id = crypto.randomUUID(),
      record = await photo(a, id),
      result = await contribute(a, id, record.id);
    expect(await contribute(a, id, record.id)).toEqual(result);
    expect(
      (await db.query("select * from public.place_submissions")).rows,
    ).toHaveLength(1);
    const approval = {
      kind: "submission",
      id: result!.id,
      decision: "approve",
      reason: "Verified place identity and original photograph.",
      confirmNew: true,
    };
    await expect(community(mod, "decide", approval)).rejects.toThrow(
      /photograph first/,
    );
    await expect(
      community(b, "decide", {
        kind: "photo",
        id: record.id,
        decision: "approve",
        reason: "I am not a moderator",
      }),
    ).rejects.toThrow(/Moderator required/);
    await community(mod, "decide", {
      kind: "photo",
      id: record.id,
      decision: "approve",
      reason: "Photo depicts the selected venue without personal details.",
    });
    await community(mod, "decide", approval);
    const places = await db.query<{ id: string; kind: string }>(
      "select id,kind from public.places",
    );
    expect(places.rows[0].kind).toBe("culture");
    const photos = await db.query<{
      state: string;
      review: string;
      place_id: string;
    }>("select state,review,place_id from public.place_photos where id=$1", [
      record.id,
    ]);
    expect(photos.rows[0]).toEqual({
      state: "linked",
      review: "approved",
      place_id: places.rows[0].id,
    });
  });
  it("denies client writes, cross-user reads and direct storage access even when another policy is permissive", async () => {
    await db.transaction(async (tx) => {
      await tx.exec(
        `set local role authenticated;select set_config('request.jwt.claim.sub','${b}',true)`,
      );
      expect(
        (await tx.query("select * from public.place_photos")).rows,
      ).toHaveLength(0);
    });
    await expect(
      db.transaction(async (tx) => {
        await tx.exec(
          `set local role authenticated;select set_config('request.jwt.claim.sub','${b}',true)`,
        );
        await tx.query("update public.place_photos set review='approved'");
      }),
    ).rejects.toThrow(/permission denied/);
    await db.query(
      "insert into storage.objects(bucket_id,name)values('place-photos','secret.jpg'),('other','public.jpg')",
    );
    await db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      expect(
        (await tx.query("select * from storage.objects")).rows,
      ).toHaveLength(1);
    });
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query(
          "insert into storage.objects(bucket_id,name)values('place-photos','attack.jpg')",
        );
      }),
    ).rejects.toThrow(/row-level security/);
    expect(
      (
        await db.query<{ public: boolean }>(
          "select public from storage.buckets where id='place-photos'",
        )
      ).rows[0].public,
    ).toBe(false);
  });
  it('counts the full city catalog and expires only unused or rejected photographs',async()=>{
    await community(a,'profile',{displayName:'Local curator',homeCity:'충주시',homeArea:'살미면',localityScope:'auto',publicLocalArea:false});
    await db.exec("insert into public.places(name,address,lat,lng,status)values('Test A','충청북도 충주시 테스트동 1',37,127,'published'),('Test B','충청북도 충주시 테스트동 2',37,127,'published')");
    expect(await community(a,'locality_counts',{},null)).toEqual({city:2,area:0});
    expect(await community(b,'locality_counts',{},null)).toEqual({city:0,area:0});
    const expired=await service('select public.expire_place_photos(100)value');
    expect(Array.isArray(expired)).toBe(true);
    const records=await db.query<{state:string;review:string}>('select state,review from public.place_photos');
    expect(records.rows.some(record=>record.state==='expired')).toBe(true);
    expect(records.rows.some(record=>record.state==='linked'&&record.review==='approved')).toBe(true);
  });
});
