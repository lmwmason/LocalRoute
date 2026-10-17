import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import {
  operatorPlaceBatchSchema,
  type OperatorPlaceEntry,
} from "../shared/catalog-import";
import { importVerifiedCatalog } from "../scripts/import-verified-places";

const env = {
  VITE_SUPABASE_URL: "https://pjdawapasozsrpnrtsfx.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_testonly0000000000000000",
};
const fixture = (number = 1): OperatorPlaceEntry => ({
  sourceUrl: `https://tourism.example.test/fixture-${number}`,
  observedAt: "2026-10-01T00:00:00Z",
  name: `Synthetic fixture gallery ${number}`,
  address: `Synthetic fixture address ${number}`,
  lat: 37.5 + number * 0.01,
  lng: 127,
  kind: "culture",
  category: "문화공간",
});

describe("offline operator import validation", () => {
  it("defaults to a dry run with no database or provider call", async () => {
    const rpc = vi.fn();
    expect(
      await importVerifiedCatalog([fixture()], env, { rpc }),
    ).toMatchObject({ applied: false, count: 1 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { SUPABASE_URL: "https://other.supabase.co" },
    { VITE_SUPABASE_URL: "https://pjdawapasozsrpnrtsfx.supabase.co/path" },
    {
      VITE_SUPABASE_URL:
        "https://name:password@pjdawapasozsrpnrtsfx.supabase.co",
    },
    {
      VITE_SUPABASE_URL:
        "https://pjdawapasozsrpnrtsfx.supabase.co?redirect=other",
    },
  ])("rejects foreign or non-root project URLs", async (bad) => {
    const rpc = vi.fn();
    await expect(
      importVerifiedCatalog(
        [fixture()],
        { ...env, ...bad },
        { apply: true, rpc },
      ),
    ).rejects.toThrow("Only the LocalRoute");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid source, photos, invented author fields and oversized batches", () => {
    for (const entries of [
      [],
      Array.from({ length: 51 }, (_, i) => fixture(i)),
      [fixture(), fixture()],
      [{ ...fixture(), sourceUrl: "http://example.test" }],
      [{ ...fixture(), sourceUrl: "https://user:password@example.test/page" }],
      [{ ...fixture(), sourceUrl: "https://example.test/page#fragment" }],
      [{ ...fixture(), observedAt: "2099-01-01T00:00:00Z" }],
      [{ ...fixture(), photo: "unrelated.jpg" }],
      [{ ...fixture(), endorsement: "I personally visited" }],
      [{ ...fixture(), lat: "37.5" }],
    ])
      expect(operatorPlaceBatchSchema.safeParse(entries).success).toBe(false);
  });

  it("requires --apply and server credentials before invoking the bounded RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          sourceUrl: fixture().sourceUrl,
          placeId: crypto.randomUUID(),
          action: "created" as const,
        },
      ],
      error: null,
    }));
    await expect(
      importVerifiedCatalog(
        [fixture()],
        { VITE_SUPABASE_URL: env.VITE_SUPABASE_URL },
        { apply: true, rpc },
      ),
    ).rejects.toThrow("server secret");
    expect(rpc).not.toHaveBeenCalled();
    expect(
      await importVerifiedCatalog([fixture()], env, { apply: true, rpc }),
    ).toMatchObject({ applied: true, count: 1 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith([fixture()]);
  });

  it("does not retry ambiguous failures or include provider details in errors", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("SECRET-DO-NOT-LOG"));
    await expect(
      importVerifiedCatalog([fixture()], env, { apply: true, rpc }),
    ).rejects.toThrow("No automatic retry");
    expect(rpc).toHaveBeenCalledTimes(1);
    await expect(
      importVerifiedCatalog([fixture()], env, {
        apply: true,
        rpc: async () => ({
          data: [],
          error: { message: "SECRET-DO-NOT-LOG" },
        }),
      }),
    ).rejects.toThrow("Catalog import failed");
  });

  it("rejects public and wrong-project legacy keys before a request", async () => {
    const rpc = vi.fn();
    const legacy = (role: string, ref: string) =>
      `test.${Buffer.from(JSON.stringify({ role, ref })).toString("base64url")}.test`;
    for (const secret of [
      "sb_publishable_testonly0000000000000000",
      legacy("anon", "pjdawapasozsrpnrtsfx"),
      legacy("service_role", "other-project"),
    ]) {
      await expect(
        importVerifiedCatalog(
          [fixture()],
          { ...env, SUPABASE_SERVICE_ROLE_KEY: secret },
          { apply: true, rpc },
        ),
      ).rejects.toThrow("server secret");
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

let db: PGlite;
async function importRows(entries: unknown, role = "service_role") {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    return (
      await tx.query<{
        value: { sourceUrl: string; placeId: string; action: string }[];
      }>("select public.import_operator_places($1::jsonb)value", [
        JSON.stringify(entries),
      ])
    ).rows[0].value;
  });
}
async function counts() {
  return (
    await db.query<{ places: number; sources: number }>(
      "select(select count(*)::int from public.places)places,(select count(*)::int from public.operator_place_sources)sources",
    )
  ).rows[0];
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant select on auth.users to service_role;alter default privileges in schema public grant execute on functions to anon,authenticated;`,
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 60_000);
afterAll(async () => {
  await db?.close();
});

describe("atomic official-source catalog RPC", () => {
  it("imports public facts with no fictional user, endorsement, review, photo or LP", async () => {
    const before = await db.query(
      "select(select count(*) from auth.users)users,(select count(*) from public.endorsements)endorsements,(select count(*) from public.place_reviews)reviews,(select count(*) from public.place_photos)photos,(select count(*) from public.lp_ledger)ledger",
    );
    const result = await importRows([fixture()]);
    expect(result).toEqual([
      {
        sourceUrl: fixture().sourceUrl,
        placeId: expect.any(String),
        action: "created",
      },
    ]);
    expect(await counts()).toEqual({ places: 1, sources: 1 });
    const after = await db.query(
      "select(select count(*) from auth.users)users,(select count(*) from public.endorsements)endorsements,(select count(*) from public.place_reviews)reviews,(select count(*) from public.place_photos)photos,(select count(*) from public.lp_ledger)ledger",
    );
    expect(after.rows).toEqual(before.rows);
    expect(
      (await db.query("select name,category,kind,status from public.places"))
        .rows,
    ).toEqual([
      {
        name: fixture().name,
        category: fixture().category,
        kind: "culture",
        status: "published",
      },
    ]);
  });

  it("replays the same source without changes and refuses silent fact replacement", async () => {
    const original = await importRows([fixture()]);
    const replay = await importRows([fixture()]);
    expect(replay).toEqual([{ ...original[0], action: "replayed" }]);
    await expect(
      importRows([{ ...fixture(), address: "Changed fixture address" }]),
    ).rejects.toThrow("Source facts changed");
    expect(await counts()).toEqual({ places: 1, sources: 1 });
  });

  it("reuses one exact name/address/nearby location without modifying its canonical facts", async () => {
    const original = await importRows([fixture()]);
    const secondSource = {
      ...fixture(),
      sourceUrl: "https://other.example.test/same-place",
      lat: fixture().lat + 0.00005,
      category: "Official gallery category",
    };
    expect(await importRows([secondSource])).toEqual([
      {
        placeId: original[0].placeId,
        sourceUrl: secondSource.sourceUrl,
        action: "reused",
      },
    ]);
    expect(await counts()).toEqual({ places: 1, sources: 2 });
    expect(
      (
        await db.query("select category from public.places where id=$1", [
          original[0].placeId,
        ])
      ).rows,
    ).toEqual([{ category: fixture().category }]);
  });

  it("rejects uncertain geographic matches and rolls back earlier entries in the same batch", async () => {
    const before = await counts();
    const conflicting = {
      ...fixture(),
      sourceUrl: "https://tourism.example.test/uncertain",
      lat: fixture().lat + 0.001,
    };
    await expect(importRows([fixture(2), conflicting])).rejects.toThrow(
      "Uncertain place match",
    );
    expect(await counts()).toEqual(before);
    await expect(
      importRows([
        {
          ...fixture(),
          sourceUrl: "https://tourism.example.test/changed-name",
          name: "Different name at same location",
        },
      ]),
    ).rejects.toThrow("Uncertain place match");
  });

  it("does not publish an existing unreviewed contributor place", async () => {
    const entry = fixture(3);
    await db.query(
      "insert into public.places(name,address,lat,lng,kind,status)values($1,$2,$3,$4,$5,'pending')",
      [entry.name, entry.address, entry.lat, entry.lng, entry.kind],
    );
    await expect(importRows([entry])).rejects.toThrow(
      "Existing place requires manual review",
    );
    expect(
      (
        await db.query("select status from public.places where name=$1", [
          entry.name,
        ])
      ).rows,
    ).toEqual([{ status: "pending" }]);
  });

  it("refuses ambiguous exact duplicates rather than picking one arbitrarily", async () => {
    const entry = fixture(4);
    for (let i = 0; i < 2; i++)
      await db.query(
        "insert into public.places(name,address,lat,lng,kind,status)values($1,$2,$3,$4,$5,'published')",
        [entry.name, entry.address, entry.lat, entry.lng, entry.kind],
      );
    await expect(importRows([entry])).rejects.toThrow(
      "Ambiguous canonical places",
    );
  });

  it("validates malformed direct RPC input and batch limits before mutation", async () => {
    const before = await counts();
    for (const entries of [
      null,
      {},
      [],
      Array.from({ length: 51 }, (_, i) => fixture(i + 10)),
      [fixture(), fixture()],
      [{ ...fixture(5), sourceUrl: "http://insecure.example.test/" }],
      [{ ...fixture(5), photos: [] }],
      [{ ...fixture(5), lat: null }],
    ])
      await expect(importRows(entries)).rejects.toThrow();
    expect(await counts()).toEqual(before);
  });

  it("allows public source reads only for published places and denies public writes/RPCs", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(importRows([fixture(5)], role)).rejects.toThrow(
        /permission denied/,
      );
      await db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        expect(
          (
            await tx.query(
              "select source_url from public.operator_place_sources",
            )
          ).rows,
        ).toHaveLength(2);
      });
    }
    await db.exec(
      "update public.places set status='rejected' where name='Synthetic fixture gallery 1'",
    );
    await db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      expect(
        (await tx.query("select * from public.operator_place_sources")).rows,
      ).toHaveLength(0);
    });
    const access = await db.query<{
      rls: boolean;
      writes: boolean;
      invoker: boolean;
    }>(
      "select(select relrowsecurity from pg_class where oid='public.operator_place_sources'::regclass)rls,has_table_privilege('authenticated','public.operator_place_sources','INSERT')writes,(select not prosecdef from pg_proc where oid='public.import_operator_places(jsonb)'::regprocedure)invoker",
    );
    expect(access.rows[0]).toEqual({ rls: true, writes: false, invoker: true });
  });
});
