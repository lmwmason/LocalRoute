import { supabase } from "./supabase";
import { sharedItinerarySchema, type ShareLink } from "../shared/sharing";
import type { BookingProfile, BookingProfileResponse } from "../shared/booking";
import type { Locality } from "../shared/locality";
import type { Itinerary, Schedule, TripInput } from "../shared/planner";
import type { Contribution, Place } from "../shared/domain";
import type {
  AdminData,
  Correction,
  Feedback,
  Workspace,
} from "../shared/community";
async function request<T>(
  path: string,
  init: RequestInit = {},
  expectedUserId?: string,
): Promise<T> {
  const session = (await supabase?.auth.getSession())?.data.session;
  if (expectedUserId && session?.user.id !== expectedUserId)
    throw new Error("AUTH_ACCOUNT_CHANGED");
  const token = session?.access_token;
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body?.error || "연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.",
    );
  return body as T;
}
export const api = {
  shares: (id: string) => request<ShareLink[]>(`/itineraries/${id}/shares`),
  createShare: (id: string, revision: number, expiresInDays: number) =>
    request<ShareLink & { path: string }>(`/itineraries/${id}/shares`, {
      method: "POST",
      body: JSON.stringify({
        revision,
        expiresInDays,
        consentVersion: "unlisted-itinerary-v1",
      }),
    }),
  revokeShare: (id: string) =>
    request(`/itinerary-shares/${id}`, { method: "DELETE" }),
  shared: async (token: string) => {
    const response = await fetch(
      `/api/shared-itineraries/${encodeURIComponent(token)}`,
      { referrerPolicy: "no-referrer" },
    );
    if (!response.ok) throw new Error("sharing.unavailable");
    return sharedItinerarySchema.parse(await response.json());
  },
  bookingProfile: () => request<BookingProfileResponse>("/me/booking-profile"),
  saveBookingProfile: (profile: BookingProfile) =>
    request("/me/booking-profile", {
      method: "PUT",
      body: JSON.stringify({
        ...profile,
        consentVersion: "booking-profile-v1",
      }),
    }),
  deleteBookingProfile: () =>
    request("/me/booking-profile", { method: "DELETE" }),
  skipBookingProfile: () =>
    request("/me/booking-profile/skip", { method: "POST" }),
  quote: () =>
    request<{
      enabled: boolean;
      cost: number;
      promo: number | null;
      earned: number | null;
      held: number;
      policyVersion: string;
    }>("/planning/quote"),
  plan: (id: string) =>
    request<Itinerary>(`/itineraries/${encodeURIComponent(id)}`),
  plans: () =>
    request<{ id: string; result: Itinerary; revision: number }[]>(
      "/itineraries",
    ),
  generate: (
    payload: {
      requestId: string;
      input: TripInput;
      expectedCost: number;
      policyVersion: string;
      consent: true;
      sourcePlanId?: string;
      pinIds?: string[];
    },
    expectedUserId?: string,
  ) =>
    request<Itinerary | { status: "generating"; requestId: string }>(
      "/planning/generate",
      { method: "POST", body: JSON.stringify(payload) },
      expectedUserId,
    ),
  planStatus: (id: string) =>
    request<{ status: "ready" | "generating" | "failed"; result?: Itinerary }>(
      `/planning/status/${id}`,
    ),
  savePlan: (id: string, revision: number, schedule: Schedule) =>
    request<Itinerary>(`/itineraries/${id}`, {
      method: "PUT",
      body: JSON.stringify({ revision, schedule }),
    }),
  me: () => request<Workspace>("/me"),
  localityCoverage: () =>
    request<{
      coverage: {
        label: string;
        widened: boolean;
        available: number;
        coverageSource: string;
      } | null;
    }>("/me/locality-coverage"),
  profile: (
    displayName: string,
    locality: Locality,
    publicLocalArea: boolean,
  ) =>
    request("/me", {
      method: "PUT",
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        displayName,
        ...locality,
        publicLocalArea,
      }),
    }),
  edit: (id: string, text: string, requestId: string) =>
    request(`/endorsements/${id}`, {
      method: "PUT",
      body: JSON.stringify({ requestId, text }),
    }),
  feedback: (payload: Feedback) =>
    request("/feedback", { method: "POST", body: JSON.stringify(payload) }),
  correction: (payload: Correction) =>
    request("/corrections", { method: "POST", body: JSON.stringify(payload) }),
  report: (payload: Record<string, unknown>) =>
    request("/reports", { method: "POST", body: JSON.stringify(payload) }),
  admin: () => request<AdminData>("/admin/queue"),
  decide: (payload: Record<string, unknown>) =>
    request("/admin/decisions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  places: (signal?: AbortSignal) =>
    request<{ places: Place[] }>("/places", { signal }),
  place: (id: string) => request<Place>(`/places/${encodeURIComponent(id)}`),
  search: (query: string, signal?: AbortSignal) =>
    request<{ places: Place[] }>(`/search?q=${encodeURIComponent(query)}`, {
      signal,
    }),
  contribute: (body: Contribution) =>
    request<{ id: string; status: "pending" }>("/contributions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  uploadPhoto: async (
    requestId: string,
    target: unknown,
    file: File,
  ): Promise<{ id: string }> => {
    const token = (await supabase?.auth.getSession())?.data.session
      ?.access_token;
    const response = await fetch(`/api/place-photos/${requestId}`, {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        "X-Place-Target": encodeURIComponent(JSON.stringify(target)),
        "X-Photo-Consent": "real-place-photo-v1",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "photos.error.upload");
    return body;
  },
  photoBlob: async (id: string): Promise<Blob> => {
    const token = (await supabase?.auth.getSession())?.data.session
      ?.access_token;
    const response = await fetch(`/api/place-photos/${id}/image`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error("photos.error.load");
    return response.blob();
  },
};
