// Local-only SDK fixture. Never performs Auth requests, sends mail or stores keys.
const scenario =
  new URLSearchParams(location.search).get("landingAuth") || "guest";
const user = {
  id: "90000000-0000-4000-8000-000000000001",
  email: "private-landing@example.invalid",
  email_confirmed_at:
    scenario === "unconfirmed" ? undefined : "2020-01-01T00:00:00Z",
  created_at: "2020-01-01T00:00:00Z",
};
const cached = { user, access_token: "private-landing-token" };
let session: typeof cached | null = [
  "member",
  "pending",
  "deleted",
  "unconfirmed",
].includes(scenario)
  ? cached
  : null;
const listeners = new Set<(event: string, next: typeof session) => void>();
let release: (() => void) | undefined;
let verifications = 0;
Reflect.set(window, "__landingAuth", {
  release: () => release?.(),
  signOut: () => {
    session = null;
    listeners.forEach((listener) => listener("SIGNED_OUT", null));
  },
  get verifications() {
    return verifications;
  },
});
export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => {
        verifications++;
        if (scenario === "pending")
          return new Promise((resolve) => {
            release = () => resolve({ data: { user }, error: null });
          });
        return {
          data: { user: session && scenario !== "deleted" ? user : null },
          error: null,
        };
      },
      onAuthStateChange: (
        listener: (event: string, next: typeof session) => void,
      ) => {
        listeners.add(listener);
        return {
          data: {
            subscription: { unsubscribe: () => listeners.delete(listener) },
          },
        };
      },
      exchangeCodeForSession: async () => ({
        data: { session: null },
        error: { code: "otp_expired" },
      }),
      signOut: async () => ({ error: null }),
    },
  };
}
