import { describe, expect, it, vi } from "vitest";
import express, { type ErrorRequestHandler } from "express";
import request from "supertest";
import { createClient } from "@supabase/supabase-js";
import { readContributorOutcomes } from "../server/visit-rewards/contributor-outcomes";
import { attachVisitRewards } from "../server/visit-rewards";
import { AppError } from "../server/errors";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1),
  other = id(2),
  endorsement = id(10),
  old = id(20),
  current = id(21);
type Row = Record<string, unknown>;
function fixture(failTable?: string) {
  const tables: Record<string, Row[]> = {
    endorsements: [
      { id: endorsement, user_id: owner, place_id: id(30) },
      { id: id(11), user_id: other, place_id: id(30) },
      { id: id(12), user_id: owner, place_id: id(31) },
    ],
    places: [{ id: id(30), name: "실제 등록 장소" }],
    endorsement_versions: [
      {
        id: old,
        endorsement_id: endorsement,
        version: 1,
        text: "이전 추천의 내용입니다",
        status: "superseded",
      },
      {
        id: current,
        endorsement_id: endorsement,
        version: 2,
        text: "수정한 추천의 내용입니다",
        status: "pending",
      },
      {
        id: id(22),
        endorsement_id: id(11),
        version: 1,
        text: "다른 사용자의 비공개 초안",
        status: "pending",
      },
    ],
    endorsement_ratings: [
      { id: id(40), endorsement_version_id: old, helpfulness: 1 },
      { id: id(41), endorsement_version_id: old, helpfulness: 5 },
      ...Array.from({ length: 101 }, (_, n) => ({
        id: id(1000 + n),
        endorsement_version_id: current,
        helpfulness: 4,
      })),
      { id: id(42), endorsement_version_id: id(22), helpfulness: 5 },
    ],
    // Must never be read or conflated with helpfulness.
    place_reviews: [
      { id: id(50), rating: 1, place_id: id(30), private_evidence: "secret" },
    ],
    visit_reward_requests: [
      {
        id: id(60),
        curator_id: owner,
        endorsement_version_id: old,
        state: "approved",
      },
      {
        id: id(61),
        curator_id: owner,
        endorsement_version_id: current,
        state: "pending",
      },
      {
        id: id(62),
        curator_id: owner,
        endorsement_version_id: current,
        state: "approved",
      },
      {
        id: id(63),
        curator_id: other,
        endorsement_version_id: id(22),
        state: "pending",
      },
      {
        id: id(64),
        curator_id: owner,
        endorsement_version_id: current,
        state: "rejected",
      },
    ],
    visit_reward_grants: [
      {
        id: id(70),
        curator_id: owner,
        endorsement_version_id: old,
        request_id: id(60),
        amount: 20,
        ledger_id: id(80),
      },
      {
        id: id(71),
        curator_id: owner,
        endorsement_version_id: current,
        request_id: id(65),
        amount: 999,
        ledger_id: id(81),
      },
      {
        id: id(72),
        curator_id: owner,
        endorsement_version_id: current,
        request_id: id(66),
        amount: 888,
        ledger_id: id(82),
      },
      {
        id: id(73),
        curator_id: other,
        endorsement_version_id: id(22),
        request_id: id(63),
        amount: 777,
        ledger_id: id(83),
      },
    ],
    lp_ledger: [
      {
        id: id(80),
        user_id: owner,
        bucket: "earned",
        amount: 20,
        event_key: `visit-reward:${id(60)}`,
      },
      {
        id: id(81),
        user_id: other,
        bucket: "earned",
        amount: 999,
        event_key: `visit-reward:${id(65)}`,
      },
      {
        id: id(82),
        user_id: owner,
        bucket: "earned",
        amount: 888,
        event_key: "monthly:unrelated",
      },
    ],
  };
  const calls: URL[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url);
    expect(init?.method).toBe("GET");
    const table = url.pathname.split("/").at(-1)!;
    if (table === failTable)
      return Response.json({ code: "42P01" }, { status: 500 });
    expect(table).not.toBe("place_reviews");
    expect(url.searchParams.get("select")).not.toBe("*");
    let rows = [...(tables[table] || [])];
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq."))
        rows = rows.filter((r) => String(r[key]) === value.slice(3));
      if (value.startsWith("in.("))
        rows = rows.filter((r) =>
          value.slice(4, -1).split(",").includes(String(r[key])),
        );
    }
    rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const from = Number(url.searchParams.get("offset") || 0),
      limit = Number(url.searchParams.get("limit") || 1000);
    const columns = url.searchParams.get("select")!.split(",");
    return Response.json(
      rows
        .slice(from, from + limit)
        .map((row) => Object.fromEntries(columns.map((c) => [c, row[c]]))),
    );
  };
  const client = createClient(
    "https://pjdawapasozsrpnrtsfx.supabase.co",
    "fixture-only-not-a-secret",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetcher },
    },
  );
  return { client, calls };
}

