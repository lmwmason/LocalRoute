import type { ServerConfig } from "../config";
import { isLocalRouteSupabase } from "../../shared/config";

export type BookingSettings = {
  enabled: boolean;
  accessVerified: boolean;
  termsVerified: boolean;
  budget: number;
};
export type BookingConfig = ServerConfig & { booking?: BookingSettings };
// Pass root .env through the existing loader. No second configuration file.
export function readBookingSettings(env: NodeJS.ProcessEnv): BookingSettings {
  return {
    enabled: env.FEATURE_HEYYUMI_BOOKING === "true",
    accessVerified: env.HEYYUMI_BOOKING_ACCESS_VERIFIED === "true",
    termsVerified: env.HEYYUMI_TERMS_VERIFIED === "true",
    budget: Math.max(
      1,
      Math.min(1000, Number(env.HEYYUMI_BOOKING_REQUESTS_PER_HOUR) || 30),
    ),
  };
}
export function bookingEnabled(config: BookingConfig) {
  if (config.live && !isLocalRouteSupabase(config.url))
    throw new Error(
      "Booking requires the LocalRoute Supabase project pjdawapasozsrpnrtsfx.",
    );
  return Boolean(
    config.live &&
    config.database &&
    config.booking?.enabled &&
    config.booking.accessVerified &&
    config.booking.termsVerified &&
    config.heyyumiKey,
  );
}
