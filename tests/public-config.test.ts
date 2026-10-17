import { describe, expect, it } from "vitest";
import {
  isPublicSupabaseKey,
  isLocalRouteSupabase,
  localRouteProjectRef,
} from "../shared/config";
function jwt(role: string, ref = localRouteProjectRef) {
  return `${btoa("{}")}\.${btoa(JSON.stringify({ role, ref }))}.fake-signature`;
}
describe("public configuration allowlist", () => {
  it("accepts publishable and LocalRoute legacy anon keys only", () => {
    expect(isPublicSupabaseKey("sb_publishable_fixture_public_key_only")).toBe(
      true,
    );
    expect(isPublicSupabaseKey(jwt("anon"))).toBe(true);
    for (const value of [
      "sb_secret_private_value",
      jwt("service_role"),
      jwt("authenticated"),
      jwt("anon", "wrong-project"),
      "malformed",
      "a.bad.c",
      "",
    ])
      expect(isPublicSupabaseKey(value)).toBe(false);
  });
  it("rejects altered project URLs, credentials, path and query components", () => {
    expect(
      isLocalRouteSupabase(`https://${localRouteProjectRef}.supabase.co`),
    ).toBe(true);
    for (const value of [
      `https://user:pass@${localRouteProjectRef}.supabase.co`,
      `https://${localRouteProjectRef}.supabase.co/other`,
      `https://${localRouteProjectRef}.supabase.co?key=oops`,
      "https://another.supabase.co",
      "not-url",
    ])
      expect(isLocalRouteSupabase(value)).toBe(false);
  });
});
