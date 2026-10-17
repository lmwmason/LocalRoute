import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { reservationStates, type Reservation } from "../../shared/reservations";
import { AppError } from "../errors";
import type { BookingConfig } from "./config";
import { isLocalRouteSupabase } from "../../shared/config";

export interface BookingStore {
  action(
    actor: string,
    action: string,
    payload?: Record<string, unknown>,
  ): Promise<unknown>;
}
export function bookingDatabaseError(error: { code?: string }): AppError {
  return new AppError(
    error.code === "LR404"
      ? 404
      : error.code === "LR409" || error.code === "23505"
        ? 409
        : error.code === "LR429"
          ? 429
          : 503,
    error.code === "LR404"
      ? "booking.notFound"
      : error.code === "LR409" || error.code === "23505"
        ? "booking.duplicate"
        : "booking.unavailable",
  );
}
export function bookingStore(config: BookingConfig): BookingStore {
  if (!isLocalRouteSupabase(config.url))
    throw new Error("Invalid LocalRoute Supabase project");
  const client = createClient(config.url, config.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async action(actor, action, payload = {}) {
      const { data, error } = await client.rpc("reservation_action", {
        p_actor: actor,
        p_action: action,
        p_payload: payload,
      });
      if (error) throw bookingDatabaseError(error);
      return data;
    },
  };
}
const rowSchema = z.object({
  id: z.uuid(),
  request_id: z.uuid(),
  place_id: z.uuid(),
  fingerprint: z.string(),
  external_id: z.string(),
  state: z.enum(reservationStates),
  reservation_time: z.string(),
  guest_count: z.number(),
  provider_reference: z.string().nullable(),
  expires_at: z.string().nullable(),
  updated_at: z.string(),
  revision: z.number(),
  reconciliation_required: z.boolean(),
});
export type StoredReservation = z.infer<typeof rowSchema>;
export const parseRow = (value: unknown) => rowSchema.parse(value);
export function publicReservation(r: StoredReservation): Reservation {
  return {
    id: r.id,
    requestId: r.request_id,
    placeId: r.place_id,
    state: r.state,
    reservationTime: r.reservation_time,
    guestCount: r.guest_count,
    providerReference: r.provider_reference,
    expiresAt: r.expires_at,
    updatedAt: r.updated_at,
    revision: r.revision,
    reconciliationRequired: r.reconciliation_required,
  };
}
