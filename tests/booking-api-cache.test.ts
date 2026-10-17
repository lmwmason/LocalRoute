import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingApiError, createBookingApi } from "../src/booking/api";

afterEach(() => vi.restoreAllMocks());

describe("booking browsing request deduplication", () => {
  it("shares concurrent and repeated venue reads in a session", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ supported: true }),
    );
    const api = createBookingApi(async () => "account-a", fetcher);
    await Promise.all(
      Array.from({ length: 24 }, () => api.venue("same-place")),
    );
    await api.venue("same-place");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await api.venue("different-place");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refreshes venue facts after five minutes", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ supported: true }),
    );
    const api = createBookingApi(async () => "account-a", fetcher);
    await api.venue("place");
    clock.mockReturnValue(301001);
    await api.venue("place");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("discards browsing snapshots on account changes and logout", async () => {
    let token: string | undefined = "account-a";
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ supported: true }),
    );
    const api = createBookingApi(async () => token, fetcher);
    await api.venue("place");
    token = "account-b";
    await api.venue("place");
    token = undefined;
    await api.venue("place");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer account-a",
    });
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: "Bearer account-b",
    });
    expect(fetcher.mock.calls[2][1]?.headers).not.toHaveProperty(
      "Authorization",
    );
  });

  it("does not retain failures and preserves provider Retry-After", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { error: "booking.providerLimit" },
          { status: 429, headers: { "Retry-After": "120" } },
        ),
      )
      .mockResolvedValueOnce(Response.json({ supported: true }));
    const api = createBookingApi(async () => "account-a", fetcher);
    await expect(api.venue("place")).rejects.toMatchObject({
      status: 429,
      retryAfter: 120,
    });
    expect(
      new BookingApiError(429, "booking.providerLimit", 120),
    ).toBeInstanceOf(Error);
    await api.venue("place");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("never caches private profiles, reservations, existing-booking checks or refresh writes", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ reservation: null }),
    );
    const api = createBookingApi(async () => "account-a", fetcher);
    for (let n = 0; n < 2; n++) {
      await api.profile();
      await api.read("reservation");
      await api.lookup("request");
      expect(await api.existing("place", "2026-10-20")).toBeNull();
      await api.refresh("reservation");
    }
    expect(fetcher).toHaveBeenCalledTimes(10);
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(2);
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).includes("placeId=place&date=2026-10-20"),
      ),
    ).toBe(true);
  });

  it("only briefly shares capability reads", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ enabled: true }),
    );
    const api = createBookingApi(async () => "account-a", fetcher);
    await Promise.all([api.capabilities(), api.capabilities()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(11001);
    await api.capabilities();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
