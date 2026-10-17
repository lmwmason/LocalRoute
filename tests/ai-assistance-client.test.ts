import { describe, expect, it, vi } from "vitest";
import { createAiAssistanceClient } from "../src/ai-assistance/client";
import { preparePhotoUpload } from "../src/photos/prepare-upload";

vi.mock("../src/photos/prepare-upload", () => ({
  preparePhotoUpload: vi.fn(
    async () =>
      new File(["normalized JPEG fixture"], "localroute-photo.jpg", {
        type: "image/jpeg",
      }),
  ),
}));

const options = { language: "en", privacyConfirmed: true } as const;
const file = () =>
  new File(["mock menu bytes"], "private-filename.png", { type: "image/png" });
const ready = {
  status: "ready",
  data: { items: [], unreadable_regions: ["whole"], notes: ["no_menu_found"] },
  metadata: {
    model: "fixture",
    promptVersion: "menu-visible-v1",
    completedAt: "2026-10-17T01:00:00Z",
    source: "gemini",
    requiresHumanReview: true,
  },
};

describe("AI assistance same-origin client", () => {
  it("sends locally normalized JPEG bytes, explicit privacy options and session token only to the local endpoint", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(ready)));
    const client = createAiAssistanceClient({
      token: async () => "session-unit",
      fetcher,
    });
    expect(await client.extractMenu(file(), options)).toEqual(ready);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/ai-assistance/menu");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Authorization: "Bearer session-unit",
        "Content-Type": "image/jpeg",
      },
    });
    expect(init?.body).toBeInstanceOf(File);
    expect(
      JSON.parse((init?.headers as Record<string, string>)["X-Menu-Options"]),
    ).toMatchObject({ privacyConfirmed: true, redactions: [] });
  });
  it("preserves typed failure states for HTTP errors and never exposes arbitrary provider bodies", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "failed",
            code: "rate_limited",
            retryAfterSeconds: 60,
          }),
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "private provider details" }), {
          status: 502,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(ready), { status: 500 }),
      );
    const client = createAiAssistanceClient({
      token: async () => "unit",
      fetcher,
    });
    expect(await client.extractMenu(file(), options)).toEqual({
      status: "failed",
      code: "rate_limited",
      retryAfterSeconds: 60,
    });
    expect(await client.extractMenu(file(), options)).toEqual({
      status: "failed",
      code: "invalid_output",
    });
    expect(await client.extractMenu(file(), options)).toEqual({
      status: "failed",
      code: "invalid_output",
    });
  });
  it("rejects missing sessions, oversized/wrong files and unconfirmed privacy without fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createAiAssistanceClient({
      token: async () => null,
      fetcher,
    });
    expect(await client.extractMenu(file(), options)).toMatchObject({
      code: "unauthenticated",
    });
    expect(
      await client.extractMenu(
        new File([Buffer.alloc(5 * 1024 * 1024 + 1)], "large.png", {
          type: "image/png",
        }),
        options,
      ),
    ).toMatchObject({ code: "photo_too_large" });
    expect(
      await client.extractMenu(
        new File(["<svg/>"], "bad.svg", { type: "image/svg+xml" }),
        options,
      ),
    ).toMatchObject({ code: "invalid_photo" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends review IDs, not client-authored evidence; redacts thrown network errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("unit-secret-provider-text"));
    const client = createAiAssistanceClient({
      token: async () => "unit",
      fetcher,
    });
    const input = {
      id: "90000000-0000-4000-8000-000000000001",
      kind: "submission",
      language: "en",
    } as const;
    expect(await client.assessContribution(input)).toEqual({
      status: "failed",
      code: "unavailable",
    });
    expect(fetcher.mock.calls[0][0]).toBe("/api/ai-assistance/review");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(input);
  });
  it("does not call the API when local normalization fails", async () => {
    vi.mocked(preparePhotoUpload).mockRejectedValueOnce(
      new Error("photos.error.decode"),
    );
    const fetcher = vi.fn<typeof fetch>();
    const client = createAiAssistanceClient({
      token: async () => "fixture",
      fetcher,
    });
    expect(await client.extractMenu(file(), options)).toEqual({
      status: "failed",
      code: "invalid_photo",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
