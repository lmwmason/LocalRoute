import { z } from "zod";
import {
  LEGAL_VERSION,
  legalConsentSchema,
  type LegalConsent,
} from "../../shared/legal";

export const SIGNUP_CONSENT_KEY = "localroute.signup-consent.v1";
export const SIGNUP_CONSENT_TTL_MS = 60 * 60 * 1000;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const draftSchema = z
  .object({
    email: z.email(),
    createdAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
    payload: legalConsentSchema.extend({ publicLocalArea: z.literal(false) }),
  })
  .strict();
const normalizeEmail = (email: string) => email.trim().toLowerCase();

function browserStorage(): DraftStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

// This short-lived draft is a UI convenience, never proof of identity or consent.
// Only the authenticated server endpoint can record consent and unlock features.
export function saveSignupConsent(
  input: {
    email: string;
    language: "ko" | "en";
    choices: {
      terms: boolean;
      privacy: boolean;
      supabaseTransfer: boolean;
      adult: boolean;
    };
  },
  storage = browserStorage(),
  now = Date.now(),
): boolean {
  try {
    if (!storage) return false;
    const draft = draftSchema.parse({
      email: normalizeEmail(input.email),
      createdAt: now,
      expiresAt: now + SIGNUP_CONSENT_TTL_MS,
      payload: {
        terms: input.choices.terms,
        privacy: input.choices.privacy,
        supabaseTransfer: input.choices.supabaseTransfer,
        adult: input.choices.adult,
        publicLocalArea: false,
        requestId: crypto.randomUUID(),
        version: LEGAL_VERSION,
        language: input.language,
      },
    });
    storage.setItem(SIGNUP_CONSENT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function readSignupConsent(
  email: string,
  storage = browserStorage(),
  now = Date.now(),
): LegalConsent | null {
  try {
    const raw = storage?.getItem(SIGNUP_CONSENT_KEY);
    if (!raw) return null;
    const draft = draftSchema.parse(JSON.parse(raw));
    if (
      draft.createdAt > now ||
      draft.expiresAt <= now ||
      draft.expiresAt !== draft.createdAt + SIGNUP_CONSENT_TTL_MS
    ) {
      storage?.removeItem(SIGNUP_CONSENT_KEY);
      return null;
    }
    return draft.email === normalizeEmail(email) ? draft.payload : null;
  } catch {
    return null;
  }
}

export function clearSignupConsent(
  email: string,
  requestId: string,
  storage = browserStorage(),
) {
  try {
    if (readSignupConsent(email, storage)?.requestId === requestId)
      storage?.removeItem(SIGNUP_CONSENT_KEY);
  } catch {
    // Blocked storage falls back to explicit consent rather than opening the gate.
  }
}
