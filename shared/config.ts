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
export function isLocalRouteSupabase(value: string) {
  try {
    return new URL(value).origin === localRouteSupabaseUrl;
  } catch {
    return false;
  }
}
