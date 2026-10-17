// Test-only Auth implementation. It never sends a network request or email.
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
const scenario =
  new URLSearchParams(location.search).get("fixture") ?? "success";
const user = {
  id: "90000000-0000-4000-8000-000000000001",
  email: "private-callback@example.invalid",
  email_confirmed_at: "2020-01-01T00:00:00Z",
  created_at: "2020-01-01T00:00:00Z",
};
const nextUser = {
  ...user,
  id: "90000000-0000-4000-8000-000000000002",
  email: "next-account@example.invalid",
};
const first = { access_token: "private-token-first", user } as Session;
const second = {
  access_token: "private-token-second",
  user: nextUser,
} as Session;
let session: Session | null =
  scenario === "cached_deleted" || scenario === "cached_race" ? first : null;
const listeners = new Set<
  (event: AuthChangeEvent, session: Session | null) => void
>();
const counts = {
  exchange: 0,
  verification: 0,
  signOut: [] as unknown[],
  mail: 0,
};
const emit = (event: AuthChangeEvent, next: Session | null) => {
  session = next;
  for (const listener of listeners) listener(event, next);
};
let release: (() => void) | undefined;
let releaseOldUser: (() => void) | undefined;
export const control = {
  counts,
  release: () => release?.(),
  releaseOldUser: () => releaseOldUser?.(),
  switchAccount: () => emit("SIGNED_IN", second),
  signOut: () => emit("SIGNED_OUT", null),
};
Reflect.set(window, "__pkceFixture", control);
export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async (token: string) => {
        counts.verification++;
        if (scenario === "cached_deleted" || scenario === "callback_deleted")
          return { data: { user: null }, error: { code: "user_not_found" } };
        if (scenario === "cached_race" && token === first.access_token)
          return new Promise((resolve) => {
            releaseOldUser = () => resolve({ data: { user }, error: null });
          });
        return {
          data: { user: token === second.access_token ? nextUser : user },
          error: null,
        };
      },
      exchangeCodeForSession: async () => {
        counts.exchange++;
        if (scenario === "missing")
          return {
            data: { session: null },
            error: {
              code: "pkce_code_verifier_not_found",
              message:
                "private-provider-message private-callback@example.invalid",
            },
          };
        if (scenario === "network")
          throw new TypeError("private-provider-message private-token-first");
        if (scenario === "expired")
          return {
            data: { session: null },
            error: { code: "otp_expired", message: "private-provider-message" },
          };
        if (scenario === "unknown")
          return {
            data: { session: null },
            error: { code: "unexpected", message: "private-provider-message" },
          };
        if (scenario === "race" || scenario === "pending")
          return new Promise((resolve) => {
            release = () => {
              if (scenario === "pending") emit("SIGNED_IN", first);
              resolve({ data: { session: first }, error: null });
            };
          });
        emit("SIGNED_IN", first);
        return { data: { session: first }, error: null };
      },
      onAuthStateChange: (
        listener: (event: AuthChangeEvent, value: Session | null) => void,
      ) => {
        listeners.add(listener);
        return {
          data: {
            subscription: { unsubscribe: () => listeners.delete(listener) },
          },
        };
      },
      signOut: async (options: unknown) => {
        counts.signOut.push(options);
        emit("SIGNED_OUT", null);
        return { error: null };
      },
      signInWithOtp: async () => {
        counts.mail++;
        return { data: { session: null }, error: null };
      },
    },
  };
}
