import {
  contributorOutcomesSchema,
  type ContributorOutcomesResult,
} from "../../shared/contributor-outcomes";
import { supabase } from "../supabase";

export class ContributorOutcomesError extends Error {
  constructor(public status: number) {
    super("Contributor outcomes unavailable");
  }
}
export type LoadContributorOutcomes = (
  ownerId: string,
  signal: AbortSignal,
) => Promise<ContributorOutcomesResult>;

export const loadContributorOutcomes: LoadContributorOutcomes = async (
  ownerId,
  signal,
) => {
  const session = (await supabase?.auth.getSession())?.data.session;
  // A cached token is transport only. The existing server actor authenticates this read.
  if (!session || session.user.id !== ownerId)
    throw new ContributorOutcomesError(401);
  const response = await fetch("/api/visit-rewards/contributor-outcomes", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new ContributorOutcomesError(response.status);
  const result = contributorOutcomesSchema.parse(await response.json());
  const current = (await supabase?.auth.getSession())?.data.session;
  if (!current || current.user.id !== ownerId)
    throw new ContributorOutcomesError(401);
  return result;
};
