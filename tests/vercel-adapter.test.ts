import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createVercelApp } from "../server/vercel-runtime";

const deployment = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);
describe("Vercel Node adapter", () => {
  it("serves health from the original API path, including an ordinary query", async () => {
    const response = await request(createVercelApp({})).get(
      "/api/health?path=/different&__localroute_path=wrong",
    );
    expect(response.status).toBe(200);
    expect(response.type).toBe("application/json");
    expect(response.body).toMatchObject({
      ok: true,
      mode: "demo",
      database: false,
    });
  });
  it("preserves JSON 404 for unknown API paths instead of rendering the SPA", async () => {
    const response = await request(createVercelApp({})).get(
      "/api/not-a-function",
    );
    expect(response.status).toBe(404);
    expect(response.type).toBe("application/json");
    expect(response.body.error).toEqual(expect.any(String));
    expect(response.text).not.toContain("<!doctype");
  });
  it("keeps disabled live storage protected without a supplied repository", async () => {
    const response = await request(
      createVercelApp({ VITE_DATA_MODE: "live" }),
    ).get("/api/itineraries");
    expect(response.status).toBe(503);
    expect(response.type).toBe("application/json");
  });
  it.each(["SUPABASE_URL", "VITE_SUPABASE_URL"])(
    "rejects another project in %s before database initialization",
    (name) => {
      expect(() =>
        createVercelApp({ [name]: "https://another-project.supabase.co" }),
      ).toThrow("must use the LocalRoute Supabase project");
    },
  );
  it.each(["VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY"])(
    "rejects server credentials in %s without printing their value",
    (name) => {
      const secret = "sb_secret_TEST_MARKER_NEVER_RETURNED";
      try {
        createVercelApp({ [name]: secret });
        throw new Error("Expected invalid public configuration to fail");
      } catch (error) {
        expect((error as Error).message).toContain(
          "public LocalRoute publishable/anon key",
        );
        expect((error as Error).message).not.toContain(secret);
      }
    },
  );
});
describe("Vercel static/API routing contract", () => {
  it("uses the existing Vite build with a bounded Node function", () => {
    expect(deployment.framework).toBe("vite");
    expect(deployment.buildCommand).toBe("node scripts/build-vercel-api.mjs");
    expect(deployment.outputDirectory).toBe("dist");
    expect(deployment.functions["api/index.ts"].maxDuration).toBe(180);
    expect(deployment.functions["api/index.ts"].excludeFiles).toContain(".env");
  });
  it("dispatches API before the SPA fallback and retains all API path segments", () => {
    const [api, spa] = deployment.rewrites;
    expect(api).toEqual({ source: "/api/:path*", destination: "/api/index" });
    expect(spa).toEqual({ source: "/(.*)", destination: "/index.html" });
    for (const path of [
      "/api",
      "/api/health",
      "/api/itineraries/owned-id",
      "/api/places/id/photo",
    ]) {
      expect(/^\/api(?:\/.*)?$/.test(path)).toBe(true);
    }
    for (const path of [
      "/plan/new/1",
      "/discover",
      "/saved",
      "/account",
      "/s/token",
      "/legal/privacy",
    ]) {
      expect(/^\/api(?:\/.*)?$/.test(path)).toBe(false);
      expect(/^\/(.*)$/.test(path)).toBe(true);
    }
  });
  it("excludes local environment files from deployment uploads", () => {
    const ignored = readFileSync(
      new URL("../.vercelignore", import.meta.url),
      "utf8",
    ).split(/\r?\n/);
    expect(ignored).toEqual(
      expect.arrayContaining([".env", ".env.*", "**/.env", "**/.env.*"]),
    );
    expect(ignored).not.toContain("public/");
  });
});
