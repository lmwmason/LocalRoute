import { createApp } from "./app";
import { readConfig } from "./config";
import { SupabaseRepository } from "./repository";
import { isLocalRouteSupabase, isPublicSupabaseKey } from "../shared/config";

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

// The build bundles relative TypeScript imports into a Node-compatible CJS
// artifact. Third-party dependencies remain normal server dependencies.
export default createVercelApp();
