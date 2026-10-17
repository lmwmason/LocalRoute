import { createBookingApi } from "./api";
import { supabase } from "../supabase";
export const bookingApi = createBookingApi(async () => {
  if (!supabase) return undefined;
  return (await supabase.auth.getSession()).data.session?.access_token;
});
