import { supabase } from "./supabase";
import type { Contribution, Place } from "../shared/domain";
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
