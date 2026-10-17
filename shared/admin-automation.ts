import { z } from "zod";
import {
  assessmentRequestSchema,
  reviewAssistanceResultSchema,
} from "./ai-assistance";
export const automatedTriageSchema = z.object({
  mode: z.literal("automatic_triage_only"),
  persistence: z.literal("process_cache_only"),
  items: z
    .array(
      z.object({
        id: z.uuid(),
        kind: assessmentRequestSchema.shape.kind,
        priority: z.enum(["high", "normal", "needs_information"]),
        assessment: reviewAssistanceResultSchema,
      }),
    )
    .max(1000),
  remaining: z.number().int().nonnegative(),
});
export type AutomatedTriage = z.infer<typeof automatedTriageSchema>;
