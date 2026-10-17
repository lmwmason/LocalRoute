import { legalStatusSchema, type LegalConsent } from "../../shared/legal";
import { supabase } from "../supabase";

export async function requestLegalConsent(payload?: LegalConsent) {
  const session = (await supabase?.auth.getSession())?.data.session;
  if (!session) throw new Error("LEGAL_VERIFIED_EMAIL_REQUIRED");
  const response = await fetch("/api/me/legal-consents", {
    method: payload ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("LEGAL_UNAVAILABLE");
  return legalStatusSchema.parse(await response.json());
}
