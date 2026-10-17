import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

export const PROJECT_REF = "pjdawapasozsrpnrtsfx";
export const AUTH_CONFIG_ENDPOINT = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SUBJECTS = Object.freeze({
  mailer_subjects_confirmation: "[LocalRoute] 이메일 확인 · Confirm your email",
  mailer_subjects_magic_link: "[LocalRoute] 로그인 링크 · Your sign-in link",
});

export function validateTemplate(html) {
  if (
    typeof html !== "string" ||
    html.length > 30_000 ||
    !html.includes('href="{{ .ConfirmationURL }}"') ||
    !html.includes('lang="en"') ||
    !html.includes("LocalRoute") ||
    /<script\b|<iframe\b|<form\b|<img\b|\bon\w+\s*=|javascript:/i.test(html)
  ) {
    throw new Error("Unsafe or incomplete LocalRoute email template.");
  }
  // The recipient's metadata, location, phone and email are not needed here.
  for (const placeholder of html.match(/{{[\s\S]*?}}/g) ?? []) {
    if (placeholder !== "{{ .ConfirmationURL }}") {
      throw new Error("Unsupported email template placeholder.");
    }
  }
  for (const match of html.matchAll(/href="([^"]*)"/g)) {
    if (
      !["{{ .ConfirmationURL }}", "mailto:lmw.hpc@gmail.com"].includes(match[1])
    ) {
      throw new Error("Unexpected email template link.");
    }
  }
  return html;
}

export async function loadTemplatePayload() {
  const [confirmation, magicLink] = await Promise.all([
    readFile(
      new URL("../supabase/templates/confirmation.html", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../supabase/templates/magic-link.html", import.meta.url),
      "utf8",
    ),
  ]);
  return {
    ...SUBJECTS,
    mailer_templates_confirmation_content: validateTemplate(confirmation),
    mailer_templates_magic_link_content: validateTemplate(magicLink),
  };
}

function assertProject(env) {
  for (const name of ["VITE_SUPABASE_URL", "SUPABASE_URL"]) {
    const value = env[name]?.trim();
    if (
      value &&
      value !== `https://${PROJECT_REF}.supabase.co` &&
      value !== `https://${PROJECT_REF}.supabase.co/`
    ) {
      throw new Error("Only the LocalRoute Supabase project is permitted.");
    }
  }
  if (env.SUPABASE_PROJECT_REF && env.SUPABASE_PROJECT_REF !== PROJECT_REF) {
    throw new Error("Only the LocalRoute Supabase project is permitted.");
  }
}

export async function run({
  args = [],
  env = {},
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  if (
    args.length > 1 ||
    args.some((arg) => !["--apply", "--dry-run"].includes(arg))
  ) {
    throw new Error(
      "Usage: node scripts/apply-auth-email-templates.mjs [--dry-run|--apply]",
    );
  }
  assertProject(env);
  const payload = await loadTemplatePayload();
  if (!args.includes("--apply")) {
    log(
      `DRY RUN: validated 2 bilingual email templates for LocalRoute (${PROJECT_REF}). No remote request or email sent.`,
    );
    return { applied: false, fields: Object.keys(payload) };
  }
  const token = env.SUPABASE_ACCESS_TOKEN?.trim();
  if (
    !token ||
    /\s/.test(token) ||
    /^(sb_secret_|sb_publishable_|eyJ)/.test(token)
  ) {
    throw new Error(
      "Add a Supabase Management API access token as SUPABASE_ACCESS_TOKEN in root .env. Service-role and publishable keys cannot configure email templates.",
    );
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  let patchResponse;
  try {
    patchResponse = await fetchImpl(AUTH_CONFIG_ENDPOINT, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
  } catch {
    throw new Error(
      "Template update could not be verified after a network failure. No email was sent; inspect dashboard templates before retrying.",
    );
  }
  if (!patchResponse.ok) {
    throw new Error(
      `Template update rejected (HTTP ${patchResponse.status}). Check access-token permissions; response details were withheld to protect configuration secrets.`,
    );
  }
  let current;
  try {
    const response = await fetchImpl(AUTH_CONFIG_ENDPOINT, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Read-back failed");
    current = await response.json();
  } catch {
    throw new Error(
      "Update was accepted but read-back verification failed. Inspect dashboard templates before retrying.",
    );
  }
  if (
    !current ||
    Object.entries(payload).some(([key, value]) => current[key] !== value)
  ) {
    throw new Error(
      "Update was accepted but stored templates did not match. Inspect dashboard templates; no email was sent.",
    );
  }
  log(
    `Applied and read-back verified 2 LocalRoute email templates (${PROJECT_REF}). No email sent; SMTP settings unchanged.`,
  );
  return { applied: true, fields: Object.keys(payload) };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    // Root .env is the only configuration source; never print its contents.
    let env = {};
    try {
      env = parseEnv(await readFile(resolve(ROOT, ".env"), "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw new Error("Could not read root .env.", { cause: error });
      }
    }
    await run({ args: process.argv.slice(2), env });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Email template setup failed.",
    );
    process.exitCode = 1;
  }
}
