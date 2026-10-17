import { z } from "zod";

export const assistanceLanguageSchema = z.enum(["ko", "en"]);
const text = z.string().trim().min(1).max(240);
const price = z.number().finite().nonnegative().max(1_000_000_000).nullable();
export const menuItemSchema = z.strictObject({
  name: text,
  price,
  // Preserve the actual printed currency symbol/code; never infer KRW from location.
  currency: z.string().trim().min(1).max(12).nullable(),
  priceText: z.string().trim().min(1).max(40).nullable(),
  visibleText: z.string().trim().min(1).max(400),
  confidence: z.enum(["clear", "uncertain"]),
  uncertainty: z
    .array(
      z.enum([
        "partial_name",
        "price_unreadable",
        "currency_unreadable",
        "partial_image",
      ]),
    )
    .max(4),
});
export const menuExtractionSchema = z.strictObject({
  items: z.array(menuItemSchema).max(60),
  unreadable_regions: z
    .array(z.enum(["top", "middle", "bottom", "whole"]))
    .max(4),
  notes: z
    .array(
      z.enum([
        "blur",
        "glare",
        "partial_image",
        "no_menu_found",
        "instruction_like_text",
      ]),
    )
    .max(5),
});
export type MenuExtraction = z.infer<typeof menuExtractionSchema>;
export const confirmedMenuSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        name: text,
        price,
        currency: z.string().trim().min(1).max(12).nullable(),
      }),
    )
    .max(60),
  confirmed: z.literal(true),
  source: z.literal("user_confirmed_draft"),
});
export type ConfirmedMenu = z.infer<typeof confirmedMenuSchema>;

export const redactionSchema = z
  .strictObject({
    left: z.number().min(0).max(1),
    top: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine((r) => r.left + r.width <= 1 && r.top + r.height <= 1);
export const menuPhotoOptionsSchema = z.strictObject({
  language: assistanceLanguageSchema,
  privacyConfirmed: z.literal(true),
  redactions: z.array(redactionSchema).max(20).default([]),
});
export type MenuPhotoOptions = z.input<typeof menuPhotoOptionsSchema>;
export const assessmentRequestSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum([
    "submission",
    "endorsement",
    "place",
    "report",
    "correction",
    "photo",
  ]),
  language: assistanceLanguageSchema,
});
export type AssessmentRequest = z.infer<typeof assessmentRequestSchema>;
export const contributionAssessmentSchema = z.strictObject({
  recommendedAction: z.enum(["human_review", "request_clarification"]),
  signals: z
    .array(
      z.strictObject({
        category: z.enum([
          "instruction_like_text",
          "content_concern",
          "factual_claim_needs_check",
          "insufficient_context",
        ]),
        evidence: z
          .array(
            z.strictObject({ ref: z.enum(["title", "body"]), quote: text }),
          )
          .min(1)
          .max(4),
      }),
    )
    .max(8),
  uncertainty: z
    .array(
      z.enum([
        "insufficient_context",
        "cannot_verify_visit",
        "cannot_verify_authenticity",
        "not_fraud_probability",
      ]),
    )
    .min(1)
    .max(4),
});
export type ContributionAssessment = z.infer<
  typeof contributionAssessmentSchema
>;
export type AssistanceFailure =
  | "disabled"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "invalid_photo"
  | "photo_too_large"
  | "rate_limited"
  | "busy"
  | "timeout"
  | "unavailable"
  | "invalid_output";
export type AssistanceMetadata = {
  model: string;
  promptVersion: "menu-visible-v1" | "review-evidence-v1";
  completedAt: string;
  source: "gemini" | "deterministic";
  requiresHumanReview: true;
};
export type AssistanceResult<T> =
  | { status: "ready"; data: T; metadata: AssistanceMetadata }
  | { status: "failed"; code: AssistanceFailure; retryAfterSeconds?: number };
export type MenuAssistanceResult = AssistanceResult<MenuExtraction>;
export type ReviewAssistanceResult = AssistanceResult<ContributionAssessment>;

const metadataSchema = z.strictObject({
  model: z.string().max(100),
  promptVersion: z.enum(["menu-visible-v1", "review-evidence-v1"]),
  completedAt: z.iso.datetime(),
  source: z.enum(["gemini", "deterministic"]),
  requiresHumanReview: z.literal(true),
});
const failureSchema = z.strictObject({
  status: z.literal("failed"),
  code: z.enum([
    "disabled",
    "unauthenticated",
    "forbidden",
    "not_found",
    "invalid_input",
    "invalid_photo",
    "photo_too_large",
    "rate_limited",
    "busy",
    "timeout",
    "unavailable",
    "invalid_output",
  ]),
  retryAfterSeconds: z.number().finite().nonnegative().optional(),
});
export const menuAssistanceResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ready"),
    data: menuExtractionSchema,
    metadata: metadataSchema,
  }),
  failureSchema,
]);
export const reviewAssistanceResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ready"),
    data: contributionAssessmentSchema,
    metadata: metadataSchema,
  }),
  failureSchema,
]);