describe("contributor outcomes: scoped read-only history", () => {
  it("keeps versions/place satisfaction separate, paginates ratings, and counts only ledger-backed actual LP", async () => {
    const { client, calls } = fixture();
    const result = await readContributorOutcomes(client, owner);
    expect(result.items).toHaveLength(3);
    expect(result.items.find((r) => r.versionId === old)).toMatchObject({
      ratingCount: 2,
      helpfulnessAverage: 3,
      paidLp: 20,
      pendingReviewCount: 0,
      awaitingPayoutCount: 0,
    });
    expect(result.items.find((r) => r.versionId === current)).toMatchObject({
      ratingCount: 101,
      helpfulnessAverage: 4,
      paidLp: 0,
      pendingReviewCount: 1,
      awaitingPayoutCount: 1,
    });
    expect(result.items.find((r) => r.versionId === null)).toMatchObject({
      placeName: null,
      ratingCount: 0,
      helpfulnessAverage: null,
      paidLp: 0,
      status: null,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private|secret|다른 사용자|visitor_id|evidence/,
    );
    expect(
      calls
        .find((u) => u.pathname.endsWith("/endorsements"))!
        .searchParams.get("user_id"),
    ).toBe(`eq.${owner}`);
    for (const table of [
      "visit_reward_requests",
      "visit_reward_grants",
      "lp_ledger",
    ]) {
      const scoped = calls.filter((u) => u.pathname.endsWith(`/${table}`));
      expect(scoped.length).toBeGreaterThan(0);
      expect(
        scoped.every(
          (u) =>
            u.searchParams.get(
              table === "lp_ledger" ? "user_id" : "curator_id",
            ) === `eq.${owner}`,
        ),
      ).toBe(true);
    }
    expect(
      calls.some(
        (u) =>
          u.pathname.endsWith("/endorsement_ratings") &&
          u.searchParams.get("offset") === "100",
      ),
    ).toBe(true);
  });
  it("returns an honest empty result and never disguises unavailable tables as zero earnings", async () => {
    const empty = fixture();
    expect(await readContributorOutcomes(empty.client, id(999))).toEqual({
      items: [],
    });
    expect(empty.calls).toHaveLength(1);
    await expect(
      readContributorOutcomes(fixture("visit_reward_grants").client, owner),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("uses only the authenticated actor, rejects account overrides even for admin, and never invokes payout RPCs", async () => {
    const action = vi.fn(),
      contributorOutcomes = vi.fn(async (actor: string) =>
        readContributorOutcomes(fixture().client, actor),
      );
    const app = express();
    attachVisitRewards(
      app,
      {
        live: true,
        database: true,
        url: "https://pjdawapasozsrpnrtsfx.supabase.co",
        secret: "fixture",
      },
      async (req) => {
        const token = req.get("Authorization");
        if (!token || token === "unverified")
          throw new AppError(401, "visit.auth");
        return {
          id: token === "other" ? other : owner,
          role: token === "admin" ? "admin" : "traveler",
        };
      },
      { action, contributorOutcomes },
    );
    app.use(((error, _req, res, _next) =>
      res
        .status(error.status || 500)
        .json({ error: error.message })) as ErrorRequestHandler);
    const endpoint = "/api/visit-rewards/contributor-outcomes";
    await request(app).get(endpoint).expect(401);
    await request(app)
      .get(endpoint)
      .set("Authorization", "unverified")
      .expect(401);
    await request(app)
      .get(`${endpoint}?userId=${other}`)
      .set("Authorization", "admin")
      .expect(400);
    const response = await request(app)
      .get(endpoint)
      .set("Authorization", "owner")
      .expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(
      response.body.items.every(
        (r: { endorsementId: string }) => r.endorsementId !== id(11),
      ),
    ).toBe(true);
    const foreign = await request(app)
      .get(endpoint)
      .set("Authorization", "other")
      .expect(200);
    expect(foreign.body.items).toHaveLength(1);
    expect(foreign.body.items[0].endorsementId).toBe(id(11));
    expect(contributorOutcomes.mock.calls.map(([actor]) => actor)).toEqual([
      owner,
      other,
    ]);
    expect(action).not.toHaveBeenCalled();
  });
});
