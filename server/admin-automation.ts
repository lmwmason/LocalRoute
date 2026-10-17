import { createHash } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import {
  assessmentRequestSchema,
  type ReviewAssistanceResult,
} from "../shared/ai-assistance";
import { automatedTriageSchema } from "../shared/admin-automation";
import type { Repository } from "./repository";
import type { AiAssistance } from "./ai-assistance";
import { AppError } from "./errors";

/** Operator-screen automation only. No decision/LP RPC is available here.
 * Cache/singleflight is bounded and local to this process; it is not a durable
 * worker or cross-instance idempotency guarantee. Existing AI budgets still apply.
 */
export function createAdminAutomation(options: {
  repository: Pick<Repository, "authenticate" | "community">;
  assistance: Pick<AiAssistance, "assessContribution">;
  enabled: boolean;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const cache = new Map<
    string,
    {
      expires: number;
      promise: Promise<ReviewAssistanceResult>;
      failureRecorded?: boolean;
    }
  >();
  const rowSchema = assessmentRequestSchema
    .omit({ language: true })
    .extend({ title: z.string().max(2000), body: z.string().max(20000) });
  return {
    async run(token: string, input: unknown) {
      const actor = await options.repository.authenticate(token);
      if (!["admin", "moderator"].includes(actor.role))
        throw new AppError(403, "ADMIN_REQUIRED");
      if (!options.enabled) throw new AppError(503, "AI_AUTOMATION_DISABLED");
      const { language } = z
        .object({ language: z.enum(["ko", "en"]) })
        .strict()
        .parse(input);
      const queue = z
        .object({ queue: z.array(rowSchema).max(1000) })
        .parse(
          await options.repository.community(actor, "queue", null, {}),
        ).queue;
      for (const [key, value] of cache)
        if (value.expires <= now()) cache.delete(key);
      const items = [];
      let started = 0;
      for (const row of queue) {
        const key = createHash("sha256")
          .update(
            JSON.stringify([row.kind, row.id, row.title, row.body, language]),
          )
          .digest("hex");
        let cached = cache.get(key);
        if (!cached && started < 3) {
          started++;
          if (cache.size >= 500) break;
          const promise = options.assistance
            .assessContribution(token, { id: row.id, kind: row.kind, language })
            .catch(() => ({
              status: "failed" as const,
              code: "unavailable" as const,
            }));
          cached = { expires: now() + 3600000, promise };
          cache.set(key, cached);
        }
        if (!cached) continue;
        const assessment = await cached.promise;
        if (assessment.status === "failed" && !cached.failureRecorded) {
          cached.failureRecorded = true;
          cached.expires =
            now() + Math.max(60, assessment.retryAfterSeconds ?? 60) * 1000;
        }
        const priority =
          row.kind === "report" ||
          (assessment.status === "ready" &&
            assessment.data.signals.some((signal) =>
              ["content_concern", "instruction_like_text"].includes(
                signal.category,
              ),
            ))
            ? ("high" as const)
            : assessment.status === "failed" ||
                assessment.data.recommendedAction === "request_clarification"
              ? ("needs_information" as const)
              : ("normal" as const);
        items.push({ id: row.id, kind: row.kind, priority, assessment });
      }
      return automatedTriageSchema.parse({
        mode: "automatic_triage_only",
        persistence: "process_cache_only",
        items,
        remaining: queue.length - items.length,
      });
    },
  };
}
export function attachAdminAutomation(
  app: Express,
  options: Parameters<typeof createAdminAutomation>[0],
) {
  const automation = createAdminAutomation(options);
  app.post("/api/admin/automation/triage", async (req, res) => {
    const token = req.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) throw new AppError(401, "AUTH_REQUIRED");
    res
      .set("Cache-Control", "private, no-store")
      .json(await automation.run(token, req.body));
  });
}
