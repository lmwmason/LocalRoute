import { createClient } from "@supabase/supabase-js";
import { isLocalRouteSupabase } from "../../shared/config";
import type { ServerConfig } from "../config";
import { AppError } from "../errors";
import type { ContributorOutcomesResult } from "../../shared/contributor-outcomes";
import { readContributorOutcomes } from "./contributor-outcomes";
export type VisitRewardConfig = Pick<
  ServerConfig,
  "live" | "database" | "url" | "secret"
> & { visitRewards?: { payoutsEnabled: boolean } };
export function readVisitRewardSettings(env: NodeJS.ProcessEnv) {
  return { payoutsEnabled: env.FEATURE_VISIT_REWARD_PAYOUTS === "true" };
}
export interface VisitRewardStore {
  contributorOutcomes?(actor: string): Promise<ContributorOutcomesResult>;
  action(
    actor: string,
    action: string,
    payload: Record<string, unknown>,
    issueEnabled: boolean,
  ): Promise<unknown>;
}
export function visitRewardError(error: { code?: string }): AppError {
  const codes: Record<string, [number, string]> = {
    "28000": [401, "visit.auth"],
    "42501": [403, "visit.forbidden"],
    LR404: [404, "visit.notFound"],
    LR409: [409, "visit.changed"],
    "23505": [409, "visit.duplicate"],
    LR429: [429, "visit.limit"],
    LR503: [503, "visit.disabled"],
    LR422: [422, "visit.affiliated"],
    LR490: [409, "visit.window"],
    LR491: [409, "visit.placeCap"],
    LR492: [409, "visit.curatorCap"],
    "22023": [400, "visit.invalid"],
    "23514": [400, "visit.invalid"],
  };
  const [status, message] = codes[error.code || ""] || [
    503,
    "visit.unavailable",
  ];
  return new AppError(status, message);
}
export function createVisitRewardStore(
  config: VisitRewardConfig,
): VisitRewardStore {
  if (!isLocalRouteSupabase(config.url))
    throw new Error(
      "Visit rewards require Supabase project pjdawapasozsrpnrtsfx.",
    );
  const client = createClient(config.url, config.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    contributorOutcomes: (actor) => readContributorOutcomes(client, actor),
    async action(actor, action, payload, issueEnabled) {
      const { data, error } = await client.rpc("visit_reward_action", {
        p_actor: actor,
        p_action: action,
        p_payload: payload,
        p_issue_enabled: issueEnabled,
      });
      if (error) throw visitRewardError(error);
      return data;
    },
  };
}
