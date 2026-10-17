import {
  legalStatusSchema,
  type LegalConsent,
  type LegalStatus,
} from "../../shared/legal";
import { supabase } from "../supabase";
import { clearSignupConsent, readSignupConsent } from "./signup-consent";

const pendingChecks = new Map<string, Promise<LegalStatus>>();

export async function requestLegalConsent(payload?: LegalConsent) {
  const session = (await supabase?.auth.getSession())?.data.session;
  if (!session) throw new Error("LEGAL_VERIFIED_EMAIL_REQUIRED");
  const accessToken = session.access_token;
  async function request(value?: LegalConsent) {
    const response = await fetch("/api/me/legal-consents", {
      method: value ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      ...(value ? { body: JSON.stringify(value) } : {}),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("LEGAL_UNAVAILABLE");
    return legalStatusSchema.parse(await response.json());
  }
  const email = session.user.email;
  const confirmed = session.user.email_confirmed_at;
  async function checkAndRecord() {
    const status = await request();
    if (!email || !confirmed) return status;
    const draft = readSignupConsent(email);
    if (!draft) return status;
    if (status.current) {
      clearSignupConsent(email, draft.requestId);
      return status;
    }
    // The GET above must authorize the verified user before any automatic POST.
    const recorded = await request(draft);
    if (!recorded.current) throw new Error("LEGAL_UNAVAILABLE");
    clearSignupConsent(email, draft.requestId);
    return recorded;
  }
  if (payload) return request(payload);
  // Nested gates share the complete check/record operation, not stale GET results.
  // Account or token changes create a different operation; server auth stays final.
  const key = `${session.user.id}:${accessToken}`;
  const existing = pendingChecks.get(key);
  if (existing) return existing;
  const operation = checkAndRecord();
  pendingChecks.set(key, operation);
  try {
    return await operation;
  } finally {
    if (pendingChecks.get(key) === operation) pendingChecks.delete(key);
  }
}
