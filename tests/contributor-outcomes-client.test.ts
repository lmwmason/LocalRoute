import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../src/supabase", () => ({ supabase: { auth: { getSession } } }));
import { loadContributorOutcomes } from "../src/visit-rewards/contributor-outcomes-api";

const session = (id: string) => ({
  data: { session: { user: { id }, access_token: "local-fixture-token" } },
});
describe("private contributor outcomes client", () => {
  beforeEach(() => {
    getSession.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not send requests for signed-out or mismatched accounts", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const value of [{ data: { session: null } }, session("other")]) {
      getSession.mockResolvedValue(value);
      await expect(
        loadContributorOutcomes("owner", new AbortController().signal),
      ).rejects.toMatchObject({ status: 401 });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses a private uncached read without caller-controlled account parameters", async () => {
    getSession.mockResolvedValue(session("owner"));
    const fetcher = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    expect(await loadContributorOutcomes("owner", signal)).toEqual({
      items: [],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/visit-rewards/contributor-outcomes",
      {
        headers: { Authorization: "Bearer local-fixture-token" },
        cache: "no-store",
        signal,
      },
    );
  });

  it("discards responses after account switches and propagates failures instead of inventing empty data", async () => {
    getSession
      .mockResolvedValueOnce(session("owner"))
      .mockResolvedValueOnce(session("other"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [] })),
    );
    await expect(
      loadContributorOutcomes("owner", new AbortController().signal),
    ).rejects.toMatchObject({ status: 401 });
    getSession.mockResolvedValue(session("owner"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "fixture" }, { status: 503 })),
    );
    await expect(
      loadContributorOutcomes("owner", new AbortController().signal),
    ).rejects.toMatchObject({ status: 503 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ invented: "data" })),
    );
    await expect(
      loadContributorOutcomes("owner", new AbortController().signal),
    ).rejects.toThrow();
  });
});
