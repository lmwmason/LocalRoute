import { BookingApiError } from "./api";

type TokenSession = { access_token: string; expires_at?: number };
type AuthSource = {
  getSession(): Promise<{ data: { session: TokenSession | null }; error?: unknown }>;
  onAuthStateChange(callback: (event: string, session: TokenSession | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
};

// Transport credentials only: the server still verifies email, role and ownership.
// Auth callbacks synchronously update memory and never re-enter the Auth SDK.
export function createBookingTokenSource(auth: AuthSource, timeoutMs = 5000) {
  let current: TokenSession | null | undefined;
  let revision = 0;
  let pending: Promise<string | undefined> | undefined;
  const listeners = new Set<() => void>();
  const credential = (session: TokenSession | null): TokenSession | null =>
    session ? { access_token: session.access_token, expires_at: session.expires_at } : null;
  const fresh = (session: TokenSession | null | undefined) =>
    Boolean(session?.access_token &&
      (session.expires_at === undefined || session.expires_at * 1000 > Date.now() + 1000));
  const subscription = auth.onAuthStateChange((_event, session) => {
    current = credential(session);
    revision++;
    for (const notify of listeners) notify();
  }).data.subscription;

  async function token(): Promise<string | undefined> {
    if (current === null) return undefined;
    if (fresh(current)) return current!.access_token;
    if (pending) return pending;
    const started = revision;
    const operation = new Promise<string | undefined>((resolve, reject) => {
      let finished = false;
      const finish = (error = false) => {
        if (finished) return;
        if (!error && current !== null && !fresh(current)) return;
        finished = true;
        clearTimeout(timer);
        listeners.delete(notify);
        if (error) reject(new BookingApiError(503, "booking.network"));
        else resolve(current?.access_token);
      };
      const notify = () => finish();
      const timer = setTimeout(() => finish(true), timeoutMs);
      listeners.add(notify);
      // INITIAL_SESSION can resolve the read even if getSession is still waiting.
      void Promise.resolve().then(() => auth.getSession()).then(({ data, error }) => {
        if (finished) return;
        if (error) { finish(true); return; }
        if (revision === started) current = credential(data.session);
        if (current === null || fresh(current)) finish();
        else finish(true); // Never send an expired credential as a fallback.
      }).catch(() => finish(true));
    });
    pending = operation;
    try { return await operation; }
    finally { if (pending === operation) pending = undefined; }
  }
  return {
    token,
    dispose() {
      subscription.unsubscribe();
      current = null;
      revision++;
      for (const notify of listeners) notify();
    },
  };
}
