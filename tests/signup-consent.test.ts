import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LEGAL_VERSION } from "../shared/legal";
import {
  SIGNUP_CONSENT_KEY,
  SIGNUP_CONSENT_TTL_MS,
  readSignupConsent,
  saveSignupConsent,
} from "../src/legal/signup-consent";
import { requestLegalConsent } from "../src/legal/client";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../src/supabase", () => ({
  supabase: { auth: { getSession } },
}));
const email = "traveler@example.com";
const choices = {
  terms: true,
  privacy: true,
  supabaseTransfer: true,
  adult: true,
};
const missing = {
  current: false,
  version: null,
  recordedAt: null,
  publicLocalArea: false,
};
const current = {
  current: true,
  version: LEGAL_VERSION,
  recordedAt: "2026-10-17T06:00:00.000Z",
  publicLocalArea: false,
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let values: Map<string, string>;
let storage: Storage;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  values = new Map();
  storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  getSession.mockResolvedValue({
    data: {
      session: {
        access_token: "fixture-token",
        user: {
          id: "fixture-user",
          email,
          email_confirmed_at: "2026-10-17T06:00:00.000Z",
        },
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
function save(language: "ko" | "en" = "en") {
  expect(saveSignupConsent({ email, language, choices })).toBe(true);
  return readSignupConsent(email)!;
}
function alter(update: (draft: Record<string, unknown>) => void) {
  const draft = JSON.parse(values.get(SIGNUP_CONSENT_KEY)!);
  update(draft);
  values.set(SIGNUP_CONSENT_KEY, JSON.stringify(draft));
}

describe("short-lived signup choices", () => {
  it("binds normalized email, original language and a stable id with no area publication", () => {
    save();
    const draft = readSignupConsent(" TRAVELER@EXAMPLE.COM ")!;
    expect(draft).toMatchObject({
      ...choices,
      version: LEGAL_VERSION,
      language: "en",
      publicLocalArea: false,
    });
    expect(readSignupConsent(email)?.requestId).toBe(draft.requestId);
    expect(readSignupConsent("another@example.com")).toBeNull();
  });
  it.each(["terms", "privacy", "supabaseTransfer", "adult"] as const)(
    "does not save a missing required choice: %s",
    (key) => {
      expect(
        saveSignupConsent({
          email,
          language: "ko",
          choices: { ...choices, [key]: false },
        }),
      ).toBe(false);
      expect(readSignupConsent(email)).toBeNull();
    },
  );
  it.each([
    ["old version", { version: "2020-01-01" }],
    ["incomplete choices", { adult: undefined }],
    ["false choice", { privacy: false }],
    ["wrong choice type", { terms: "true" }],
    ["unexpected publication", { publicLocalArea: true }],
    ["invalid request ID", { requestId: "not-a-uuid" }],
    ["invalid language", { language: "fr" }],
  ])("rejects a malformed draft: %s", (_label, change) => {
    save();
    alter((draft) => {
      draft.payload = { ...(draft.payload as object), ...change };
    });
    expect(readSignupConsent(email)).toBeNull();
  });
  it("rejects expired, future-created and extended-expiry drafts", () => {
    save();
    const raw = values.get(SIGNUP_CONSENT_KEY)!;
    const saved = JSON.parse(raw);
    expect(
      readSignupConsent(email, storage, saved.createdAt + SIGNUP_CONSENT_TTL_MS),
    ).toBeNull();
    values.set(SIGNUP_CONSENT_KEY, raw);
    expect(readSignupConsent(email, storage, saved.createdAt - 1)).toBeNull();
    values.set(SIGNUP_CONSENT_KEY, raw);
    alter((draft) => {
      draft.expiresAt = (draft.expiresAt as number) + 1;
    });
    expect(readSignupConsent(email)).toBeNull();
  });
  it("fails safely when storage is blocked or malformed", () => {
    const blocked = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    };
    expect(saveSignupConsent({ email, language: "ko", choices }, blocked)).toBe(
      false,
    );
    expect(readSignupConsent(email, blocked)).toBeNull();
    values.set(SIGNUP_CONSENT_KEY, "invalid-json");
    expect(readSignupConsent(email)).toBeNull();
  });
});

describe("verified server recording", () => {
  it("records matching choices only after GET, preserves original language and clears on success", async () => {
    const draft = save("en");
    fetchMock.mockResolvedValueOnce(response(missing));
    fetchMock.mockResolvedValueOnce(response(current));
    expect(await requestLegalConsent()).toEqual(current);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer fixture-token" },
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(draft);
    expect(values.has(SIGNUP_CONSENT_KEY)).toBe(false);
  });
  it("keeps the same requestId after a failed POST for an idempotent retry", async () => {
    const draft = save();
    fetchMock.mockResolvedValueOnce(response(missing));
    fetchMock.mockResolvedValueOnce(response({}, 503));
    await expect(requestLegalConsent()).rejects.toThrow("LEGAL_UNAVAILABLE");
    expect(readSignupConsent(email)?.requestId).toBe(draft.requestId);
    fetchMock.mockResolvedValueOnce(response(missing));
    fetchMock.mockResolvedValueOnce(response(current));
    expect(await requestLegalConsent()).toEqual(current);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).requestId).toBe(
      draft.requestId,
    );
  });
  it("shares concurrent nested-gate checks and records once", async () => {
    const draft = save();
    fetchMock.mockResolvedValueOnce(response(missing));
    fetchMock.mockResolvedValueOnce(response(current));
    expect(
      await Promise.all([requestLegalConsent(), requestLegalConsent()]),
    ).toEqual([current, current]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).requestId).toBe(
      draft.requestId,
    );
  });
  it("falls back to explicit choices when browser storage is unavailable", async () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("storage blocked");
      },
    });
    fetchMock.mockResolvedValueOnce(response(missing));
    expect(await requestLegalConsent()).toEqual(missing);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not accept a POST that failed to record current consent", async () => {
    const draft = save();
    fetchMock.mockResolvedValueOnce(response(missing));
    fetchMock.mockResolvedValueOnce(response(missing));
    await expect(requestLegalConsent()).rejects.toThrow("LEGAL_UNAVAILABLE");
    expect(readSignupConsent(email)?.requestId).toBe(draft.requestId);
  });
  it("does not POST if server consent is already current", async () => {
    save();
    fetchMock.mockResolvedValueOnce(response(current));
    expect(await requestLegalConsent()).toEqual(current);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readSignupConsent(email)).toBeNull();
  });
  it.each(["other-email", "unverified-email", "expired", "old-version"])(
    "does not POST for %s",
    async (scenario) => {
      save();
      if (scenario === "other-email" || scenario === "unverified-email")
        getSession.mockResolvedValue({
          data: {
            session: {
              access_token: "fixture-token",
              user: {
                email: scenario === "other-email" ? "other@example.com" : email,
                email_confirmed_at:
                  scenario === "unverified-email" ? null : "confirmed",
              },
            },
          },
        });
      if (scenario === "expired")
        alter((draft) => {
          draft.createdAt = Date.now() - SIGNUP_CONSENT_TTL_MS - 1;
          draft.expiresAt = (draft.createdAt as number) + SIGNUP_CONSENT_TTL_MS;
        });
      if (scenario === "old-version")
        alter((draft) => {
          draft.payload = { ...(draft.payload as object), version: "old" };
        });
      fetchMock.mockResolvedValueOnce(response(missing));
      expect(await requestLegalConsent()).toEqual(missing);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("does not POST when the server rejects the authenticated GET", async () => {
    const draft = save();
    fetchMock.mockResolvedValueOnce(response({}, 403));
    await expect(requestLegalConsent()).rejects.toThrow("LEGAL_UNAVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readSignupConsent(email)?.requestId).toBe(draft.requestId);
  });
  it("cannot use a draft without a session", async () => {
    save();
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(requestLegalConsent()).rejects.toThrow(
      "LEGAL_VERIFIED_EMAIL_REQUIRED",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
