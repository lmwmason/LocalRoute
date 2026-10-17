// Test-only API boundary: no Auth, database or provider clients.
async function call(path: string, options?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const value = await response.json();
    throw new Error(value.error || "sharing.failed");
  }
  return response.json();
}
export const api = {
  shares: (id: string) => call(`/itineraries/${id}/shares`),
  createShare: (id: string, revision: number, expiresInDays: number) =>
    call(`/itineraries/${id}/shares`, {
      method: "POST",
      body: JSON.stringify({
        revision,
        expiresInDays,
        consentVersion: "unlisted-itinerary-v1",
      }),
    }),
  revokeShare: (id: string) =>
    call(`/itinerary-shares/${id}`, { method: "DELETE" }),
};
