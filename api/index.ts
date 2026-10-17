import { createApp } from "../server/app";
import { readConfig } from "../server/config";
import { SupabaseRepository } from "../server/repository";
import { isLocalRouteSupabase, isPublicSupabaseKey } from "../shared/config";

/** Runtime configuration comes from Vercel, never a bundled local .env file. */
export function createVercelApp(env: NodeJS.ProcessEnv = process.env) {
  for (const name of ["SUPABASE_URL", "VITE_SUPABASE_URL"] as const) {
    if (env[name] && !isLocalRouteSupabase(env[name]))
      throw new Error(`${name} must use the LocalRoute Supabase project.`);
  }
  for (const name of [
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
  ] as const) {
    if (env[name] && !isPublicSupabaseKey(env[name]))
      throw new Error(
        `${name} must contain a public LocalRoute publishable/anon key.`,
      );
  }
  const config = readConfig(env);
  const repository =
    config.live && config.database ? new SupabaseRepository(config) : undefined;
  return createApp(config, repository);
}

// Export the Express application directly so Vercel preserves its raw request
// stream (including photograph uploads). No port listener or static server here.
const app = createVercelApp();
export default app;
