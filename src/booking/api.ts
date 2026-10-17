import type { BookingProfile } from "../../shared/booking";
import type {
  BookingVenue,
  Reservation,
  ReservationInput,
} from "../../shared/reservations";

export interface BookingApi {
  capabilities(): Promise<{ enabled: boolean }>;
  venue(placeId: string): Promise<BookingVenue>;
  profile(): Promise<BookingProfile | null>;
  submit(input: ReservationInput): Promise<Reservation>;
  read(id: string): Promise<Reservation>;
  lookup(requestId: string): Promise<Reservation>;
  refresh(id: string): Promise<Reservation>;
}
export class BookingApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// Obtain a fresh session token from the host auth client; never persist contact details.
export function createBookingApi(
  token: () => Promise<string | undefined>,
  fetcher: typeof fetch = fetch,
): BookingApi {
  async function call<T>(path: string, body?: unknown): Promise<T> {
    const accessToken = await token();
    const res = await fetcher(`/api/booking/${path}`, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await res.json();
    if (!res.ok)
      throw new BookingApiError(
        res.status,
        typeof value.error === "string" ? value.error : "booking.unavailable",
      );
    return value as T;
  }
  return {
    capabilities: () => call("capabilities"),
    venue: (id) => call(`venues/${encodeURIComponent(id)}`),
    profile: () => call("profile"),
    submit: (input) => call("reservations", input),
    read: (id) => call(`reservations/${encodeURIComponent(id)}`),
    refresh: (id) => call(`reservations/${encodeURIComponent(id)}/refresh`, {}),
    lookup: (id) => call(`requests/${encodeURIComponent(id)}`),
  };
}
