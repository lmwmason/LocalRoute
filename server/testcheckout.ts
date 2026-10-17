import { createClient } from "@supabase/supabase-js";
import type { Express, Request } from "express";
import { z } from "zod";
import { isLocalRouteSupabase } from "../shared/config";
import type { ServerConfig } from "./config";
import { AppError } from "./errors";
import type { Actor } from "./repository";

const resultSchema = z.object({
  claimed: z.boolean(),
  granted: z.boolean(),
  amount: z.literal(100),
});
export function attachTestCheckout(
  app: Express,
  options: {
    config: Pick<ServerConfig, "live" | "url" | "secret">;
    actor: (req: Request) => Promise<Actor>;
    limit: (key: string, maximum: number, seconds: number) => void;
    execute?: (actor: string, action: "status" | "claim") => Promise<unknown>;
  },
) {
  const { config } = options;
  const client =
    !options.execute && config.live && config.secret && isLocalRouteSupabase(config.url)
      ? createClient(config.url, config.secret, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : undefined;
  async function action(req: Request, kind: "status" | "claim") {
    if (!config.live || (!client && !options.execute))
      throw new AppError(503, "TEST_BONUS_UNAVAILABLE");
    const user = await options.actor(req);
    options.limit(`test-bonus:${kind}:${user.id}`, kind === "claim" ? 5 : 30, 60);
    if (kind === "claim")
      z.object({ accepted: z.literal(true), requestId: z.uuid() }).strict().parse(req.body);
    if (options.execute) return resultSchema.parse(await options.execute(user.id, kind));
    const { data, error } = await client!.rpc("test_checkout_bonus", {
      p_actor: user.id,
      p_action: kind,
    });
    if (error)
      throw new AppError(
        error.code === "28000" ? 401 : error.code === "42501" ? 403 : 503,
        error.code === "42501" ? "LEGAL_CONSENT_REQUIRED" : "TEST_BONUS_UNAVAILABLE",
      );
    return resultSchema.parse(data);
  }
  app.get("/api/checkout/test-bonus", async (req, res) => {
    res.set("Cache-Control", "no-store").json(await action(req, "status"));
  });
  app.post("/api/checkout/test-bonus", async (req, res) => {
    res.set("Cache-Control", "no-store").json(await action(req, "claim"));
  });
}
