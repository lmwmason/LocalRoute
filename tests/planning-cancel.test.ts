import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { createApp } from "../server/app";
import { readConfig } from "../server/config";
import type { Actor, Repository } from "../server/repository";
import { AppError } from "../server/errors";
import { LEGAL_VERSION } from "../shared/legal";

const legal = vi.hoisted(() => ({ current: true }));
vi.mock("../server/legal", async (load) => {
  const original = await load<typeof import("../server/legal")>();
  return {
    ...original,
    createLegalStore: () => ({
      authenticate: async (token: string) => {
        if (token === "unverified")
          throw new AppError(401, "LEGAL_VERIFIED_EMAIL_REQUIRED");
        return token;
      },
      status: async () => ({ current: legal.current }),
    }),
  };
});
let db: PGlite, user: string, other: string, id: string;
const intent = {
  input: { destination: "seongsu" },
  expectedCost: 100,
  policyVersion: "cancel-fixture",
  consent: true,
};
async function action(
  actor: string,
  name: string,
  requestId: string,
  payload: unknown = {},
) {
  try {
    return await db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return (
        await tx.query<{ value: { status: string } }>(
          "select public.planning_action($1,$2,$3,$4::jsonb)value",
          [actor, name, requestId, JSON.stringify(payload)],
        )
      ).rows[0].value;
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    throw new AppError(
      code === "LR404" ? 404 : code === "LR410" ? 410 : 503,
      code || "FAILED",
    );
  }
}
const planning = vi.fn(
  (actor: Actor, name: string, requestId: string, payload: unknown = {}) =>
    action(actor.id, name, requestId, payload),
);
const repo = {
  authenticate: async (token: string) => ({ id: token, role: "traveler" }),
  planning,
} as unknown as Repository;
function app() {
  return createApp(
    {
      ...readConfig({}),
      live: true,
      database: true,
      url: "https://pjdawapasozsrpnrtsfx.supabase.co",
      secret: "sb_secret_testfixture000000000000000000",
    },
    repo,
  );
}
function cancel(token = user, requestId = id) {
  return request(app())
    .post(`/api/planning/cancel/${requestId}`)
    .set("Authorization", `Bearer ${token}`);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),is_anonymous boolean default false);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant select on auth.users to service_role;alter default privileges in schema public grant execute on functions to anon,authenticated;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 60000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  legal.current = true;
  planning.mockClear();
  user = crypto.randomUUID();
  other = crypto.randomUUID();
  id = crypto.randomUUID();
  for (const actor of [user, other]) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      actor,
      `${actor}@example.test`,
    ]);
    await db.query(
      "insert into public.legal_consent_events(user_id,request_id,version,language,terms,privacy,supabase_transfer,adult,public_local_area)values($1,$2,$3,'en',true,true,true,true,false)",
      [actor, crypto.randomUUID(), LEGAL_VERSION],
    );
  }
  await db.exec(
    "update public.lp_policy set planning_enabled=true,plan_cost=100,monthly_promo=300,version='cancel-fixture'",
  );
});
describe("authenticated atomic itinerary generation cancellation", () => {
  it("cancels once, releases the hold, rejects late finalize, and never debits LP", async () => {
    await action(user, "reserve", id, intent);
    expect((await cancel()).body).toEqual({ status: "failed" });
    expect((await cancel()).body).toEqual({ status: "failed" });
    expect(
      planning.mock.calls.filter((call) => call[1] === "fail"),
    ).toHaveLength(1);
    expect(planning.mock.calls.find((call) => call[1] === "fail")?.[3]).toEqual(
      { code: "USER_CANCELLED" },
    );
    await expect(
      action(user, "finalize", id, { result: {} }),
    ).rejects.toMatchObject({ status: 410 });
    const counters = await db.query<{
      debits: number;
      releases: number;
      held: number;
    }>(
      "select(select count(*)::int from public.lp_ledger where user_id=$1 and amount<0)debits,(select count(*)::int from public.audit_logs where actor_id=$1 and action='planning.released')releases,(select coalesce(sum(cost),0)::int from public.planning_requests where user_id=$1 and status='generating')held",
      [user],
    );
    expect(counters.rows[0]).toEqual({ debits: 0, releases: 1, held: 0 });
  });
  it("preserves an already saved ready itinerary", async () => {
    await action(user, "reserve", id, intent);
    await db.query(
      "update public.planning_requests set status='ready' where user_id=$1 and request_id=$2",
      [user, id],
    );
    const saved = { title: "Already saved itinerary fixture" };
    await db.query(
      "insert into public.itineraries(user_id,source_request_id,result)select user_id,id,$3::jsonb from public.planning_requests where user_id=$1 and request_id=$2",
      [user, id, JSON.stringify(saved)],
    );
    expect((await cancel()).body).toEqual({ status: "ready" });
    expect(
      planning.mock.calls.filter((call) => call[1] === "fail"),
    ).toHaveLength(0);
    expect((await action(user, "status", id)).status).toBe("ready");
    expect(
      (
        await db.query<{ result: unknown }>(
          "select result from public.itineraries where user_id=$1",
          [user],
        )
      ).rows[0].result,
    ).toEqual(saved);
  });
  it("returns not_found for another owner's request or missing ID without creating work", async () => {
    await action(user, "reserve", id, intent);
    expect((await cancel(other)).body).toEqual({ status: "not_found" });
    expect((await cancel(user, crypto.randomUUID())).body).toEqual({
      status: "not_found",
    });
    expect((await action(user, "status", id)).status).toBe("generating");
    expect(
      planning.mock.calls.filter((call) => call[1] !== "status"),
    ).toHaveLength(0);
  });
  it("returns ready when completion wins the race after the initial status read", async () => {
    await action(user, "reserve", id, intent);
    planning.mockImplementationOnce(async (...args) => {
      const prior = await action(args[0].id, args[1], args[2], args[3]);
      await db.query(
        "update public.planning_requests set status='ready' where user_id=$1 and request_id=$2",
        [user, id],
      );
      return prior;
    });
    expect((await cancel()).body).toEqual({ status: "ready" });
    expect((await action(user, "status", id)).status).toBe("ready");
  });
  it("requires verified authentication, current legal consent, and a UUID before repository work", async () => {
    expect(
      (await request(app()).post(`/api/planning/cancel/${id}`)).status,
    ).toBe(401);
    expect((await cancel("unverified")).status).toBe(401);
    legal.current = false;
    expect((await cancel()).status).toBe(403);
    legal.current = true;
    expect((await cancel(user, "invalid-id")).status).toBe(400);
    expect(planning).not.toHaveBeenCalled();
  });
});
