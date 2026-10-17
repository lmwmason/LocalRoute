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
  it("CONFIRMED RS-001: a legacy service_role JWT in the public key setting survives the actual production build", async () => {
    for (const [key, value] of Object.entries(privateMarkers))
      vi.stubEnv(key, value);
    vi.stubEnv("VITE_SUPABASE_URL", "https://pjdawapasozsrpnrtsfx.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", fakeServiceJwt);
    vi.stubEnv("VITE_DATA_MODE", "live");
    const outDir = mkdtempSync(join(tmpdir(), "localroute-security-bundle-"));
    try {
      await build({
        envDir: false,
        logLevel: "silent",
        build: { outDir, emptyOutDir: true, sourcemap: false },
      });
      const assets = readdirSync(join(outDir, "assets")).filter((name) =>
        name.endsWith(".js"),
      );
      const code = assets
        .map((name) => readFileSync(join(outDir, "assets", name), "utf8"))
        .join("\n");
      // This is a vulnerability reproduction, NOT an assertion that key handling is safe.
      expect(code.includes(fakeServiceJwt)).toBe(true);
      for (const value of Object.values(privateMarkers))
        expect(code.includes(value)).toBe(false);
      expect(
        readdirSync(join(outDir, "assets")).some((name) =>
          name.endsWith(".map"),
        ),
      ).toBe(false);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60000);
  it("CONFIRMED RS-001: server configuration accepts a service credential as its public client key", () => {
    const config = readConfig({
      VITE_DATA_MODE: "live",
      SUPABASE_URL: "https://pjdawapasozsrpnrtsfx.supabase.co",
      VITE_SUPABASE_ANON_KEY: fakeServiceJwt,
      SUPABASE_SECRET_KEY: "fake-server-only",
    });
    expect(config.database).toBe(true);
    expect(config.publicKey === fakeServiceJwt).toBe(true);
  });
  it("disables database/planning with a wrong project or missing credentials without printing their values", () => {
    for (const env of [
      {
        SUPABASE_URL: "https://wrong-project.supabase.co",
        VITE_SUPABASE_ANON_KEY: "FAKE_PUBLIC",
        SUPABASE_SECRET_KEY: "FAKE_PRIVATE",
      },
      {
        SUPABASE_URL: "https://pjdawapasozsrpnrtsfx.supabase.co",
        VITE_SUPABASE_ANON_KEY: "FAKE_PUBLIC",
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
