import { describe, expect, it, vi } from "vitest";

const scriptUrl = new URL(
  "../scripts/apply-auth-email-templates.mjs",
  import.meta.url,
);
const { run, loadTemplatePayload, validateTemplate, AUTH_CONFIG_ENDPOINT } =
  await import(scriptUrl.href);

describe("LocalRoute authentication email setup", () => {
  it("validates bilingual, self-contained templates without sending requests by default", async () => {
    const fetchImpl = vi.fn();
    const log = vi.fn();
    const result = await run({ fetchImpl, log });
    expect(result.applied).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("DRY RUN"));
    const payload = await loadTemplatePayload();
    expect(Object.keys(payload).sort()).toEqual([
      "mailer_subjects_confirmation",
      "mailer_subjects_magic_link",
      "mailer_templates_confirmation_content",
      "mailer_templates_magic_link_content",
    ]);
    for (const html of [
      payload.mailer_templates_confirmation_content,
      payload.mailer_templates_magic_link_content,
    ]) {
      expect(html).toContain('href="{{ .ConfirmationURL }}"');
      expect(html).toContain('lang="en"');
      expect(html).toMatch(/[가-힣]/);
      expect(html).not.toMatch(/{{\s*\.(?:Data|Email|Phone|Token|SiteURL)/);
    }
  });

  it.each([
    { VITE_SUPABASE_URL: "https://anotherproject.supabase.co" },
    { SUPABASE_URL: "https://pjdawapasozsrpnrtsfx.supabase.co.attacker.test" },
    { SUPABASE_PROJECT_REF: "anotherproject" },
  ])("rejects mismatched projects even for dry runs: %j", async (env) => {
    const fetchImpl = vi.fn();
    await expect(run({ env, fetchImpl })).rejects.toThrow(
      "Only the LocalRoute",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "sb_secret_do-not-use",
    "sb_publishable_public",
    "eyJserviceRoleJwt",
    "token with spaces",
  ])(
    "refuses missing or inappropriate management credentials",
    async (token) => {
      const fetchImpl = vi.fn();
      await expect(
        run({
          args: ["--apply"],
          env: { SUPABASE_ACCESS_TOKEN: token },
          fetchImpl,
        }),
      ).rejects.toThrow("Management API access token");
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("updates only four mail fields at the fixed project and verifies the stored result", async () => {
    const payload = await loadTemplatePayload();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...payload, smtp_pass: "must-not-be-logged" }),
      });
    const log = vi.fn();
    const result = await run({
      args: ["--apply"],
      env: { SUPABASE_ACCESS_TOKEN: "management-test-only" },
      fetchImpl,
      log,
    });
    expect(result.applied).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, patch] = fetchImpl.mock.calls[0];
    expect(url).toBe(AUTH_CONFIG_ENDPOINT);
    expect(url).toBe(
      "https://api.supabase.com/v1/projects/pjdawapasozsrpnrtsfx/config/auth",
    );
    expect(patch.method).toBe("PATCH");
    expect(patch.redirect).toBe("error");
    expect(JSON.parse(patch.body)).toEqual(payload);
    expect(fetchImpl.mock.calls[1][1].method).toBe("GET");
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /management-test-only|smtp_pass|must-not-be-logged/,
    );
  });

  it("does not follow redirects or retry an ambiguous write", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("request with SECRET-TOKEN failed"));
    await expect(
      run({
        args: ["--apply"],
        env: { SUPABASE_ACCESS_TOKEN: "management-test-only" },
        fetchImpl,
      }),
    ).rejects.toThrow("network failure");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("withholds provider error bodies that can contain secrets", async () => {
    const json = vi.fn().mockResolvedValue({ smtp_pass: "secret" });
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 403, json });
    await expect(
      run({
        args: ["--apply"],
        env: { SUPABASE_ACCESS_TOKEN: "management-test-only" },
        fetchImpl,
      }),
    ).rejects.toThrow("HTTP 403");
    expect(json).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports accepted writes with failed or mismatched verification as unverified", async () => {
    for (const response of [
      { ok: false },
      { ok: true, json: async () => ({}) },
    ]) {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce(response);
      await expect(
        run({
          args: ["--apply"],
          env: { SUPABASE_ACCESS_TOKEN: "management-test-only" },
          fetchImpl,
        }),
      ).rejects.toThrow(
        /read-back verification failed|stored templates did not match/,
      );
    }
  });

  it("rejects removed confirmation links, recipient metadata, scripts and third-party tracking", async () => {
    const payload = await loadTemplatePayload();
    const valid = payload.mailer_templates_confirmation_content;
    for (const html of [
      valid.replaceAll("{{ .ConfirmationURL }}", "https://attacker.test"),
      `${valid}{{ .Data.phone }}`,
      `${valid}<script>alert(1)</script>`,
      `${valid}<img src="https://tracking.test/pixel" />`,
      `${valid}<a href="https://tracking.test">go</a>`,
      `${valid}<p onclick="alert(1)">unsafe</p>`,
    ])
      expect(() => validateTemplate(html)).toThrow();
  });

  it("requires explicit supported command flags", async () => {
    await expect(run({ args: ["--apply", "--dry-run"] })).rejects.toThrow(
      "Usage:",
    );
    await expect(run({ args: ["--project=other"] })).rejects.toThrow("Usage:");
  });
});
