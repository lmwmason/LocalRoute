import { z } from "zod";
import { bookingProfileSchema } from "./booking";
const printable = (v: string) =>
  [...v].every(
    (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
  );

export const reservationConsent = "heyyumi-reservation-v1" as const;
export const reservationStates = [
  "draft",
  "submitting",
  "pending",
  "confirmed",
  "declined",
  "cancelled",
  "expired",
  "failed",
  "unknown",
  "no_show",
] as const;
export type ReservationState = (typeof reservationStates)[number];
export const reservationSchema = bookingProfileSchema
  .omit({ consentVersion: true })
  .extend({
    requestId: z.uuid(),
    placeId: z.uuid(),
    expectedName: z.string().trim().min(1).max(100),
    expectedAddress: z.string().trim().min(1).max(250),
    reservationTime: z.iso
      .datetime({ offset: true })
      .refine((v) => /(?:Z|[+-]\d{2}:\d{2})$/.test(v)),
    guestCount: z.number().int().positive().max(100), // LocalRoute abuse limit; not venue capacity.
    guestName: z.string().trim().min(1).max(80).refine(printable),
    note: z.string().trim().max(500).refine(printable).default(""),
    consentVersion: z.literal(reservationConsent),
    consent: z.literal(true),
  })
  .strict();
export type ReservationInput = z.infer<typeof reservationSchema>;
export type BookingVenue = {
  placeId: string;
  externalId: string;
  name: string;
  address: string;
  supported: boolean;
  phone?: string;
};
export type Reservation = {
  id: string;
  requestId: string;
  placeId: string;
  state: ReservationState;
  reservationTime: string;
  guestCount: number;
  providerReference: string | null;
  expiresAt: string | null;
  updatedAt: string;
  revision: number;
  reconciliationRequired: boolean;
};
export function providerState(state: string): ReservationState {
  // HeyYumi cancelled means merchant rejection, not traveler cancellation.
  return state === "cancelled"
    ? "declined"
    : ["pending", "confirmed", "expired", "no_show"].includes(state)
      ? (state as ReservationState)
      : "unknown";
}
export function mayTransition(from: ReservationState, to: ReservationState) {
  if (from === to) return true;
  if (["submitting", "pending", "unknown"].includes(from))
    return !["draft", "submitting"].includes(to);
  return from === "confirmed" && ["declined", "no_show"].includes(to);
}
