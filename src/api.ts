import { supabase } from "./supabase";
import type { Contribution, Place } from "../shared/domain";
import type {
  AdminData,
  Correction,
  Feedback,
  Workspace,
} from "../shared/community";
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
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
  me: () => request<Workspace>("/me"),
  profile: (displayName: string) =>
    request("/me", {
      method: "PUT",
      body: JSON.stringify({ requestId: crypto.randomUUID(), displayName }),
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
  search: (query: string, signal?: AbortSignal) =>
    request<{ places: Place[] }>(`/search?q=${encodeURIComponent(query)}`, {
      signal,
    }),
  contribute: (body: Contribution) =>
    request<{ id: string; status: "pending" }>("/contributions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
