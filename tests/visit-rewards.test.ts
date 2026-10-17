import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { z } from "zod";
import { attachVisitRewards } from "../server/visit-rewards";
import {
  readVisitRewardSettings,
  visitRewardError,
} from "../server/visit-rewards/store";
import { AppError } from "../server/errors";
import type { VisitRewardRequest } from "../shared/visit-rewards";

const visitor = "80000000-0000-4000-8000-000000000001",
  curator = "80000000-0000-4000-8000-000000000002",
  admin = "80000000-0000-4000-8000-000000000003",
  other = "80000000-0000-4000-8000-000000000004",
  mod = "80000000-0000-4000-8000-000000000005",
  unverified = "80000000-0000-4000-8000-000000000006";
let db: PGlite;
async function action(
  actor: string,
  name: string,
  payload: Record<string, unknown> = {},
  enabled = true,
): Promise<unknown> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (
      await tx.query<{ value: unknown }>(
        "select public.visit_reward_action($1,$2,$3,$4)value",
        [actor, name, payload, enabled],
      )
    ).rows[0].value;
  });
}
async function call(
  actor: string,
  name: string,
  payload: Record<string, unknown> = {},
  enabled = true,
) {
  return (await action(actor, name, payload, enabled)) as VisitRewardRequest;
}
function api(enabled = true, forgedRole = false) {
  const app = express();
  app.use(express.json());
  attachVisitRewards(
    app,
    {
      live: true,
      database: true,
      url: "https://pjdawapasozsrpnrtsfx.supabase.co",
      secret: "mock",
      visitRewards: { payoutsEnabled: enabled },
    },
    async (req) => {
      const id = req.get("Authorization");
      if (!id) throw new AppError(401, "visit.auth");
      return {
        id,
        role:
          forgedRole || id === admin
            ? "admin"
            : id === mod
              ? "moderator"
              : "traveler",
      };
    },
    {
      async action(actor, name, payload, enabled) {
        try {
          return await action(actor, name, payload, enabled);
        } catch (e) {
          throw visitRewardError(e as { code?: string });
        }
      },
    },
  );
  const handler: ErrorRequestHandler = (e, _req, res, _next) =>
    res
      .status(
        e instanceof z.ZodError ? 400 : e instanceof AppError ? e.status : 500,
      )
      .json({ error: e.message });
  app.use(handler);
  return app;
}
async function fixture({
  who = visitor,
  owner = curator,
  placeId = crypto.randomUUID(),
  days = 0,
  helpfulness = 5,
  affiliated = false,
}: {
  who?: string;
  owner?: string;
  placeId?: string;
  days?: number;
  helpfulness?: number;
  affiliated?: boolean;
} = {}) {
  const endorsement = crypto.randomUUID(),
    version = crypto.randomUUID(),
    review = crypto.randomUUID(),
    rating = crypto.randomUUID();
  await db.query(
    "insert into public.places(id,name,address,lat,lng,status)values($1,'Test venue','Seoul test address',37,127,'published')on conflict do nothing",
    [placeId],
  );
  await db.query(
    "insert into public.endorsements(id,user_id,place_id)values($1,$2,$3)on conflict(user_id,place_id)where active do nothing",
    [endorsement, owner, placeId],
  );
  const parent = (
    await db.query<{ id: string }>(
      "select id from public.endorsements where user_id=$1 and place_id=$2 and active",
      [owner, placeId],
    )
  ).rows[0].id;
  await db.query(
    "update public.endorsement_versions set status='superseded'where endorsement_id=$1",
    [parent],
  );
  await db.query(
    "insert into public.endorsement_versions(id,endorsement_id,version,text,status)values($1,$2,(select coalesce(max(version),0)+1 from public.endorsement_versions where endorsement_id=$2),'First-hand recommendation version','published')",
    [version, parent],
  );
  await db.query(
    "update public.endorsements set published_version_id=$1 where id=$2",
    [version, parent],
  );
  const rv = (
    await db.query<{ id: string; visited_on: string }>(
      "insert into public.place_reviews(id,user_id,place_id,rating,text,visited_on,affiliated)values($1,$2,$3,1,'Honest negative restaurant review',(now()at time zone'Asia/Seoul')::date-$4::integer,$5)on conflict(user_id,place_id)do update set visited_on=excluded.visited_on,affiliated=excluded.affiliated returning id,visited_on::text",
      [review, who, placeId, days, affiliated],
    )
  ).rows[0];
  await db.query(
    "insert into public.endorsement_ratings(id,user_id,endorsement_version_id,review_id,helpfulness)values($1,$2,$3,$4,$5)",
    [rating, who, version, rv.id, helpfulness],
  );
  return {
    placeId,
    version,
    parent,
    rating,
    review: rv.id,
    who,
    owner,
    payload: {
      requestId: crypto.randomUUID(),
      ratingId: rating,
      expectedHelpfulness: helpfulness,
      expectedVisitedOn: rv.visited_on,
      affiliated: false,
      evidence:
        "I visited and can describe details for independent human investigation.",
      consent: true,
    },
  };
}
const decision = (id: string, kind = "approve") => ({
  id,
  requestId: crypto.randomUUID(),
  decision: kind,
  reason: "Independently checked this visit and attribution.",
  evidenceSummary:
    "Human reviewer checked independent evidence beyond a reservation, location, photo or claim alone.",
  independentEvidence: true,
  affiliationsChecked: true,
  collusionChecked: true,
});
async function approved(f: Awaited<ReturnType<typeof fixture>>) {
  const r = await call(f.who, "submit", f.payload);
  return await call(admin, "decide", decision(r.id));
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
 create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant select on auth.users to service_role;`);
  for (const id of [visitor, curator, admin, other, mod, unverified])
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at)values($1,'test@example.invalid',$2)",
      [id, id === unverified ? null : new Date().toISOString()],
    );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query(
    "insert into public.user_roles(user_id,role)values($1,'admin'),($2,'moderator')",
    [admin, mod],
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  // Fixtures are disposable. TRUNCATE is not a runtime operation or public API.
  await db.exec(
    "truncate public.visit_reward_audit,public.visit_reward_decisions,public.visit_reward_grants,public.visit_reward_requests,public.visit_reward_affiliations,public.lp_ledger cascade;update public.visit_reward_policy set enabled=false,version=1,amounts=array[0,2,8,15,20],place_month_cap=300,curator_month_cap=1000;update public.lp_policy set rewards_enabled=false,planning_enabled=false",
  );
});
async function enable() {
  await db.exec(
    "update public.visit_reward_policy set enabled=true;update public.lp_policy set rewards_enabled=true",
  );
}
describe("receipt-free review, exact attribution and permissions", () => {
  it("defaults all payout gates off; approval alone does not alter reviews, visits or LP", async () => {
    expect(readVisitRewardSettings({})).toEqual({ payoutsEnabled: false });
    const f = await fixture();
    const r = await approved(f);
    expect(r).toMatchObject({
      state: "approved",
      grant: null,
      endorsementVersionId: f.version,
      curatorId: curator,
      helpfulness: 5,
    });
    await expect(call(admin, "issue", { id: r.id })).rejects.toThrow(
      /disabled/i,
    );
    expect(
      (await db.query("select * from public.lp_ledger")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query<{ verification_state: string }>(
          "select verification_state from public.place_reviews where id=$1",
          [f.review],
        )
      ).rows[0].verification_state,
    ).toBe("unverified");
    await enable();
    await expect(call(admin, "issue", { id: r.id }, false)).rejects.toThrow(
      /disabled/i,
    );
  });
  it("requires ownership, confirmed email and stored admin roles; a forged server role still fails SQL", async () => {
    const f = await fixture();
    const r = await call(visitor, "submit", f.payload);
    const app = api();
    await request(app).get("/api/visit-rewards/requests").expect(401);
    await request(app)
      .get("/api/visit-rewards/requests")
      .set("Authorization", unverified)
      .expect(401);
    await request(app)
      .get(`/api/visit-rewards/requests/${r.id}`)
      .set("Authorization", other)
      .expect(404);
    await request(app)
      .get("/api/visit-rewards/admin/queue")
      .set("Authorization", visitor)
      .expect(403);
    await request(api(true, true))
      .post("/api/visit-rewards/admin/decisions")
      .set("Authorization", visitor)
      .send(decision(r.id))
      .expect(403);
    await request(app)
      .post("/api/visit-rewards/admin/decisions")
      .set("Authorization", mod)
      .send(decision(r.id))
      .expect(200);
    expect(
      (await call(visitor, "get", { id: r.id })).decision?.reviewerId,
    ).toBe(mod);
  });
  it("requires independent human evidence and reasons, allows rejection, and preserves unverified feedback", async () => {
    const f = await fixture({ helpfulness: 1 });
    const r = await call(visitor, "submit", f.payload);
    await expect(
      call(admin, "decide", { ...decision(r.id), independentEvidence: false }),
    ).rejects.toThrow(/Independent human/);
    await expect(
      call(admin, "decide", { ...decision(r.id), evidenceSummary: "photo" }),
    ).rejects.toThrow(/Review evidence/);
    const rejected = await call(admin, "decide", decision(r.id, "reject"));
    expect(rejected.state).toBe("rejected");
    await enable();
    await expect(call(admin, "issue", { id: r.id })).rejects.toThrow(
      /Approval required/,
    );
    expect(
      (
        await db.query("select * from public.place_reviews where id=$1", [
          f.review,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await call(visitor, "submit", {
          ...f.payload,
          requestId: crypto.randomUUID(),
          evidence:
            "New independent information is available for an appeal review.",
        })
      ).state,
    ).toBe("pending");
  });
  it("binds one selected historical version to one curator rather than all endorsers and catches changed feedback", async () => {
    const f = await fixture();
    await fixture({ who: other, owner: other, placeId: f.placeId });
    const r = await approved(f);
    await enable();
    await db.query(
      "update public.endorsement_versions set status='superseded'where id=$1",
      [f.version],
    );
    const paid = await call(admin, "issue", { id: r.id });
    expect(paid.grant?.amount).toBe(20);
    expect(
      (
        await db.query<{ user_id: string }>(
          "select user_id from public.lp_ledger",
        )
      ).rows,
    ).toEqual([{ user_id: curator }]);
    const changed = await fixture({ who: other });
    const next = await approved(changed);
    await db.query(
      "update public.endorsement_ratings set helpfulness=2 where id=$1",
      [changed.rating],
    );
    await expect(call(admin, "issue", { id: next.id })).rejects.toThrow(
      /Attribution changed/,
    );
    const invalid = await fixture({ who: mod });
    await expect(
      call(mod, "submit", {
        ...invalid.payload,
        expectedVisitedOn: "2000-01-01",
      }),
    ).rejects.toThrow(/Feedback changed/);
  });
  it("blocks self recommendations, declared/registered affiliations and reviewers with conflicts", async () => {
    const self = await fixture({ who: curator });
    await expect(call(curator, "submit", self.payload)).rejects.toThrow(
      /Self reward/,
    );
    const declared = await fixture({ affiliated: true });
    const r = await approved(declared);
    await enable();
    await expect(call(admin, "issue", { id: r.id })).rejects.toThrow(
      /Affiliation ineligible/,
    );
    const f = await fixture({ who: other });
    const item = await approved(f);
    await action(admin, "affiliation", {
      userId: curator,
      placeId: f.placeId,
      kind: "owner",
      active: true,
      reason: "Verified ownership relationship for this venue.",
    });
    const queue = (await action(admin, "queue")) as VisitRewardRequest[];
    expect(
      queue.find((row) => row.id === item.id)?.knownAffiliations,
    ).toContainEqual({ userId: curator, kind: "owner" });
    await expect(call(admin, "issue", { id: item.id })).rejects.toThrow(
      /Affiliation ineligible/,
    );
    const staff = await fixture({ who: mod });
    const pending = await call(mod, "submit", staff.payload);
    await expect(call(mod, "decide", decision(pending.id))).rejects.toThrow(
      /Reviewer conflict/,
    );
    await action(admin, "affiliation", {
      userId: admin,
      placeId: staff.placeId,
      kind: "affiliate",
      active: true,
      reason: "Administrator declared a conflict for this venue.",
    });
    await expect(call(admin, "decide", decision(pending.id))).rejects.toThrow(
      /Reviewer conflict/,
    );
  });
});
describe("atomic existing-ledger issuance", () => {
  it("rechecks a previously approved reviewer's independence before payout", async () => {
    const f = await fixture();
    const r = await approved(f);
    await enable();
    await action(admin, "affiliation", {
      userId: admin,
      placeId: f.placeId,
      kind: "affiliate",
      active: true,
      reason: "A reviewer relationship was discovered after approval.",
    });
    await expect(call(mod, "issue", { id: r.id })).rejects.toThrow(
      /Reviewer no longer independent/,
    );
    expect(
      (await db.query("select * from public.lp_ledger")).rows,
    ).toHaveLength(0);
  });
  it("serializes concurrent duplicate submissions, approvals and payouts without double LP", async () => {
    const f = await fixture();
    const app = api();
    const submissions = await Promise.all(
      [1, 2, 3].map(() =>
        request(app)
          .post("/api/visit-rewards/requests")
          .set("Authorization", visitor)
          .send(f.payload),
      ),
    );
    expect(submissions.every((r) => r.status === 201)).toBe(true);
    expect(new Set(submissions.map((r) => r.body.id)).size).toBe(1);
    const r = submissions[0].body as VisitRewardRequest;
    const payload = decision(r.id);
    await Promise.all([1, 2, 3].map(() => call(admin, "decide", payload)));
    await enable();
    const paid = await Promise.all(
      [1, 2, 3, 4].map(() => call(admin, "issue", { id: r.id })),
    );
    expect(paid.every((v) => v.grant?.amount === 20)).toBe(true);
    expect(
      (await db.query("select * from public.lp_ledger")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.visit_reward_decisions")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.visit_reward_grants")).rows,
    ).toHaveLength(1);
    await expect(
      call(visitor, "submit", {
        ...f.payload,
        evidence: "Changed evidence must not reuse the previous request key.",
      }),
    ).rejects.toThrow(/Changed request/);
    await expect(
      call(admin, "decide", decision(r.id, "reject")),
    ).rejects.toThrow(/Already decided/);
    await db.exec("update public.visit_reward_policy set enabled=false");
    expect(
      (await call(admin, "issue", { id: r.id }, false)).grant?.amount,
    ).toBe(20);
  });
  it("rolls back ledger, grant and audit together after an injected late failure", async () => {
    const f = await fixture();
    const r = await approved(f);
    await enable();
    await db.exec(
      "create function public.visit_test_fail()returns trigger language plpgsql as $$begin if new.action='reward.issued'then raise exception 'Injected failure';end if;return new;end;$$;create trigger visit_test_fail before insert on public.visit_reward_audit for each row execute function public.visit_test_fail()",
    );
    try {
      await expect(call(admin, "issue", { id: r.id })).rejects.toThrow(
        /Injected failure/,
      );
      expect(
        (await db.query("select * from public.lp_ledger")).rows,
      ).toHaveLength(0);
      expect(
        (await db.query("select * from public.visit_reward_grants")).rows,
      ).toHaveLength(0);
    } finally {
      await db.exec(
        "drop trigger visit_test_fail on public.visit_reward_audit;drop function public.visit_test_fail()",
      );
    }
    expect((await call(admin, "issue", { id: r.id })).grant?.amount).toBe(20);
    const balance = await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return (
        await tx.query<{ value: { earned: number } }>(
          "select public.planning_action($1,'balance',null,'{}')value",
          [curator],
        )
      ).rows[0].value;
    });
    expect(balance.earned).toBe(20);
    await expect(
      db.exec("update public.lp_ledger set amount=100"),
    ).rejects.toThrow(/append-only/);
    await expect(db.exec("delete from public.lp_ledger")).rejects.toThrow(
      /append-only/,
    );
  });
  it("enforces the rolling 90-day boundary in both visit-date directions, across different endorsers", async () => {
    await enable();
    const first = await fixture({ days: 180 });
    await call(admin, "issue", { id: (await approved(first)).id });
    const within = await fixture({
      placeId: first.placeId,
      days: 91,
      owner: other,
    });
    const blocked = await approved(within);
    await expect(call(admin, "issue", { id: blocked.id })).rejects.toThrow(
      /90 day/,
    );
    const exact = await fixture({ placeId: first.placeId, days: 90 });
    expect(
      (await call(admin, "issue", { id: (await approved(exact)).id })).grant
        ?.amount,
    ).toBe(20);
    const earlier = await fixture({ placeId: first.placeId, days: 269 });
    await expect(
      call(admin, "issue", { id: (await approved(earlier)).id }),
    ).rejects.toThrow(/90 day/);
    expect(
      (await db.query("select * from public.lp_ledger")).rows,
    ).toHaveLength(2);
  });
  it("atomically bounds per-place monthly spend under concurrent different recipients", async () => {
    await enable();
    await db.exec("update public.visit_reward_policy set place_month_cap=20");
    const a = await fixture();
    const ra = await approved(a);
    const b = await fixture({ who: other, owner: mod, placeId: a.placeId });
    const rb = await approved(b);
    const outcomes = await Promise.allSettled([
      call(admin, "issue", { id: ra.id }),
      call(admin, "issue", { id: rb.id }),
    ]);
    expect(outcomes.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((v) => v.status === "rejected")).toHaveLength(1);
    expect(
      (
        await db.query<{ amount: number }>(
          "select sum(amount)::integer amount from public.lp_ledger",
        )
      ).rows[0].amount,
    ).toBe(20);
  });
  it("applies curator caps across places and snapshots policy changes with optimistic versions", async () => {
    await enable();
    await action(admin, "policy_update", {
      expectedVersion: 1,
      enabled: true,
      amounts: [0, 2, 8, 15, 20],
      placeMonthCap: 300,
      curatorMonthCap: 20,
      reason: "Pilot curator cap set to a bounded test budget.",
    });
    const a = await fixture();
    const b = await fixture({ who: other });
    await call(admin, "issue", { id: (await approved(a)).id });
    await expect(
      call(admin, "issue", { id: (await approved(b)).id }),
    ).rejects.toThrow(/Curator cap/);
    expect(
      (
        await db.query<{ policy_snapshot: { version: number } }>(
          "select policy_snapshot from public.visit_reward_grants",
        )
      ).rows[0].policy_snapshot.version,
    ).toBe(2);
    await expect(action(mod, "policy_update", {})).rejects.toThrow(
      /Admin required/,
    );
    await expect(
      action(admin, "policy_update", { expectedVersion: 1 }),
    ).rejects.toThrow(/Policy changed/);
  });
  it("accepts honest low ratings, issues configurable amounts, and records zero outcomes without zero ledger rows", async () => {
    await enable();
    for (const [score, amount] of [
      [1, 0],
      [2, 2],
      [3, 8],
      [4, 15],
      [5, 20],
    ]) {
      const f = await fixture({ helpfulness: score });
      const r = await approved(f);
      const paid = await call(admin, "issue", { id: r.id });
      expect(paid.grant?.amount).toBe(amount);
      expect(Boolean(paid.grant?.ledgerId)).toBe(amount > 0);
    }
    expect(
      (await db.query("select * from public.lp_ledger")).rows,
    ).toHaveLength(4);
    expect(
      (
        await db.query<{ amount: number }>(
          "select sum(amount)::integer amount from public.lp_ledger",
        )
      ).rows[0].amount,
    ).toBe(45);
  });
  it("uses KST payout month for caps; old calendar-month payouts do not use the current budget", async () => {
    await enable();
    await db.exec("update public.visit_reward_policy set place_month_cap=20");
    const f = await fixture();
    const r = await approved(f);
    await call(admin, "issue", { id: r.id });
    const cap = (
      await db.query<{ cap_month: string; expected_month: string }>(
        "select cap_month::text,date_trunc('month',now()at time zone'Asia/Seoul')::date::text expected_month from public.visit_reward_grants",
      )
    ).rows[0];
    expect(cap.cap_month).toBe(cap.expected_month);
    // Test-only old-month fixture: insert a second grant/ledger is unnecessary; move the immutable row while trigger is disabled in this isolated memory DB.
    await db.exec(
      "alter table public.visit_reward_grants disable trigger visit_reward_grants_immutable;update public.visit_reward_grants set cap_month=cap_month-interval '1 month';alter table public.visit_reward_grants enable trigger visit_reward_grants_immutable",
    );
    const b = await fixture({ who: other, placeId: f.placeId });
    expect(
      (await call(admin, "issue", { id: (await approved(b)).id })).grant
        ?.amount,
    ).toBe(20);
  });
});
describe("private evidence and immutable audit", () => {
  it("enables RLS and denies other users/anonymous/client writes and RPCs", async () => {
    const f = await fixture();
    const r = await approved(f);
    await enable();
    await call(admin, "issue", { id: r.id });
    for (const who of [visitor, other, curator])
      await db.transaction(async (tx) => {
        await tx.exec(
          `set local role authenticated;select set_config('request.jwt.claim.sub','${who}',true)`,
        );
        expect(
          (await tx.query("select * from public.visit_reward_requests")).rows,
        ).toHaveLength(who === visitor ? 1 : 0);
        expect(
          (await tx.query("select * from public.visit_reward_decisions")).rows,
        ).toHaveLength(who === visitor ? 1 : 0);
        expect(
          (await tx.query("select * from public.visit_reward_grants")).rows,
        ).toHaveLength(who === visitor ? 1 : 0);
      });
    for (const role of ["anon", "authenticated"]) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.query(
            "select public.visit_reward_action($1,'queue','{}',true)",
            [admin],
          );
        }),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.exec(
            "update public.visit_reward_requests set state='approved'",
          );
        }),
      ).rejects.toThrow(/permission denied/);
    }
    const tables = (
      await db.query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class where relname like 'visit_reward_%'and relkind='r'",
      )
    ).rows;
    expect(tables.length).toBe(6);
    expect(tables.every((v) => v.relrowsecurity)).toBe(true);
    await expect(
      db.exec("update public.visit_reward_decisions set reason='changed'"),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.exec("delete from public.visit_reward_grants"),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.exec("delete from public.visit_reward_audit"),
    ).rejects.toThrow(/append-only/);
  });
  it("rejects another Supabase project before attaching routes", () => {
    expect(() =>
      attachVisitRewards(
        express(),
        {
          live: true,
          database: true,
          url: "https://other.supabase.co",
          secret: "mock",
        },
        async () => ({ id: visitor, role: "traveler" }),
      ),
    ).toThrow(/pjdawapasozsrpnrtsfx/);
  });
});
