import { createClient, type Session } from "@supabase/supabase-js";
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
export type AuthRecoveryReason =
  "expired" | "verifier" | "network" | "exchange" | "unavailable";
type AuthCodeResult = {
  data: { session: Session | null };
  error: { recoveryReason: AuthRecoveryReason } | null;
};
const callbackKeys = [
  "code",
  "error",
  "error_code",
  "error_description",
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "token_type",
  "expires_in",
  "expires_at",
  "sb_flow_id",
];
export function authRecoveryReason(error: unknown): AuthRecoveryReason {
  // Deliberately never inspect or return provider messages/descriptions.
  const value =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const code = typeof value.code === "string" ? value.code : "";
  if (
    [
      "otp_expired",
      "flow_state_expired",
      "flow_state_not_found",
      "invite_not_found",
    ].includes(code)
  )
    return "expired";
  if (
    value.code === "pkce_code_verifier_not_found" ||
    value.code === "bad_code_verifier" ||
    value.name === "AuthPKCECodeVerifierMissingError"
  )
    return "verifier";
  if (
    value.name === "AuthRetryableFetchError" ||
    value.name === "TypeError" ||
    value.name === "AbortError" ||
    value.code === "request_timeout"
  )
    return "network";
  return "exchange";
}
export function readAuthCallback(href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const present = callbackKeys.some(
    (key) => url.searchParams.has(key) || hash.has(key),
  );
  const code = url.searchParams.get("code") || hash.get("code");
  const hasError = ["error", "error_code", "error_description"].some(
    (key) => url.searchParams.has(key) || hash.has(key),
  );
  const errorCode =
    url.searchParams.get("error_code") ||
    hash.get("error_code") ||
    url.searchParams.get("error") ||
    hash.get("error");
  const reason = hasError ? authRecoveryReason({ code: errorCode }) : null;
  const cleanupKeys = [...callbackKeys, "email", "token", "token_hash", "type"];
  if (present) for (const key of cleanupKeys) url.searchParams.delete(key);
  if (present && cleanupKeys.some((key) => hash.has(key))) {
    for (const key of cleanupKeys) hash.delete(key);
    url.hash = hash.toString();
  }
  return {
    present,
    code,
    reason,
    cleanPath: url.pathname + url.search + url.hash,
  };
}
let callback: { code: string; promise: Promise<AuthCodeResult> } | undefined;
export function exchangeAuthCode(
  code?: string,
): Promise<AuthCodeResult> | undefined {
  const input = readAuthCallback(window.location.href);
  if (input.present)
    window.history.replaceState(window.history.state, "", input.cleanPath);
  const failure = (recoveryReason: AuthRecoveryReason): AuthCodeResult => ({
    data: { session: null },
    error: { recoveryReason },
  });
  if (input.reason) return Promise.resolve(failure(input.reason));
  const authCode = code || input.code;
  if (!authCode)
    return input.present ? Promise.resolve(failure("exchange")) : undefined;
  if (!supabase) return Promise.resolve(failure("unavailable"));
  if (callback?.code === authCode) return callback.promise;
  const client = supabase;
  const promise = Promise.resolve().then(async (): Promise<AuthCodeResult> => {
    try {
      const { data, error } =
        await client.auth.exchangeCodeForSession(authCode);
      return error
        ? failure(authRecoveryReason(error))
        : data.session
          ? { data: { session: data.session }, error: null }
          : failure("exchange");
    } catch (error) {
      return failure(authRecoveryReason(error));
    }
  });
  // Deduplicate StrictMode effects, but never replay the first result for a new link.
  callback = { code: authCode, promise };
  return promise;
}
