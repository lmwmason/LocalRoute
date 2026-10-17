import { z } from "zod";
import { tripSchema } from "../../shared/planner";
const schema = z.object({
  requestId: z.uuid(),
  input: tripSchema,
  expectedCost: z.number().int().positive(),
  policyVersion: z.string().min(1),
  consent: z.literal(true),
  sourcePlanId: z.uuid().optional(),
  pinIds: z.array(z.string()).optional(),
});
export type PendingPlan = z.infer<typeof schema>;
const key = (userId: string) => `localroute.planning.pending.${userId}`;
export function readPending(userId?: string): PendingPlan | null {
  if (!userId) return null;
  try {
    const parsed = schema.safeParse(
      JSON.parse(sessionStorage.getItem(key(userId)) || "null"),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function persistPending(
  userId: string | undefined,
  payload: PendingPlan | null,
) {
  if (!userId) throw new Error("PENDING_STORAGE_UNAVAILABLE");
  try {
    if (payload) sessionStorage.setItem(key(userId), JSON.stringify(payload));
    else sessionStorage.removeItem(key(userId));
  } catch {
    throw new Error("PENDING_STORAGE_UNAVAILABLE");
  }
}
