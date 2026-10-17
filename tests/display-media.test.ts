import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  displayMediaSchema,
  parseDisplayMediaRow,
} from "../shared/display-media";
import { localCandidates } from "../server/planner/catalog";
import { demoCatalog } from "../shared/planner-demo";
import { plannerInput } from "./fixtures/planning";

const media = () => ({
  assetType: "photo" as const,
  assetPath: "/example-images/place.jpg",
  alt: "Actual venue photograph",
  credit: "Photographer",
  licenseLabel: "CC BY-SA 4.0",
  sourceUrl: "https://example.test/source",
  observedAt: new Date().toISOString(),
  changes: "Resized and metadata removed",
});
describe("canonical display media contract", () => {
  it("accepts explicit photo and AI types while rejecting unsafe paths and false photo labels", () => {
    expect(displayMediaSchema.safeParse(media()).success).toBe(true);
    expect(
      displayMediaSchema.safeParse({
        ...media(),
        assetType: "ai_illustration",
        assetPath: "/restaurant-illustrations/cafe.png",
      }).success,
    ).toBe(true);
    for (const patch of [
      { assetPath: "/example-images/../../.env" },
      { assetPath: "https://example.test/a.jpg" },
      { assetPath: "/restaurant-illustrations/cafe.png" },
      { assetPath: "/example-images/lunch-ai.png" },
      { sourceUrl: "https://user:password@example.test" },
      { sourceUrl: "javascript:alert(1)" },
      { credit: " " },
      { alt: "x".repeat(701) },
      { observedAt: new Date(Date.now() + 600000).toISOString() },
      { licenseLabel: "" },
    ])
      expect(
        displayMediaSchema.safeParse({ ...media(), ...patch }).success,
      ).toBe(false);
  });
  it("fails closed for invalid database rows", () => {
    const source = media();
    const row = {
      asset_type: source.assetType,
      asset_path: source.assetPath,
      alt: source.alt,
      credit: source.credit,
      license_label: source.licenseLabel,
      source_url: source.sourceUrl,
      observed_at: source.observedAt,
      changes: source.changes,
    };
    expect(parseDisplayMediaRow(row)).toEqual(source);
    expect(
      parseDisplayMediaRow({ ...row, asset_path: "/private/no.jpg" }),
    ).toBeUndefined();
    expect(parseDisplayMediaRow(null)).toBeUndefined();
  });
  it("passes the canonical media unchanged to planner candidates without fabricating visit evidence", () => {
    const place = {
      ...demoCatalog[0],
      category: "한식",
      rating: null,
      reviewCount: 0,
      source: "localroute" as const,
      displayMedia: media(),
      officialSources: [
        {
          url: "https://example.test/place",
          observedAt: new Date().toISOString(),
        },
      ],
      endorsements: [],
    };
    const candidate = localCandidates([place], plannerInput, {
      allowStarter: true,
    })[0];
    expect(candidate.displayMedia).toEqual(place.displayMedia);
    expect(candidate.endorsements).toEqual([]);
    expect(candidate.starterRecommendation).toBe(true);
  });
});

describe("canonical media service writes and published-only RLS", () => {
  let db: PGlite;
  const id = "00000000-0000-4000-8000-000000000001";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;create table public.places(id uuid primary key,status text);grant select on public.places to anon,authenticated,service_role;",
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261017053307_canonical_place_display_media.sql",
        "utf8",
      ),
    );
    await db.query("insert into public.places values($1,'published')", [id]);
  });
  afterAll(async () => {
    await db?.close();
  });
  async function insert(
    role: string,
    path = media().assetPath,
    type = "photo",
  ) {
    return db.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      return tx.query(
        "insert into public.place_display_media(place_id,asset_type,asset_path,alt,credit,license_label,source_url,observed_at,changes)values($1,$2,$3,'Venue','Author','Reviewed license','https://example.test/source',now(),'Resized')",
        [id, type, path],
      );
    });
  }
  it("lets only the service write one canonical row and rejects invalid paths/types", async () => {
    for (const role of ["anon", "authenticated"])
      await expect(insert(role)).rejects.toThrow("permission denied");
    await expect(
      insert("service_role", "/example-images/../bad.jpg"),
    ).rejects.toThrow();
    await expect(
      insert("service_role", "/restaurant-illustrations/cafe.png", "photo"),
    ).rejects.toThrow();
    await expect(
      insert("service_role", "/example-images/lunch-ai.png", "photo"),
    ).rejects.toThrow();
    await insert("service_role");
    await expect(insert("service_role")).rejects.toThrow("duplicate key");
  });
  it("denies all public mutations and hides media after the parent is unpublished even from its authenticated owner", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        expect(
          (await tx.query("select * from public.place_display_media")).rows,
        ).toHaveLength(1);
        const result = await tx.query<{
          insert: boolean;
          update: boolean;
          delete: boolean;
        }>(
          "select has_table_privilege(current_user,'public.place_display_media','INSERT') as insert,has_table_privilege(current_user,'public.place_display_media','UPDATE') as update,has_table_privilege(current_user,'public.place_display_media','DELETE') as delete",
        );
        expect(result.rows[0]).toEqual({
          insert: false,
          update: false,
          delete: false,
        });
      });
    }
    await db.query("update public.places set status='pending' where id=$1", [
      id,
    ]);
    for (const role of ["anon", "authenticated"])
      await db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        expect(
          (await tx.query("select * from public.place_display_media")).rows,
        ).toHaveLength(0);
      });
  });
});
