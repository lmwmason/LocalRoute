import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import {
  operatorPlaceBatchSchema,
  operatorPlaceImportResultSchema,
  type OperatorPlaceEntry,
  type OperatorPlaceImportResult,
} from "../shared/catalog-import";
import { isLocalRouteSupabase } from "../shared/config";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LOCALROUTE_URL = "https://pjdawapasozsrpnrtsfx.supabase.co";
function isServerKey(value: string) {
  if (/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(value)) return true;
  try {
    const parts = value.split(".");
    if (parts.length !== 3 || !parts[2]) return false;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return (
      payload.role === "service_role" && payload.ref === "pjdawapasozsrpnrtsfx"
    );
  } catch {
    return false;
  }
}
type ImportRpc = (
  entries: OperatorPlaceEntry[],
) => Promise<{ data: OperatorPlaceImportResult[] | null; error: unknown }>;

export async function importVerifiedCatalog(
  input: unknown,
  env: Record<string, string | undefined>,
  options: { apply?: boolean; rpc?: ImportRpc } = {},
) {
  for (const name of ["SUPABASE_URL", "VITE_SUPABASE_URL"] as const) {
    if (env[name] && !isLocalRouteSupabase(env[name]))
      throw new Error("Only the LocalRoute Supabase project is permitted.");
  }
  const entries = operatorPlaceBatchSchema.parse(input);
  if (!options.apply)
    return {
      applied: false,
      count: entries.length,
      results: [] as OperatorPlaceImportResult[],
    };
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !isLocalRouteSupabase(url) || !secret || !isServerKey(secret))
    throw new Error(
      "Root .env needs the LocalRoute URL and a server secret/service-role key before --apply.",
    );
  let rpc = options.rpc;
  if (!rpc) {
    const client = createClient(LOCALROUTE_URL, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    rpc = async (batch) => {
      const result = await client
        .rpc("import_operator_places", { p_entries: batch })
        .abortSignal(AbortSignal.timeout(20_000));
      return {
        data: result.data as OperatorPlaceImportResult[] | null,
        error: result.error,
      };
    };
  }
  let response;
  try {
    response = await rpc(entries);
  } catch {
    throw new Error(
      "Catalog import could not be verified. No automatic retry was made; inspect the source URLs before repeating the same batch.",
    );
  }
  if (
    response.error ||
    !Array.isArray(response.data) ||
    response.data.length !== entries.length ||
    response.data.some(
      (entry, index) =>
        !operatorPlaceImportResultSchema.safeParse(entry).success ||
        entry.sourceUrl !== entries[index].sourceUrl,
    )
  )
    throw new Error(
      "Catalog import failed or returned an unexpected result. Check migration setup and source conflicts; no provider response or secret was logged.",
    );
  return { applied: true, count: entries.length, results: response.data };
}

export async function runCatalogImport(args: string[]) {
  if (
    args.some(
      (arg) => arg.startsWith("--") && !["--apply", "--dry-run"].includes(arg),
    ) ||
    (args.includes("--apply") && args.includes("--dry-run")) ||
    args.filter((arg) => !arg.startsWith("--")).length > 1
  )
    throw new Error(
      "Usage: tsx scripts/import-verified-places.ts [JSON-file] [--dry-run|--apply]",
    );
  let env: Record<string, string | undefined> = {};
  try {
    env = parseEnv(await readFile(resolve(ROOT, ".env"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("Could not read root .env.", { cause: error });
  }
  const file =
    args.find((arg) => !arg.startsWith("--")) ||
    "scripts/data/operator-places.json";
  let input: unknown;
  try {
    input = JSON.parse(await readFile(resolve(ROOT, file), "utf8"));
  } catch {
    throw new Error("Could not read a valid catalog JSON file.");
  }
  const result = await importVerifiedCatalog(input, env, {
    apply: args.includes("--apply"),
  });
  console.log(
    result.applied
      ? `Imported ${result.count} official-source places into LocalRoute. No endorsements, photos, users or LP were created.`
      : `DRY RUN: ${result.count} validated official-source places. No database request or provider search made.`,
  );
  return result;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runCatalogImport(process.argv.slice(2));
  } catch (error) {
    // Zod error details may reproduce input; show only field paths.
    const parsed = error as { issues?: { path: PropertyKey[] }[] };
    console.error(
      parsed.issues
        ? `Catalog validation failed at ${parsed.issues.map((issue) => issue.path.join(".")).join(", ")}.`
        : error instanceof Error
          ? error.message
          : "Catalog import failed.",
    );
    process.exitCode = 1;
  }
}
