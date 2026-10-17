import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const a = "10000000-0000-4000-8000-000000000001";
const b = "10000000-0000-4000-8000-000000000002";
const place = "20000000-0000-4000-8000-000000000001";
const request = "30000000-0000-4000-8000-000000000001";
const moderator = '10000000-0000-4000-8000-000000000003';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant select on auth.users to service_role;
    insert into auth.users values('${a}'),('${b}');`);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261017022855_core_contributions.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261017023216_provider_resolution.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261017023713_community_moderation.sql",
      "utf8",
    ),
  );
  await db.query(
    `insert into public.places(id,name,address,lat,lng,status) values($1,'테스트 식당','서울 성동구 테스트길 1',37.5,127,'published')`,
    [place],
  );
});
afterAll(async () => {
  await db?.close();
});
async function asRole<T>(
  role: string,
  user: string,
  operation: (tx: Pick<PGlite, "query" | "exec">) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.exec(
      `set local role ${role}; select set_config('request.jwt.claim.sub','${user}',true);`,
    );
    return operation(tx);
  });
}
describe("actual Postgres permissions and contribution transactions", () => {
  it("enables RLS on every public table", async () => {
    const result = await db.query<{ relname: string }>(
      `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`,
    );
    expect(result.rows).toEqual([]);
  });
  it("anonymous users see published places, but cannot write or invoke privileged RPCs", async () => {
    const result = await asRole("anon", "", (tx) =>
      tx.query("select id from public.places"),
    );
    expect(result.rows).toHaveLength(1);
    await expect(
      asRole("anon", "", (tx) =>
        tx.query(
          `insert into public.places(name,address,lat,lng) values('가짜','서울 테스트길 1',37,127)`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole("authenticated", a, (tx) =>
        tx.query("select public.submit_contribution($1,$2,$3,null,$4)", [
          a,
          request,
          place,
          "클라이언트가 직접 만든 추천",
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asRole("authenticated", a, (tx) =>
        tx.query(`insert into public.user_roles values($1,'admin')`, [a]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("stores one endorsement/version and replays an identical request once", async () => {
    const submit = () =>
      asRole("service_role", "", (tx) =>
        tx.query<{ result: { id: string } }>(
          "select public.submit_contribution($1,$2,$3,null,$4) as result",
          [a, request, place, "맛있는 메뉴를 직접 먹어 봤어요."],
        ),
      );
    const first = await submit();
    const second = await submit();
    expect(second.rows).toEqual(first.rows);
    expect(
      (await db.query("select * from public.endorsements")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.endorsement_versions")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.audit_logs")).rows,
    ).toHaveLength(1);
    await expect(
      asRole("service_role", "", (tx) =>
        tx.query("select public.submit_contribution($1,$2,$3,null,$4)", [
          a,
          request,
          place,
          "내용을 바꿔 같은 키를 보내요.",
        ]),
      ),
    ).rejects.toThrow(/Idempotency conflict/);
  });
  it("rejects duplicate active endorsements, allows an independent curator", async () => {
    await expect(
      asRole("service_role", "", (tx) =>
        tx.query(
          "select public.submit_contribution($1,gen_random_uuid(),$2,null,$3)",
          [a, place, "다시 추천하면 중복이어야 해요."],
        ),
      ),
    ).rejects.toThrow(/duplicate key/);
    await asRole("service_role", "", (tx) =>
      tx.query(
        "select public.submit_contribution($1,gen_random_uuid(),$2,null,$3)",
        [b, place, "다른 사람이 독립적으로 추천해요."],
      ),
    );
    expect(
      (await db.query("select * from public.endorsements")).rows,
    ).toHaveLength(2);
  });
  it("hides pending text, isolates users’ requests, and publishes only approved versions", async () => {
    expect(
      (
        await asRole("anon", "", (tx) =>
          tx.query("select * from public.endorsement_versions"),
        )
      ).rows,
    ).toHaveLength(0);
    const own = await asRole("authenticated", a, (tx) =>
      tx.query("select * from public.api_requests"),
    );
    expect(own.rows).toHaveLength(1);
    const ids = await db.query<{ id: string }>(
      "select id from public.endorsement_versions order by created_at limit 1",
    );
    await db.query(
      "update public.endorsement_versions set status='published' where id=$1",
      [ids.rows[0].id],
    );
    await db.query(
      "update public.endorsements set published_version_id=$1 where id=(select endorsement_id from public.endorsement_versions where id=$1)",
      [ids.rows[0].id],
    );
    expect(
      (
        await asRole("anon", "", (tx) =>
          tx.query("select * from public.endorsements"),
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await asRole("anon", "", (tx) =>
          tx.query("select * from public.endorsement_versions"),
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("withdraws public text when a parent is rejected, merged or inactive, including direct reads", async () => {
    for (const status of ["rejected", "merged"]) {
      await db.query("update public.places set status=$1 where id=$2", [
        status,
        place,
      ]);
      for (const role of ["anon", "authenticated"]) {
        expect(
          (
            await asRole(role, role === "anon" ? "" : b, (tx) =>
              tx.query("select text from public.endorsement_versions"),
            )
          ).rows,
        ).toHaveLength(0);
      }
    }
    await db.query("update public.places set status='published' where id=$1", [
      place,
    ]);
    await db.query(
      "update public.endorsements set active=false where published_version_id is not null",
    );
    expect(
      (
        await asRole("anon", "", (tx) =>
          tx.query("select text from public.endorsement_versions"),
        )
      ).rows,
    ).toHaveLength(0);
    await db.query(
      "update public.endorsements set active=true where published_version_id is not null",
    );
    expect(
      (
        await asRole("anon", "", (tx) =>
          tx.query("select text from public.endorsement_versions"),
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("queues manual places instead of silently merging uncertain matches", async () => {
    const manual = {
      name: "새 식당",
      address: "서울 성동구 새길 12",
      lat: 37.54,
      lng: 127.05,
    };
    await asRole("service_role", "", (tx) =>
      tx.query(
        "select public.submit_contribution($1,gen_random_uuid(),null,$2,$3)",
        [a, manual, "직접 방문해서 먹어 본 가게예요."],
      ),
    );
    expect((await db.query("select * from public.places")).rows).toHaveLength(
      1,
    );
    expect(
      (
        await asRole("authenticated", a, (tx) =>
          tx.query("select * from public.place_submissions"),
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await asRole("authenticated", b, (tx) =>
          tx.query("select * from public.place_submissions"),
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("resolves a provider ID atomically into a separate internal place and two independent endorsements", async () => {
    const venue = {
      id: "external-12",
      name: "외부 식당",
      address: { road: "서울 외부길 12" },
      location: { lat: 37.5, lng: 127 },
      confidence: 0.6,
      possiblyClosed: false,
    };
    for (const user of [a, b])
      await asRole("service_role", "", (tx) =>
        tx.query(
          "select public.submit_provider_contribution($1,gen_random_uuid(),$2,$3)",
          [user, venue, "직접 경험한 외부 식당 추천이에요."],
        ),
      );
    const ids = await db.query<{ place_id: string }>(
      "select place_id from public.place_external_ids where external_id='external-12'",
    );
    expect(ids.rows).toHaveLength(1);
    expect(ids.rows[0].place_id).not.toBe("external-12");
    expect(
      (
        await db.query("select id from public.endorsements where place_id=$1", [
          ids.rows[0].place_id,
        ])
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await asRole("anon", "", (tx) =>
          tx.query("select id from public.places where id=$1", [
            ids.rows[0].place_id,
          ]),
        )
      ).rows,
    ).toHaveLength(0);
  });
});

describe('community moderation and version attribution',()=>{
 const action=(actor:string|null,name:string,payload:Record<string,unknown>,requestId=crypto.randomUUID())=>asRole('service_role','',tx=>tx.query<{result:Record<string,unknown>}>('select public.community_action($1,$2,$3,$4) result',[actor,name,requestId,payload]));
 beforeAll(async()=>{await db.query('insert into auth.users values($1)',[moderator]);await db.query("insert into public.user_roles values($1,'moderator')",[moderator]);});
 it('authorizes admin reads and decisions using stored roles, never a client-supplied role',async()=>{
  await expect(action(a,'queue',{role:'admin'})).rejects.toThrow(/Moderator required/);
  const result=await action(moderator,'queue',{});expect(result.rows[0].result).toHaveProperty('queue');
 });
 it('accepts honest negative feedback, separates exact-version helpfulness and blocks self-rating',async()=>{
  const version=(await db.query<{id:string}>("select v.id from public.endorsement_versions v join public.endorsements e on e.id=v.endorsement_id where e.user_id=$1 and e.place_id=$2 and v.status='published'",[a,place])).rows[0].id;
  const payload={placeId:place,rating:1,text:'솔직하게 남기는 아쉬운 경험입니다.',visitedOn:'2026-01-01',affiliated:false,endorsementVersionId:version,helpfulness:1};
  await expect(action(a,'feedback',payload)).rejects.toThrow(/Invalid endorsement rating/);
  const result=await action(b,'feedback',payload);expect(result.rows[0].result).toMatchObject({verification:'unverified',rewardIssued:false});
  expect((await db.query('select rating from public.place_reviews')).rows).toEqual([{rating:1}]);
  expect((await db.query('select endorsement_version_id,helpfulness from public.endorsement_ratings')).rows).toEqual([{endorsement_version_id:version,helpfulness:1}]);
 });
 it('creates immutable edited versions and never inherits earlier helpfulness',async()=>{
  const e=(await db.query<{id:string,published_version_id:string}>('select id,published_version_id from public.endorsements where user_id=$1 and place_id=$2',[a,place])).rows[0];
  await expect(action(b,'edit_endorsement',{id:e.id,text:'남의 추천을 수정하려고 해요.'})).rejects.toThrow(/Not owner/);
  const edited=await action(a,'edit_endorsement',{id:e.id,text:'추천 이유를 새롭게 다듬은 두 번째 버전이에요.'});
  const id=edited.rows[0].result.id;
  await action(moderator,'decide',{kind:'endorsement',id,decision:'approve',reason:'변경된 추천 내용을 사람이 확인했습니다.'});
  const ratings=await db.query('select endorsement_version_id from public.endorsement_ratings');expect(ratings.rows[0].endorsement_version_id).toBe(e.published_version_id);
  expect((await db.query('select * from public.endorsement_ratings where endorsement_version_id=$1',[id])).rows).toHaveLength(0);
  expect((await asRole('anon','',tx=>tx.query('select id from public.endorsement_versions where id=$1',[e.published_version_id]))).rows).toHaveLength(0);
 });
 it('keeps owner corrections pending until a human approves with a reason',async()=>{
  const response=await action(null,'owner_correction',{placeId:place,field:'name',value:'정정된 식당 이름',evidence:'직접 확인한 공식 안내문입니다.',contact:'private@example.invalid',consent:true});const id=response.rows[0].result.id;
  expect((await db.query('select name from public.places where id=$1',[place])).rows[0].name).toBe('테스트 식당');
  await expect(asRole('anon','',tx=>tx.query('select * from public.owner_correction_requests'))).rejects.toThrow(/permission denied/);
  await action(moderator,'decide',{kind:'correction',id,decision:'approve',reason:'제출한 정정 근거를 확인했습니다.'});
  expect((await db.query('select name from public.places where id=$1',[place])).rows[0].name).toBe('정정된 식당 이름');
  expect((await db.query('select contact from public.owner_correction_requests where id=$1',[id])).rows[0].contact).toBeNull();
  expect((await db.query("select * from public.moderation_decisions where entity_id=$1",[id])).rows).toHaveLength(1);
 });
});
