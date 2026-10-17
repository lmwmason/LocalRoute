import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { shareSnapshot, sharedItineraryText } from "../shared/sharing";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { evaluateSchedule, type Itinerary } from "../shared/planner";
import { plannerInput } from "./fixtures/planning";
import { hashShareToken } from "../server/sharing";
const owner = "71000000-0000-4000-8000-000000000001",
  stranger = "71000000-0000-4000-8000-000000000002";
const input = {
  ...plannerInput,
  dietary: "PRIVATE_DIETARY",
  language: "en" as const,
};
const schedule = demoSchedule(input);
const plan: Itinerary = {
  id: "71000000-0000-4000-8000-000000000003",
  revision: 1,
  input,
  schedule: {
    ...schedule,
    title: "PRIVATE_MODEL_TITLE",
    summary: "PRIVATE_MODEL_SUMMARY",
  },
  catalog: demoCatalog,
  evaluation: evaluateSchedule(schedule, input, demoCatalog),
  createdAt: new Date().toISOString(),
  model: "private-model",
  provenance: "demo",
  cost: 0,
};
let db: PGlite;
const action = (
  actor: string | null,
  kind: string,
  payload: Record<string, unknown>,
) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (
      await tx.query<{ value: Record<string, unknown> }>(
        "select public.itinerary_share_action($1,$2,$3)value",
        [actor, kind, payload],
      )
    ).rows[0].value;
  });
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant select on auth.users to service_role;insert into auth.users(id) values('${owner}'),('${stranger}');`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  // A service-owned fixture avoids any LP, provider or model side effects.
  await db.query(
    "insert into public.itineraries(id,user_id,result,revision)values($1,$2,$3,1)",
    [plan.id, owner, { ...plan, evaluation: { valid: true } }],
  );
});
afterAll(async () => {
  await db?.close();
});
describe("privacy-preserving itinerary sharing", () => {
  const token = "a".repeat(43),
    snapshot = shareSnapshot(plan),
    payload = {
      itineraryId: plan.id,
      revision: 1,
      consentVersion: "unlisted-itinerary-v1",
      expiresInDays: 7,
      tokenHash: hashShareToken(token),
      snapshot,
    };
  let link: Record<string, unknown>;
  it("whitelists only selected venues and times, excluding prompt/model/private data", () => {
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("PRIVATE_");
    expect(serialized).not.toContain("dietary");
    expect(snapshot.days[0].stops[0].startAt).toMatch(/T09:30:00\+09:00$/);
    expect(sharedItineraryText(snapshot)).toContain("FICTIONAL");
    expect(snapshot.days.flatMap((day) => day.stops)).toHaveLength(5);
  });
  it("requires ownership, current revision and explicit sharing consent", async () => {
    await expect(action(stranger, "create", payload)).rejects.toThrow(
      /Itinerary not found/,
    );
    await expect(
      action(owner, "create", { ...payload, revision: 2 }),
    ).rejects.toThrow(/revision and consent/);
    await expect(
      action(owner, "create", { ...payload, consentVersion: "" }),
    ).rejects.toThrow(/revision and consent/);
    link = await action(owner, "create", payload);
    expect(
      await action(null, "public", { tokenHash: hashShareToken(token) }),
    ).toEqual(snapshot);
    expect(JSON.stringify(link)).not.toContain(token);
  });
  it("denies client RPC, anonymous table reads and other-user link reads", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query("select * from public.itinerary_shares");
      }),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query(
          "select public.itinerary_share_action(null,'public','{}')",
        );
      }),
    ).rejects.toThrow(/permission denied/);
    await db.transaction(async (tx) => {
      await tx.exec(
        `set local role authenticated;select set_config('request.jwt.claim.sub','${stranger}',true)`,
      );
      expect(
        (await tx.query("select * from public.itinerary_shares")).rows,
      ).toHaveLength(0);
    });
  });
  it("revokes idempotently, rejects expired/unknown tokens and protects revocation ownership", async () => {
    await expect(action(stranger, "revoke", { id: link.id })).rejects.toThrow(
      /Share not found/,
    );
    await action(owner, "revoke", { id: link.id });
    await action(owner, "revoke", { id: link.id });
    await expect(
      action(null, "public", { tokenHash: hashShareToken(token) }),
    ).rejects.toThrow(/Share not found/);
    const another = await action(owner, "create", {
      ...payload,
      tokenHash: hashShareToken("b".repeat(43)),
    });
    await db.query(
      "update public.itinerary_shares set created_at=now()-interval'2 days',expires_at=now()-interval'1 day'where id=$1",
      [another.id],
    );
    await expect(
      action(null, "public", { tokenHash: hashShareToken("b".repeat(43)) }),
    ).rejects.toThrow(/Share not found/);
    await expect(
      action(null, "public", { tokenHash: hashShareToken("c".repeat(43)) }),
    ).rejects.toThrow(/Share not found/);
  });
});
