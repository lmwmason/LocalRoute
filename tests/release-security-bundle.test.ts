import { afterEach, describe, expect, it, vi } from "vitest";
import { build } from "vite";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig } from "../server/config";

// Synthetic, unsigned and unusable credentials only. Never read the local .env.
const fakeServiceJwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ),
  Buffer.from(
    JSON.stringify({
      role: "service_role",
      ref: "pjdawapasozsrpnrtsfx",
      marker: "RELEASE_REVIEW_FAKE_ONLY",
    }),
  ).toString("base64url"),
  "unsigned-test-only",
].join(".");
const privateMarkers = {
  SUPABASE_SECRET_KEY: "sb_secret_RELEASE_REVIEW_FAKE_ONLY",
  SUPABASE_SERVICE_ROLE_KEY: "RELEASE_REVIEW_PRIVATE_SERVICE_KEY",
  GEMINI_API_KEY: "RELEASE_REVIEW_PRIVATE_GEMINI",
  HEY_YUMI_API_KEY: "RELEASE_REVIEW_PRIVATE_HEYYUMI",
  KAKAO_REST_API_KEY: "RELEASE_REVIEW_PRIVATE_KAKAO",
};
afterEach(() => vi.unstubAllEnvs());
describe("release security: production bundle and startup configuration", () => {
  it("builds with a public key while excluding every server-only marker", async () => {
    for (const [key, value] of Object.entries(privateMarkers))
      vi.stubEnv(key, value);
    vi.stubEnv("VITE_SUPABASE_URL", "https://pjdawapasozsrpnrtsfx.supabase.co");
    vi.stubEnv(
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_fixture_public_key_only",
    );
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const outDir = mkdtempSync(join(tmpdir(), "localroute-safe-bundle-"));
    try {
      await build({
        envDir: false,
        logLevel: "silent",
        build: { outDir, emptyOutDir: true, sourcemap: false },
      });
      const names = readdirSync(join(outDir, "assets"));
      const code = names
        .filter((name) => name.endsWith(".js"))
        .map((name) => readFileSync(join(outDir, "assets", name), "utf8"))
        .join("\n");
      for (const value of Object.values(privateMarkers))
        expect(code).not.toContain(value);
      expect(names.some((name) => name.endsWith(".map"))).toBe(false);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60000);
  it("RS-001 regression: rejects a service-role key before emitting any browser bundle", async () => {
    for (const [key, value] of Object.entries(privateMarkers))
      vi.stubEnv(key, value);
    vi.stubEnv("VITE_SUPABASE_URL", "https://pjdawapasozsrpnrtsfx.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", fakeServiceJwt);
    vi.stubEnv("VITE_DATA_MODE", "live");
    const outDir = mkdtempSync(join(tmpdir(), "localroute-security-bundle-"));
    try {
      await expect(
        build({
          envDir: false,
          logLevel: "silent",
          build: { outDir, emptyOutDir: true, sourcemap: false },
        }),
      ).rejects.toThrow(/publishable or anon/);
      expect(readdirSync(outDir)).toHaveLength(0);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60000);
  it("RS-001 regression: server rejects a service credential as the public client key", () => {
    const config = readConfig({
      VITE_DATA_MODE: "live",
      SUPABASE_URL: "https://pjdawapasozsrpnrtsfx.supabase.co",
      VITE_SUPABASE_ANON_KEY: fakeServiceJwt,
      SUPABASE_SECRET_KEY: "fake-server-only",
    });
    expect(config.database).toBe(false);
    expect(config.warnings.some((warning) => warning.includes("공개 키"))).toBe(
      true,
    );
  });
  it("disables database/planning with a wrong project or missing credentials without printing their values", () => {
    for (const env of [
      {
        SUPABASE_URL: "https://wrong-project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "sb_publishable_fixture_public_key_only",
        SUPABASE_SECRET_KEY: "FAKE_PRIVATE",
      },
      {
        SUPABASE_URL: "https://pjdawapasozsrpnrtsfx.supabase.co",
        VITE_SUPABASE_ANON_KEY: "sb_publishable_fixture_public_key_only",
      },
      { SUPABASE_URL: "not-a-url", SUPABASE_SECRET_KEY: "FAKE_PRIVATE" },
    ]) {
      const config = readConfig({
        ...env,
        VITE_DATA_MODE: "live",
        FEATURE_AI_PLANNING: "true",
        PLANNING_POLICY_APPROVED: "true",
      });
      expect(config.database).toBe(false);
      expect(config.planning).toBe(false);
      expect(config.warnings.length).toBeGreaterThan(0);
      expect(JSON.stringify(config.warnings).includes("FAKE_PRIVATE")).toBe(
        false,
      );
    }
  });
});
