import { createClient } from "@supabase/supabase-js";
import { config } from "./config";
import { isLocalRouteSupabase, isPublicSupabaseKey } from "../shared/config";

function initialize() {
  if (
    !isLocalRouteSupabase(config.supabaseUrl) ||
    !config.supabaseKey ||
    !isPublicSupabaseKey(config.supabaseKey)
  )
    return null;
  try {
    return createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        flowType: "pkce",
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } catch {
    return null;
  }
}
export const supabase = initialize();
let callback:
  | ReturnType<NonNullable<typeof supabase>["auth"]["exchangeCodeForSession"]>
  | undefined;
export function exchangeAuthCode(code: string) {
  if (!supabase) return undefined;
  callback ||= supabase.auth.exchangeCodeForSession(code);
  return callback;
}
