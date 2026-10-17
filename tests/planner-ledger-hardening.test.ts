import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";

let db: PGlite;
let user: string;
let other: string;
const intent = {
  input: { destination: "seongsu" },
  expectedCost: 100,
  policyVersion: "pilot-v1",
  consent: true,
};

function resultFixture() {
  return {
    provenance: "gemini",
    catalog: [{ id: "fixture-restaurant" }, { id: "fixture-gallery" }],
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
    schedule: {
      title: "Accounting fixture",
      summary: "Synthetic stops for database boundary tests only.",
      days: [
        {
          date: "2026-11-01",
          stops: [
            {
              candidateId: "fixture-gallery",
              start: "10:00",
              end: "11:00",
              purpose: "visit",
              explanation: "Synthetic fixture gallery stop.",
            },
            {
              candidateId: "fixture-restaurant",
              start: "12:00",
              end: "13:00",
              purpose: "lunch",
              explanation: "Synthetic fixture restaurant stop.",
            },
          ],
        },
      ],
    },
  };
}

async function action(
  actor: string,
  name: string,
  requestId: string | null,
  payload: unknown = {},
) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (
      await tx.query<{ value: Record<string, unknown> }>(
        "select public.planning_action($1,$2,$3,$4::jsonb)value",
        [actor, name, requestId, JSON.stringify(payload)],
      )
    ).rows[0].value;
  });
}

