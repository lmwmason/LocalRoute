import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  importPlaceSourcePhotos,
  parseSourcePhotos,
} from "../scripts/import-place-source-photos";
import { sourcePhotoSchema } from "../shared/source-photos";
import { PlacePhoto } from "../src/components/PlacePhoto";
import { PlaceOrigin } from "../src/components/PlaceOrigin";

const manifest = JSON.parse(
  readFileSync("scripts/data/verified-place-photos.json", "utf8"),
);
const entry = () => parseSourcePhotos(manifest)[0];
const env = {
  VITE_SUPABASE_URL: "https://pjdawapasozsrpnrtsfx.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_testfixture000000000000000000",
};
describe("reviewed source photo import and UI", () => {
  it("validates actual local image bytes without a remote call in dry run", async () => {
    const rpc = vi.fn();
    const result = await importPlaceSourcePhotos(manifest, env, { rpc });
    expect(result).toMatchObject({
      applied: false,
      count: manifest.photos.length,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(parseSourcePhotos(manifest)).toHaveLength(manifest.photos.length);
    expect(
      parseSourcePhotos(manifest).every(
        (photo) => !("subjectEvidence" in photo),
      ),
    ).toBe(true);
  });
  it("rejects mismatched bytes, unsafe paths and incomplete source/license information", async () => {
    await expect(
      importPlaceSourcePhotos([{ ...entry(), sha256: "0".repeat(64) }], env),
    ).rejects.toThrow("bytes differ");
    for (const patch of [
      { assetPath: "/place-source-photos/../secret.jpg" },
      { assetPath: "https://unrelated.example.test/photo.jpg" },
      { author: "" },
      { sourcePageUrl: "javascript:alert(1)" },
      { licenseUrl: "https://different.example.test/" },
      { license: "Unknown" },
    ])
      expect(
        sourcePhotoSchema.safeParse({ ...entry(), ...patch }).success,
      ).toBe(false);
  });
  it("requires an exact LocalRoute project and explicit apply before a database request", async () => {
    const rpc = vi.fn(async (entries) => ({
      data: entries.map(() => ({ action: "created" })),
      error: null,
    }));
    await expect(
      importPlaceSourcePhotos(
        manifest,
        { ...env, SUPABASE_URL: "https://other.supabase.co" },
        { apply: true, rpc },
      ),
    ).rejects.toThrow("Only the LocalRoute");
    expect(rpc).not.toHaveBeenCalled();
    expect(
      await importPlaceSourcePhotos(manifest, env, { apply: true, rpc }),
    ).toMatchObject({ applied: true, count: manifest.photos.length });
    expect(rpc).toHaveBeenCalledOnce();
  });
  it("uses real licensed assets only as the public fallback and preserves contributor priority", () => {
    const photo = entry();
    const html = renderToStaticMarkup(
      createElement(PlacePhoto, { sourcePhoto: photo, name: "Fixture venue" }),
    );
    expect(html).toContain(photo.assetPath);
    expect(html).toContain(photo.caption);
    const privateHtml = renderToStaticMarkup(
      createElement(PlacePhoto, {
        sourcePhoto: photo,
        name: "Fixture venue",
        privatePreview: true,
      }),
    );
    expect(privateHtml).not.toContain(photo.assetPath);
    const contributor = renderToStaticMarkup(
      createElement(PlacePhoto, {
        id: "approved-contributor-photo",
        sourcePhoto: photo,
        name: "Fixture venue",
      }),
    );
    expect(contributor).toContain(
      "/api/place-photos/approved-contributor-photo/image",
    );
    expect(contributor).not.toContain(photo.assetPath);
  });
  it("shows author/license/source and historical capture context visibly", () => {
    const photo = entry();
    const html = renderToStaticMarkup(
      createElement(PlaceOrigin, { sourcePhoto: photo, linked: true }),
    );
    for (const value of [
      photo.author,
      photo.license,
      photo.licenseUrl,
      photo.sourcePageUrl,
      photo.caption,
    ])
      expect(html).toContain(value);
    const historical = parseSourcePhotos(manifest).find((photo) =>
      photo.capturedAt?.startsWith("2006"),
    );
    if (historical)
      expect(
        renderToStaticMarkup(
          createElement(PlaceOrigin, { sourcePhoto: historical }),
        ),
      ).toContain("2006-06-26");
  });
});

let db: PGlite;
const placeId = "99000000-0000-4000-8000-000000000001";
const sourceUrl = "https://source.example.test/place";
const dbEntry = () => ({ ...entry(), placeSourceUrl: sourceUrl });
async function rpc(rows: unknown, role = "service_role") {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    return (
      await tx.query<{ result: { id: string; action: string }[] }>(
        "select public.import_place_source_photos($1::jsonb)result",
        [JSON.stringify(rows)],
      )
    ).rows[0].result;
  });
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant select on auth.users to service_role;alter default privileges in schema public grant execute on functions to anon,authenticated;",
  );
  for (const file of readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query(
    "insert into public.places(id,name,address,lat,lng,kind,category,status)values($1,'Fixture park','Fixture address',37.5,127,'attraction','park','published')",
    [placeId],
  );
  await db.query(
    "insert into public.operator_place_sources(source_url,place_id,observed_at,facts)values($1,$2,now(),'{}')",
    [sourceUrl, placeId],
  );
}, 60_000);
afterAll(async () => {
  await db?.close();
});
describe("source photo database permissions and idempotence", () => {
  it("links exact source identity once and replays without creating contributor evidence or LP", async () => {
    const first = await rpc([dbEntry()]);
    const second = await rpc([dbEntry()]);
    expect(first[0].action).toBe("created");
    expect(second).toEqual([{ ...first[0], action: "replayed" }]);
    expect(
      (
        await db.query<{ photos: number; contributor: number; ledger: number }>(
          "select(select count(*)::int from public.place_source_photos)photos,(select count(*)::int from public.place_photos)contributor,(select count(*)::int from public.lp_ledger)ledger",
        )
      ).rows[0],
    ).toEqual({ photos: 1, contributor: 0, ledger: 0 });
    await expect(
      rpc([{ ...dbEntry(), author: "Changed author" }]),
    ).rejects.toThrow("manual review");
  });
  it("validates direct RPC source requirements and invalid asset paths atomically", async () => {
    for (const patch of [
      { assetPath: "/place-source-photos/../../.env" },
      { sourcePageUrl: null },
      { author: null },
      { license: "Unknown", licenseUrl: "" },
      { licenseUrl: "https://bad.example.test" },
      { placeSourceUrl: "https://source.example.test/missing" },
    ])
      await expect(
        rpc([
          {
            ...dbEntry(),
            assetPath: "/place-source-photos/second.jpg",
            ...patch,
          },
        ]),
      ).rejects.toThrow();
    expect(
      (await db.query("select * from public.place_source_photos")).rows,
    ).toHaveLength(1);
  });
  it("allows published metadata reads, denies client writes and RPCs, and hides unpublished rows", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(rpc([dbEntry()], role)).rejects.toThrow("permission denied");
      await db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        expect(
          (await tx.query("select * from public.place_source_photos")).rows,
        ).toHaveLength(1);
        expect(
          (
            await tx.query<{ write: boolean }>(
              "select has_table_privilege(current_user,'public.place_source_photos','INSERT')write",
            )
          ).rows[0].write,
        ).toBe(false);
      });
    }
    await db.query("update public.places set status='rejected' where id=$1", [
      placeId,
    ]);
    await db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      expect(
        (await tx.query("select * from public.place_source_photos")).rows,
      ).toHaveLength(0);
    });
    await expect(
      rpc([{ ...dbEntry(), assetPath: "/place-source-photos/third.jpg" }]),
    ).rejects.toThrow("Published source place not found");
  });
});
