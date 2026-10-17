import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import sharp from "sharp";
import { z } from "zod";
import { isLocalRouteSupabase } from "../shared/config";
import {
  sourcePhotoImportSchema,
  type SourcePhotoImport,
} from "../shared/source-photos";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const fields = [
  "placeId",
  "placeSourceUrl",
  "assetPath",
  "sourcePageUrl",
  "author",
  "license",
  "licenseUrl",
  "title",
  "caption",
  "capturedAt",
  "changes",
  "priorChanges",
  "verifiedAt",
  "sha256",
] as const;
export function parseSourcePhotos(input: unknown) {
  const raw = Array.isArray(input)
    ? input
    : input && typeof input === "object"
      ? Reflect.get(input, "photos")
      : null;
  if (!Array.isArray(raw))
    throw new Error("Expected an approved photos array.");
  return z
    .array(sourcePhotoImportSchema)
    .min(1)
    .max(50)
    .parse(
      raw.map((value) => {
        if (!value || typeof value !== "object") return value;
        const row = Object.fromEntries(
          fields
            .filter((key) => Reflect.has(value, key))
            .map((key) => [key, Reflect.get(value, key)]),
        );
        return {
          ...row,
          caption: row.caption ?? Reflect.get(value, "alt"),
          capturedAt: row.capturedAt ?? null,
          priorChanges: row.priorChanges ?? null,
        };
      }),
    );
}
type Rpc = (
  entries: SourcePhotoImport[],
) => Promise<{ data: unknown; error: unknown }>;
function isServerKey(secret: string) {
  if (/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(secret)) return true;
  try {
    const payload = JSON.parse(
      Buffer.from(secret.split(".")[1], "base64url").toString("utf8"),
    );
    return (
      payload.role === "service_role" && payload.ref === "pjdawapasozsrpnrtsfx"
    );
  } catch {
    return false;
  }
}
export async function importPlaceSourcePhotos(
  input: unknown,
  env: NodeJS.ProcessEnv,
  options: { apply?: boolean; rootDir?: string; rpc?: Rpc } = {},
) {
  for (const name of ["SUPABASE_URL", "VITE_SUPABASE_URL"] as const)
    if (env[name] && !isLocalRouteSupabase(env[name]))
      throw new Error("Only the LocalRoute Supabase project is permitted.");
  const entries = parseSourcePhotos(input);
  const root = options.rootDir || ROOT;
  const directory = await realpath(resolve(root, "public/place-source-photos"));
  for (const entry of entries) {
    const file = await realpath(resolve(root, `public${entry.assetPath}`));
    if (!file.startsWith(directory + sep))
      throw new Error(
        "Photo file must remain inside the public source-photo directory.",
      );
    const bytes = await readFile(file);
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
      throw new Error("Photo bytes differ from the reviewed manifest.");
    const metadata = await sharp(bytes, {
      limitInputPixels: 20_000_000,
    }).metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format || "") ||
      !metadata.width ||
      !metadata.height
    )
      throw new Error("Reviewed asset is not a supported actual photograph.");
  }
  if (!options.apply)
    return { applied: false, count: entries.length, results: [] };
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !isLocalRouteSupabase(url) || !secret || !isServerKey(secret))
    throw new Error(
      "A LocalRoute server secret/service-role key is required for --apply.",
    );
  let rpc = options.rpc;
  if (!rpc) {
    const client = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    rpc = async (batch) =>
      client
        .rpc("import_place_source_photos", { p_entries: batch })
        .abortSignal(AbortSignal.timeout(20_000));
  }
  let result;
  try {
    result = await rpc(entries);
  } catch {
    throw new Error(
      "Photo import could not be verified. No automatic retry was made.",
    );
  }
  if (
    result.error ||
    !Array.isArray(result.data) ||
    result.data.length !== entries.length
  )
    throw new Error(
      "Photo import failed; check source identity and migration setup. No provider details were logged.",
    );
  return { applied: true, count: entries.length, results: result.data };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (
      args.some(
        (arg) =>
          arg.startsWith("--") && !["--apply", "--dry-run"].includes(arg),
      ) ||
      (args.includes("--apply") && args.includes("--dry-run")) ||
      args.filter((arg) => !arg.startsWith("--")).length > 1
    )
      throw new Error(
        "Usage: tsx scripts/import-place-source-photos.ts [manifest.json] [--dry-run|--apply]",
      );
    let env: NodeJS.ProcessEnv = {};
    try {
      env = parseEnv(await readFile(resolve(ROOT, ".env"), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("Could not read root .env.", { cause: error });
    }
    const input = JSON.parse(
      await readFile(
        resolve(
          ROOT,
          args.find((arg) => !arg.startsWith("--")) ||
            "scripts/data/verified-place-photos.json",
        ),
        "utf8",
      ),
    );
    const result = await importPlaceSourcePhotos(input, env, {
      apply: args.includes("--apply"),
    });
    console.log(
      `${result.applied ? "IMPORTED" : "DRY RUN"}: ${result.count} reviewed actual photos; contributor photos, visits, endorsements and LP unchanged.`,
    );
  } catch (error) {
    console.error(
      error instanceof z.ZodError
        ? "Photo manifest validation failed."
        : error instanceof Error
          ? error.message
          : "Photo import failed.",
    );
    process.exitCode = 1;
  }
}
