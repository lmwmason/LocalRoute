import { z } from "zod";
export const bookingProfileSchema = z.object({
  guestName: z
    .string()
    .trim()
    .max(80)
    .refine((v) => [...v].every((char) => char.charCodeAt(0) >= 32)),
  guestPhone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s()-]/g, ""))
    .pipe(
      z.string().regex(/^\+?[0-9]{7,15}$/, { error: "booking.invalidPhone" }),
    ),
  consentVersion: z.literal("booking-profile-v1"),
});
export type BookingProfile = { guestName: string; guestPhone: string };
export type BookingProfileResponse = {
  profile: BookingProfile | null;
  onboardingSeen: boolean;
};
