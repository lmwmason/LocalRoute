import type { Express, Request } from "express";
import { z } from "zod";
import {
  affiliationSchema,
  visitDecisionSchema,
  visitPolicySchema,
  visitRequestSchema,
} from "../../shared/visit-rewards";
import { isLocalRouteSupabase } from "../../shared/config";
import { AppError } from "../errors";
import type { Actor } from "../repository";
import {
  createVisitRewardStore,
  type VisitRewardConfig,
  type VisitRewardStore,
} from "./store";
export { readVisitRewardSettings } from "./store";

export function attachVisitRewards(
  app: Express,
  config: VisitRewardConfig,
  actor: (req: Request) => Promise<Actor>,
  injectedStore?: VisitRewardStore,
) {
  if (config.live && !isLocalRouteSupabase(config.url))
    throw new Error(
      "Visit rewards require Supabase project pjdawapasozsrpnrtsfx.",
    );
  const store =
    injectedStore ||
    (config.live && config.database
      ? createVisitRewardStore(config)
      : undefined);
  const issueEnabled = config.visitRewards?.payoutsEnabled === true;
  const buckets = new Map<string, { count: number; expires: number }>();
  app.use("/api/visit-rewards", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  async function access(req: Request, admin = false, superAdmin = false) {
    const user = await actor(req); // Existing getUser authenticator enforces verified email. SQL independently rechecks.
    if (!config.live || !store) throw new AppError(503, "visit.unavailable");
    if (
      (admin && !["admin", "moderator"].includes(user.role)) ||
      (superAdmin && user.role !== "admin")
    )
      throw new AppError(403, "visit.forbidden");
    const now = Date.now();
    for (const [key, bucket] of buckets)
      if (bucket.expires <= now) buckets.delete(key);
    const bucket = buckets.get(user.id) || { count: 0, expires: now + 60000 };
    buckets.set(user.id, bucket);
    if (++bucket.count > 30) throw new AppError(429, "visit.limit", "60");
    return user;
  }
  async function call(
    req: Request,
    action: string,
    payload: Record<string, unknown> = {},
    admin = false,
    superAdmin = false,
  ) {
    const user = await access(req, admin, superAdmin);
    return store!.action(user.id, action, payload, issueEnabled);
  }
  app.get("/api/visit-rewards/policy", async (req, res) =>
    res.json(await call(req, "policy")),
  );
  app.get("/api/visit-rewards/targets", async (req, res) =>
    res.json(await call(req, "targets")),
  );
  app.get("/api/visit-rewards/requests", async (req, res) =>
    res.json(await call(req, "list")),
  );
  app.post("/api/visit-rewards/requests", async (req, res) =>
    res
      .status(201)
      .json(await call(req, "submit", visitRequestSchema.parse(req.body))),
  );
  app.get("/api/visit-rewards/requests/:id", async (req, res) =>
    res.json(await call(req, "get", { id: z.uuid().parse(req.params.id) })),
  );
  app.get("/api/visit-rewards/admin/queue", async (req, res) =>
    res.json(await call(req, "queue", {}, true)),
  );
  app.post("/api/visit-rewards/admin/decisions", async (req, res) =>
    res.json(
      await call(req, "decide", visitDecisionSchema.parse(req.body), true),
    ),
  );
  app.post("/api/visit-rewards/admin/requests/:id/issue", async (req, res) =>
    res.json(
      await call(req, "issue", { id: z.uuid().parse(req.params.id) }, true),
    ),
  );
  app.put("/api/visit-rewards/admin/policy", async (req, res) =>
    res.json(
      await call(
        req,
        "policy_update",
        visitPolicySchema.parse(req.body),
        true,
        true,
      ),
    ),
  );
  app.put("/api/visit-rewards/admin/affiliations", async (req, res) =>
    res.json(
      await call(
        req,
        "affiliation",
        affiliationSchema.parse(req.body),
        true,
        true,
      ),
    ),
  );
}
