import { tripSchema } from "../../shared/planner";
import { z } from "zod";
export const tripDraftSchema = z.object({
  ...tripSchema.shape,
  destination: tripSchema.shape.destination.nullable(),
});
export type TripDraft = z.infer<typeof tripDraftSchema>;
const key = (userId?: string) => `localroute.trip.draft.${userId || "guest"}`;
export function readTripDraft(userId?: string): TripDraft | null {
  try {
    const own = tripDraftSchema.safeParse(
      JSON.parse(sessionStorage.getItem(key(userId)) || "null"),
    );
    if (own.success) return own.data;
    // A traveler can finish a guest draft after sign-in, without mixing two member accounts.
    if (userId) {
      const guest = tripDraftSchema.safeParse(
        JSON.parse(sessionStorage.getItem(key()) || "null"),
      );
      if (guest.success) {
        sessionStorage.setItem(key(userId), JSON.stringify(guest.data));
        sessionStorage.removeItem(key());
        return guest.data;
      }
    }
  } catch {
    /* Optional draft persistence must not stop free planning. */
  }
  return null;
}
export function writeTripDraft(input: TripDraft, userId?: string) {
  try {
    sessionStorage.setItem(key(userId), JSON.stringify(input));
  } catch {
    /* Paid request persistence has a separate fail-closed guard. */
  }
}
