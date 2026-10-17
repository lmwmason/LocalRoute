import { createBookingApi } from "./api";
import { supabase } from "../supabase";
import { createBookingTokenSource } from "./session-token";
const source = supabase ? createBookingTokenSource(supabase.auth) : undefined;
export const bookingApi = createBookingApi(async () => source?.token());
