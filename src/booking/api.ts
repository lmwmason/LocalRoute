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
  existing(placeId: string, date: string): Promise<Reservation | null>;
  refresh(id: string): Promise<Reservation>;
}
export class BookingApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
// Obtain a fresh session token from the host auth client; never persist contact details.
export function createBookingApi(
  token: () => Promise<string | undefined>,
  fetcher: typeof fetch = fetch,
): BookingApi {
  // Only public venue facts are held for the current signed-in browsing session.
  // Never cache customer profiles, reservations, consent, or mutation results.
  let identity: string | undefined;
  const reads = new Map<string, { expires: number; value: Promise<unknown> }>();
  async function call<T>(path: string, body?: unknown, ttl = 0): Promise<T> {
    const accessToken = await token();
    if (identity !== accessToken) {
      identity = accessToken;
      reads.clear();
    }
    const previous = reads.get(path);
    if (ttl && previous && previous.expires > Date.now())
      return previous.value as Promise<T>;
    const value = request<T>(accessToken, path, body);
    if (ttl) {
      if (reads.size >= 64) reads.delete(reads.keys().next().value!);
      reads.set(path, { expires: Date.now() + ttl, value });
      void value.catch(() => {
        if (reads.get(path)?.value === value) reads.delete(path);
      });
    }
    return value;
  }
  async function request<T>(
    accessToken: string | undefined,
    path: string,
    body?: unknown,
  ): Promise<T> {
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
    if (!res.ok) {
      const raw = res.headers.get("Retry-After");
      const seconds =
        raw && /^\d+$/.test(raw)
          ? Number(raw)
          : raw
            ? Math.ceil((Date.parse(raw) - Date.now()) / 1000)
            : undefined;
      throw new BookingApiError(
        res.status,
        typeof value.error === "string" ? value.error : "booking.unavailable",
        seconds !== undefined && Number.isFinite(seconds)
          ? Math.max(1, seconds)
          : undefined,
      );
    }
    return value as T;
  }
  return {
    capabilities: () => call("capabilities", undefined, 10000),
    venue: (id) => call(`venues/${encodeURIComponent(id)}`, undefined, 300000),
    profile: () => call("profile"),
    submit: (input) => call("reservations", input),
    read: (id) => call(`reservations/${encodeURIComponent(id)}`),
    refresh: (id) => call(`reservations/${encodeURIComponent(id)}/refresh`, {}),
    lookup: (id) => call(`requests/${encodeURIComponent(id)}`),
    existing: async (placeId, date) =>
      (
        await call<{ reservation: Reservation | null }>(
          `reservations/existing?${new URLSearchParams({ placeId, date })}`,
        )
      ).reservation,
  };
}