async function counters(actor = user) {
  return (
    await db.query<{
      requests: number;
      plans: number;
      debits: number;
      charged: number;
      grants: number;
    }>(
      `select
      (select count(*)::int from public.planning_requests where user_id=$1)requests,
      (select count(*)::int from public.itineraries where user_id=$1)plans,
      (select count(*)::int from public.lp_ledger where user_id=$1 and amount<0)debits,
      (select coalesce(-sum(amount),0)::int from public.lp_ledger where user_id=$1 and amount<0)charged,
      (select count(*)::int from public.monthly_lp_grants where user_id=$1)grants`,
      [actor],
    )
  ).rows[0];
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz default now());
    create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant select on auth.users to service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated;
  `);
  for (const file of readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
}, 60_000);

beforeEach(async () => {
  user = crypto.randomUUID();
  other = crypto.randomUUID();
  for (const id of [user, other]) {
    await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query(
      "insert into public.legal_consent_events(user_id,request_id,version,language,terms,privacy,supabase_transfer,adult,public_local_area)values($1,$2,'2026-10-17.1','en',true,true,true,true,false)",
      [id, crypto.randomUUID()],
    );
  }
  await db.exec(
    "update public.lp_policy set planning_enabled=true,version='pilot-v1',plan_cost=100,monthly_promo=300",
  );
});
afterAll(async () => {
  await db?.close();
});

const reserveCases: [string, unknown][] = [];
for (const field of [
  "expectedCost",
  "policyVersion",
  "consent",
  "input",
] as const) {
  const missing = { ...intent } as Record<string, unknown>;
  delete missing[field];
  reserveCases.push([`${field} missing`, missing]);
  for (const value of field === "input"
    ? [null, [], false, ""]
    : [null, [], {}, false, ""])
    reserveCases.push([
      `${field} ${JSON.stringify(value)}`,
      { ...intent, [field]: value },
    ]);
}
reserveCases.push(
  ["string cost", { ...intent, expectedCost: "100" }],
  ["fractional cost", { ...intent, expectedCost: 100.5 }],
  ["wrong policy type", { ...intent, policyVersion: 1 }],
  ["string consent", { ...intent, consent: "true" }],
  ["JSON null payload", null],
  ["array payload", []],
);

describe("new reservation input boundary", () => {
  it.each(reserveCases)(
    "rejects %s before issuing LP or creating a hold",
    async (_label, payload) => {
      await expect(
        action(user, "reserve", crypto.randomUUID(), payload),
      ).rejects.toThrow(/Price confirmation required/);
      expect(await counters()).toEqual({
        requests: 0,
        plans: 0,
        debits: 0,
        charged: 0,
        grants: 0,
      });
    },
  );

  it("rejects SQL NULL payload and missing request IDs", async () => {
    await expect(
      db.query("select public.planning_action($1,'reserve',$2,null)", [
        user,
        crypto.randomUUID(),
      ]),
    ).rejects.toThrow(/Price confirmation required/);
    await expect(action(user, "reserve", null, intent)).rejects.toThrow(
      /Price confirmation required/,
    );
    expect(await counters()).toEqual({
      requests: 0,
      plans: 0,
      debits: 0,
      charged: 0,
      grants: 0,
    });
  });
});

function malformedResult(path: string[], value: unknown, remove = false) {
  const payload: Record<string, unknown> = { result: resultFixture() };
  let target = payload;
  for (const key of path.slice(0, -1))
    target = target[key] as Record<string, unknown>;
  if (remove) delete target[path.at(-1)!];
  else target[path.at(-1)!] = value;
  return payload;
}

const resultCases: [string, unknown][] = [];
for (const path of [
  ["result"],
  ["result", "provenance"],
  ["result", "evaluation"],
  ["result", "evaluation", "valid"],
  ["result", "evaluation", "errors"],
  ["result", "evaluation", "warnings"],
  ["result", "evaluation", "checks"],
  ["result", "evaluation", "checks", "stopCount"],
  ["result", "catalog"],
  ["result", "schedule"],
  ["result", "schedule", "title"],
  ["result", "schedule", "summary"],
  ["result", "schedule", "days"],
  ["result", "schedule", "days", "0", "stops"],
  ["result", "schedule", "days", "0", "stops", "0", "candidateId"],
]) {
  resultCases.push([
    `${path.join(".")} missing`,
    malformedResult(path, undefined, true),
  ]);
  for (const value of [
    null,
    path.at(-1) === "title" || path.at(-1) === "summary" ? "" : "wrong-type",
    42,
  ])
    resultCases.push([
      `${path.join(".")} ${JSON.stringify(value)}`,
      malformedResult(path, value),
    ]);
}
resultCases.push(
  ["empty result array", { result: [] }],
  ["empty provenance array", malformedResult(["result", "provenance"], [])],
  ["empty evaluation array", malformedResult(["result", "evaluation"], [])],
  ["empty valid array", malformedResult(["result", "evaluation", "valid"], [])],
  [
    "empty checks array",
    malformedResult(["result", "evaluation", "checks"], []),
  ],
  ["empty schedule array", malformedResult(["result", "schedule"], [])],
  ["empty catalog", malformedResult(["result", "catalog"], [])],
  [
    "single candidate",
    malformedResult(["result", "catalog"], [{ id: "fixture-gallery" }]),
  ],
  ["missing candidate IDs", malformedResult(["result", "catalog"], [{}, {}])],
  [
    "duplicate candidate IDs",
    malformedResult(
      ["result", "catalog"],
      [{ id: "fixture-gallery" }, { id: "fixture-gallery" }],
    ),
  ],
  ["empty days", malformedResult(["result", "schedule", "days"], [])],
  [
    "empty stops",
    malformedResult(["result", "schedule", "days", "0", "stops"], []),
  ],
  [
    "invalid evaluation",
    malformedResult(["result", "evaluation", "valid"], false),
  ],
  [
    "string true evaluation",
    malformedResult(["result", "evaluation", "valid"], "true"),
  ],
  [
    "nonempty validation errors",
    malformedResult(
      ["result", "evaluation", "errors"],
      [{ code: "CLOSED_VENUE" }],
    ),
  ],
  [
    "negative check",
    malformedResult(["result", "evaluation", "checks", "stopCount"], -1),
  ],
  [
    "fractional check",
    malformedResult(["result", "evaluation", "checks", "stopCount"], 1.5),
  ],
  [
    "unknown candidate reference",
    malformedResult(
      ["result", "schedule", "days", "0", "stops", "0", "candidateId"],
      "unlisted",
    ),
  ],
  [
    "invalid stop time",
    malformedResult(
      ["result", "schedule", "days", "0", "stops", "0", "start"],
      "25:00",
    ),
  ],
  [
    "end before start",
    malformedResult(
      ["result", "schedule", "days", "0", "stops", "0", "end"],
      "09:00",
    ),
  ],
);

describe("generated result accounting boundary", () => {
  it.each(resultCases)(
    "rejects %s with no saved result or debit, then releases the hold",
    async (_label, payload) => {
      const requestId = crypto.randomUUID();
      await action(user, "reserve", requestId, intent);
      await expect(
        action(user, "finalize", requestId, payload),
      ).rejects.toThrow(/Invalid generated plan/);
      expect(await counters()).toEqual({
        requests: 1,
        plans: 0,
        debits: 0,
        charged: 0,
        grants: 1,
      });
      expect(await action(user, "balance", null)).toMatchObject({
        held: 100,
        promo: 200,
      });
      await action(user, "fail", requestId, { code: "INVALID_GENERATED_PLAN" });
      expect(await action(user, "balance", null)).toMatchObject({
        held: 0,
        promo: 300,
      });
    },
  );

  it("keeps the RPC server-only despite broad hosted default function privileges", async () => {
    const permission = await db.query<{
      anon: boolean;
      authenticated: boolean;
      service: boolean;
    }>(
      "select has_function_privilege('anon','public.planning_action(uuid,text,uuid,jsonb)','EXECUTE')anon,has_function_privilege('authenticated','public.planning_action(uuid,text,uuid,jsonb)','EXECUTE')authenticated,has_function_privilege('service_role','public.planning_action(uuid,text,uuid,jsonb)','EXECUTE')service",
    );
    expect(permission.rows[0]).toEqual({
      anon: false,
      authenticated: false,
      service: true,
    });
  });
});

describe("original intent replay across policy changes", () => {
  it("returns an already saved original result after pricing changes and planning is disabled", async () => {
    const requestId = crypto.randomUUID();
    await action(user, "reserve", requestId, intent);
    const saved = await action(user, "finalize", requestId, {
      result: resultFixture(),
    });
    await db.exec(
      "update public.lp_policy set plan_cost=120,version='pilot-v2',planning_enabled=false,monthly_promo=1",
    );
    const replay = await action(user, "reserve", requestId, intent);
    expect(replay).toMatchObject({ status: "ready", result: saved });
    expect(
      await action(user, "finalize", requestId, { result: resultFixture() }),
    ).toEqual(saved);
    expect(await counters()).toEqual({
      requests: 1,
      plans: 1,
      debits: 1,
      charged: 100,
      grants: 1,
    });
    await expect(
      action(user, "reserve", requestId, {
        ...intent,
        expectedCost: 120,
        policyVersion: "pilot-v2",
      }),
    ).rejects.toThrow(/Idempotency conflict/);
    await expect(action(other, "reserve", requestId, intent)).rejects.toThrow(
      /Price confirmation required/,
    );
    await expect(action(other, "status", requestId)).rejects.toThrow(
      /Request not found/,
    );
    expect(await counters(other)).toEqual({
      requests: 0,
      plans: 0,
      debits: 0,
      charged: 0,
      grants: 0,
    });
  });

  it("replays a generating hold without repricing or an additional reservation", async () => {
    const requestId = crypto.randomUUID();
    const original = await action(user, "reserve", requestId, intent);
    await db.exec(
      "update public.lp_policy set plan_cost=120,version='pilot-v2'",
    );
    expect(await action(user, "reserve", requestId, intent)).toMatchObject({
      id: original.id,
      status: "generating",
      replay: true,
    });
    expect(await counters()).toEqual({
      requests: 1,
      plans: 0,
      debits: 0,
      charged: 0,
      grants: 1,
    });
    expect(await action(user, "balance", null)).toMatchObject({
      cost: 120,
      held: 100,
      promo: 200,
    });
    await expect(
      action(user, "reserve", crypto.randomUUID(), intent),
    ).rejects.toThrow(/Price confirmation required/);
    const fresh = { ...intent, expectedCost: 120, policyVersion: "pilot-v2" };
    expect(
      await action(user, "reserve", crypto.randomUUID(), fresh),
    ).toMatchObject({ cost: 120, replay: false });
  });

  it("does not issue a new monthly promotion while replaying an earlier-month ready request", async () => {
    const requestId = crypto.randomUUID();
    await action(user, "reserve", requestId, intent);
    const saved = await action(user, "finalize", requestId, {
      result: resultFixture(),
    });
    // Move test bookkeeping to the prior month; do not alter immutable LP rows.
    await db.query(
      "update public.monthly_lp_grants set month=(month-interval '1 month')::date where user_id=$1",
      [user],
    );
    await db.query(
      "update public.planning_requests set created_at=now()-interval '1 month',expires_at=now()-interval '1 day' where user_id=$1",
      [user],
    );
    await db.exec(
      "update public.lp_policy set plan_cost=120,version='pilot-v2'",
    );
    expect(await action(user, "reserve", requestId, intent)).toMatchObject({
      status: "ready",
      result: saved,
    });
    expect(await counters()).toEqual({
      requests: 1,
      plans: 1,
      debits: 1,
      charged: 100,
      grants: 1,
    });
    const currentMonth = await db.query<{ count: number }>(
      "select count(*)::int count from public.monthly_lp_grants where user_id=$1 and month=date_trunc('month',now()at time zone'Asia/Seoul')::date",
      [user],
    );
    expect(currentMonth.rows[0].count).toBe(0);
  });
});

describe("explicit free itinerary policy", () => {
  const freeIntent = {
    ...intent,
    expectedCost: 0,
    policyVersion: "operator-free-v1",
  };
  async function freePolicy() {
    // Deliberately retain a nonzero promotional setting: free planning must not mint it.
    await db.exec(
      "update public.lp_policy set plan_cost=0,version='operator-free-v1',monthly_promo=300",
    );
  }

  it("saves a validated free result with no balance, allowance, debit or duplicate charge", async () => {
    await freePolicy();
    expect(await action(user, "balance", null)).toMatchObject({
      cost: 0,
      promo: 0,
      earned: 0,
      held: 0,
    });
    const requestId = crypto.randomUUID();
    expect(await action(user, "reserve", requestId, freeIntent)).toMatchObject({
      status: "generating",
      cost: 0,
      replay: false,
    });
    const saved = await action(user, "finalize", requestId, {
      result: resultFixture(),
    });
    expect(saved).toMatchObject({ cost: 0 });
    expect(
      await action(user, "finalize", requestId, { result: resultFixture() }),
    ).toEqual(saved);
    expect(await action(user, "reserve", requestId, freeIntent)).toMatchObject({
      status: "ready",
      result: saved,
    });
    expect(await action(user, "balance", null)).toMatchObject({
      cost: 0,
      promo: 0,
      earned: 0,
      held: 0,
    });
    expect(await counters()).toEqual({
      requests: 1,
      plans: 1,
      debits: 0,
      charged: 0,
      grants: 0,
    });
    expect(
      (
        await db.query("select * from public.lp_ledger where user_id=$1", [
          user,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select cost,promo_reserved,earned_reserved from public.planning_requests where user_id=$1",
          [user],
        )
      ).rows,
    ).toEqual([{ cost: 0, promo_reserved: 0, earned_reserved: 0 }]);
  });

  it("replays the original free request after moving to a priced disabled policy", async () => {
    await freePolicy();
    const requestId = crypto.randomUUID();
    await action(user, "reserve", requestId, freeIntent);
    const saved = await action(user, "finalize", requestId, {
      result: resultFixture(),
    });
    await db.exec(
      "update public.lp_policy set plan_cost=120,version='priced-v2',planning_enabled=false",
    );
    expect(await action(user, "reserve", requestId, freeIntent)).toMatchObject({
      status: "ready",
      result: saved,
    });
    await expect(
      action(user, "reserve", requestId, {
        ...freeIntent,
        expectedCost: 120,
        policyVersion: "priced-v2",
      }),
    ).rejects.toThrow(/Idempotency conflict/);
    expect(await counters()).toEqual({
      requests: 1,
      plans: 1,
      debits: 0,
      charged: 0,
      grants: 0,
    });
  });

  it("still rejects invalid free schedules and releases without any ledger mutation", async () => {
    await freePolicy();
    const requestId = crypto.randomUUID();
    await action(user, "reserve", requestId, freeIntent);
    await expect(
      action(user, "finalize", requestId, {
        result: { evaluation: { valid: true } },
      }),
    ).rejects.toThrow(/Invalid generated plan/);
    await action(user, "fail", requestId, { code: "INVALID_RESULT" });
    expect(await action(user, "balance", null)).toMatchObject({
      cost: 0,
      held: 0,
      promo: 0,
      earned: 0,
    });
    expect(await counters()).toEqual({
      requests: 1,
      plans: 0,
      debits: 0,
      charged: 0,
      grants: 0,
    });
  });

  it("does not interpret absent, null, string or negative prices as free confirmation", async () => {
    await freePolicy();
    const missing = {
      input: freeIntent.input,
      consent: true,
      policyVersion: freeIntent.policyVersion,
    };
    for (const payload of [
      missing,
      { ...freeIntent, expectedCost: null },
      { ...freeIntent, expectedCost: "0" },
      { ...freeIntent, expectedCost: -1 },
    ]) {
      await expect(
        action(user, "reserve", crypto.randomUUID(), payload),
      ).rejects.toThrow(/Price confirmation required/);
    }
    expect(await counters()).toEqual({
      requests: 0,
      plans: 0,
      debits: 0,
      charged: 0,
      grants: 0,
    });
    await expect(
      db.exec("update public.lp_policy set plan_cost=-1"),
    ).rejects.toThrow(/check constraint/);
  });
});
