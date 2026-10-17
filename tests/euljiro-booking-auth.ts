// Test-only Auth replacement; no network calls, sessions or real personal data.
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
const scenario = new URLSearchParams(location.search).get("auth");
const user = {
  id: "90000000-0000-4000-8000-000000000001",
  email_confirmed_at: scenario === "email" ? undefined : "2026-10-17T00:00:00Z",
  is_anonymous: scenario === "anonymous",
};
let current =
  scenario === "guest"
    ? null
    : ({ access_token: "fixture-only", user } as Session);
let listener:
  ((event: AuthChangeEvent, session: Session | null) => void) | undefined;
let release: (() => void) | undefined;
const control = {
  calls: 0,
  signOut() {
    current = null;
    listener?.("SIGNED_OUT", null);
  },
  release() {
    release?.();
  },
};
Reflect.set(window, "__bookingAuth", control);
export const supabase =
  scenario === "unconfigured"
    ? null
    : {
        auth: {
          async getSession() {
            control.calls++;
            return { data: { session: current }, error: null };
          },
          async getUser() {
            control.calls++;
            const verifiedUser = current?.user ?? null;
            if (scenario === "race")
              await new Promise<void>((resolve) => {
                release = resolve;
              });
            return {
              data: { user: verifiedUser },
              error: scenario === "error" ? new Error("fixture failure") : null,
            };
          },
          onAuthStateChange(callback: typeof listener) {
            listener = callback;
            return {
              data: {
                subscription: {
                  unsubscribe() {
                    listener = undefined;
                  },
                },
              },
            };
          },
        },
      };
