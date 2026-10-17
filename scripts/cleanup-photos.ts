import { createClient } from "@supabase/supabase-js";
import { readConfig } from "../server/config";
process.loadEnvFile(".env");
const config = readConfig(process.env);
if (!config.database)
  throw new Error(
    "Only the configured LocalRoute Supabase project may be used.",
  );
const client = createClient(config.url, config.secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await client.rpc("expire_place_photos", {
  p_limit: 100,
});
if (error) throw new Error("Photo cleanup could not claim expired records.");
let removed = 0;
for (const photo of data as { id: string; path: string }[]) {
  const result = await client.storage.from("place-photos").remove([photo.path]);
  if (result.error) continue; // The next run retries the expired record.
  const saved = await client
    .from("place_photos")
    .update({ object_deleted_at: new Date().toISOString() })
    .eq("id", photo.id)
    .eq("state", "expired");
  if (!saved.error) removed++;
}
console.log(`Expired photographs removed: ${removed}.`);
