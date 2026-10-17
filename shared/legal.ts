import { z } from "zod";

// A release identifies the immutable text of all four notices and consent labels.
// Never edit a published release in place; retain its source in Git history.
export const LEGAL_VERSION = "2026-10-17.1" as const;
export const legalDocuments = [
  "privacy",
  "terms",
  "transfers",
  "location",
] as const;
export type LegalDocument = (typeof legalDocuments)[number];
export const legalConsentSchema = z
  .object({
    requestId: z.uuid(),
    version: z.literal(LEGAL_VERSION),
    language: z.enum(["ko", "en"]),
    terms: z.literal(true),
    privacy: z.literal(true),
    supabaseTransfer: z.literal(true),
    adult: z.literal(true),
    publicLocalArea: z.boolean(),
  })
  .strict();
export type LegalConsent = z.infer<typeof legalConsentSchema>;
export const legalStatusSchema = z
  .object({
    current: z.boolean(),
    version: z.string().nullable(),
    recordedAt: z.string().min(1).nullable(),
    publicLocalArea: z.boolean(),
  })
  .refine(
    (value) =>
      !value.current ||
      (value.version === LEGAL_VERSION && value.recordedAt !== null),
    "Current consent requires this notice version and a server timestamp.",
  );
export type LegalStatus = z.infer<typeof legalStatusSchema>;
