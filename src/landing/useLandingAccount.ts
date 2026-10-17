import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";

export type LandingAccount = "checking" | "guest" | "member" | "unconfirmed";

/** Presentation state using the existing client's getSession -> getUser check.
 * Invalid cached identities are cleared locally, as they are in App.
 * No callback exchange, profile write or independent token storage.
 * App remains responsible for the authenticated application and recovery flow.
 */
export function useLandingAccount(): LandingAccount {
  const [account, setAccount] = useState<LandingAccount>(
    supabase ? "checking" : "guest",
  );
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true,
      revision = 0;
    async function verify(session: Session | null, current: number) {
      if (!active || current !== revision) return;
      if (!session) {
        setAccount("guest");
        return;
      }
      try {
        const { data, error } = await client.auth.getUser(session.access_token);
        if (!active || current !== revision) return;
        if (
          error ||
          !data.user ||
          data.user.is_anonymous ||
          data.user.id !== session.user.id
        ) {
          setAccount("guest");
          await client.auth.signOut({ scope: "local" });
          return;
        }
        setAccount(data.user.email_confirmed_at ? "member" : "unconfirmed");
      } catch {
        if (active && current === revision) setAccount("guest");
      }
    }
    const initial = ++revision;
    void client.auth
      .getSession()
      .then(({ data }) => verify(data.session, initial))
      .catch(() => {
        if (active && initial === revision) setAccount("guest");
      });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      const current = ++revision;
      setAccount(session ? "checking" : "guest");
      // Supabase's Auth callback holds a lock: defer the server read until after it.
      if (session)
        setTimeout(() => {
          if (active && current === revision) void verify(session, current);
        }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return account;
}
