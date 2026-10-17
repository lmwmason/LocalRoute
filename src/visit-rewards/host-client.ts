import { createVisitRewardsApi } from "./api";
import { supabase } from "../supabase";
export const visitRewardsApi = createVisitRewardsApi(
  async () => (await supabase?.auth.getSession())?.data.session?.access_token,
);
