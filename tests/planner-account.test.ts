import { afterEach, describe, expect, it, vi } from "vitest";
import { plannerInput } from "./fixtures/planning";
const auth = vi.hoisted(() => ({ id: "member-b" }));
vi.mock("../src/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: auth.id }, access_token: "fixture" } },
      }),
    },
  },
}));
import { api } from "../src/api";
afterEach(() => vi.unstubAllGlobals());
describe("paid request account binding", () => {
  it("refuses a request when the active account changes before token acquisition", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      api.generate(
        {
          requestId: crypto.randomUUID(),
          input: plannerInput,
          expectedCost: 100,
          policyVersion: "pilot-v1",
          consent: true,
        },
        "member-a",
      ),
    ).rejects.toThrow("AUTH_ACCOUNT_CHANGED");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
