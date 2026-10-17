import { createAiAssistanceClient } from "./client";
import { supabase } from "../supabase";
export const aiAssistance = createAiAssistanceClient({
  token: async () =>
    (await supabase?.auth.getSession())?.data.session?.access_token || null,
});
