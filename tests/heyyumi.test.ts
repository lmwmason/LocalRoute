import { describe, expect, it, vi } from "vitest";
import { HeyYumi, providerPlace } from "../server/heyyumi";

const data = {
  id: "external-12",
  name: "테스트 가게",
  categoryLabel: "한식",
  address: { road: "서울 테스트길 12" },
  location: { lat: 37.5, lng: 127 },
  confidence: 0.5,
  possiblyClosed: false,
  lastSeenAt: null,
};
describe("HeyYumi core contract and cost controls", () => {
  it("uses server header/core, deduplicates in-flight requests and keeps external identity separate", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ success: true, data: [data] }),
    );
    const provider = new HeyYumi("test-key", 30, fetcher);
    const [first, second] = await Promise.all([
      provider.search("성수"),
      provider.search(" 성수 "),
    ]);
    expect(first).toEqual(second);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("fields")).toBe("core");
    expect(url.href).not.toContain("test-key");
    expect(init.headers).toEqual({ Authorization: "Bearer test-key" });
    expect(providerPlace(first[0]).id).toBe("heyyumi:external-12");
    expect(providerPlace(first[0]).possiblyClosed).toBe(false);
  });
  it.each([
    [401, 503],
    [500, 502],
    [503, 502],
    [429, 429],
  ])("maps %i to safe HTTP %i", async (status, expected) => {
    const provider = new HeyYumi(
      "test",
      30,
      vi.fn(
        async () =>
          new Response(null, { status, headers: { "Retry-After": "30" } }),
      ),
    );
    await expect(provider.search("성수")).rejects.toMatchObject({
      status: expected,
    });
  });
  it("handles timeout, no results, invalid responses and provider cooldown without fabricated fallback", async () => {
    await expect(
      new HeyYumi(
        "test",
        30,
        vi.fn(async () => {
          throw new Error("timeout");
        }),
      ).search("성수"),
    ).rejects.toMatchObject({ status: 504 });
    expect(
      await new HeyYumi(
        "test",
        30,
        vi.fn(async () => new Response(null, { status: 404 })),
      ).search("성수"),
    ).toEqual([]);
    await expect(
      new HeyYumi(
        "test",
        30,
        vi.fn(async () => Response.json({ bad: true })),
      ).search("성수"),
    ).rejects.toMatchObject({ status: 502 });
    const fetcher = vi.fn(
      async () =>
        new Response(null, { status: 429, headers: { "Retry-After": "30" } }),
    );
    const provider = new HeyYumi("test", 30, fetcher);
    await expect(provider.search("성수")).rejects.toMatchObject({
      retryAfter: "30",
    });
    await expect(provider.search("국밥")).rejects.toMatchObject({
      status: 429,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("enforces the local hourly budget even when queries differ", async () => {
    const provider = new HeyYumi(
      "test",
      1,
      vi.fn(async () => Response.json({ success: true, data: [] })),
    );
    await provider.search("성수");
    await expect(provider.search("연남")).rejects.toMatchObject({
      status: 429,
    });
  });
});
