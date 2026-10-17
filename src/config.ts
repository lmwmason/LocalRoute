const env = import.meta.env;
export const config = {
  demo: env.VITE_DATA_MODE !== "live",
  mapStyle:
    env.VITE_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty",
  supabaseUrl: env.VITE_SUPABASE_URL || "",
  supabaseKey:
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || "",
};
