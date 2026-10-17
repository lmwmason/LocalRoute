import { z } from "zod";

export const contributorOutcomeSchema = z.object({
  endorsementId: z.uuid(),
  versionId: z.uuid().nullable(),
  versionNumber: z.number().int().positive().nullable(),
  text: z.string().nullable(),
  status: z.enum(["pending", "published", "rejected", "superseded"]).nullable(),
  placeName: z.string().nullable(),
  ratingCount: z.number().int().nonnegative(),
  helpfulnessAverage: z.number().min(1).max(5).nullable(),
  paidLp: z.number().int().nonnegative(),
  pendingReviewCount: z.number().int().nonnegative(),
  awaitingPayoutCount: z.number().int().nonnegative(),
});
export const contributorOutcomesSchema = z.object({
  items: z.array(contributorOutcomeSchema),
});
export type ContributorOutcome = z.infer<typeof contributorOutcomeSchema>;
export type ContributorOutcomesResult = z.infer<
  typeof contributorOutcomesSchema
>;
