// Browser fixture only: replaces the legal client without initializing Auth.
import { legalStatusSchema, type LegalConsent } from "../shared/legal";
export async function requestLegalConsent(payload?: LegalConsent) {
  const response = await fetch("/__consent_ui", {
    method: payload ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok)
    throw new Error("fixture-only-sensitive-error@example.invalid");
  return legalStatusSchema.parse(await response.json());
}
