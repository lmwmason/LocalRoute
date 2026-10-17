import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { isPublicSupabaseKey, isLocalRouteSupabase } from "./shared/config";

export default defineConfig({
  plugins: [
    {
      name: "localroute-public-config-guard",
      enforce: "pre",
      config(config, { mode }) {
        const env = {
          ...(config.envDir === false
            ? {}
            : loadEnv(mode, config.envDir || process.cwd(), "VITE_")),
          ...process.env,
        };
        for (const name of [
          "VITE_SUPABASE_PUBLISHABLE_KEY",
          "VITE_SUPABASE_ANON_KEY",
        ] as const) {
          if (env[name] && !isPublicSupabaseKey(env[name]))
            throw new Error(
              `${name}: only a LocalRoute publishable or anon key is permitted. Never use a secret/service-role key.`,
            );
        }
        if (
          env.VITE_SUPABASE_URL &&
          !isLocalRouteSupabase(env.VITE_SUPABASE_URL)
        )
          throw new Error("VITE_SUPABASE_URL must use the LocalRoute project.");
      },
    },
    react(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
  build: { sourcemap: false },
});
