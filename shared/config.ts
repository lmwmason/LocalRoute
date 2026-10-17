export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export const localRouteProjectRef = "pjdawapasozsrpnrtsfx";
export const localRouteSupabaseUrl = `https://${localRouteProjectRef}.supabase.co`;
export function isPublicSupabaseKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(value)) return true;
  if (value.startsWith("sb_secret_")) return false;
  try {
    const parts = value.split(".");
    if (parts.length !== 3 || !parts[2]) return false;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload.role === "anon" && payload.ref === localRouteProjectRef;
  } catch {
    return false;
  }
}
export function isLocalRouteSupabase(value: string) {
  try {
    const url = new URL(value);
    return url.origin === localRouteSupabaseUrl && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}
