import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  exchange: vi.fn(),
  create: vi.fn(),
  configured: true,
}));
vi.mock("../src/config", () => ({
  get config() {
    return {
      supabaseUrl: "https://pjdawapasozsrpnrtsfx.supabase.co",
      supabaseKey: fixture.configured
        ? "sb_publishable_test_only_public_fixture"
        : "",
    };
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    fixture.create(...args);
    return { auth: { exchangeCodeForSession: fixture.exchange } };
  },
}));

let href: string;
let state: unknown;
beforeEach(() => {
  vi.resetModules();
  fixture.create.mockClear();
  fixture.exchange.mockReset();
  fixture.configured = true;
  href = "https://localroute.test/discover";
  state = { idx: 2, usr: { overlay: true, backgroundPath: "/contribute" } };
  vi.stubGlobal("window", {
    location: {
      get href() {
        return href;
      },
    },
    history: {
      get state() {
        return state;
      },
      replaceState: vi.fn((next, _title, path) => {
        state = next;
        href = new URL(path, href).href;
      }),
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Remote access forbidden");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PKCE callback normalization (mock Auth only)", () => {
  it("handles a standalone error code and removes accompanying sensitive auth fields", async () => {
    href =
      "https://localroute.test/?error=otp_expired&email=private%40example.test&token_hash=private-hash&type=magiclink&view=explore";
    const { exchangeAuthCode } = await import("../src/supabase");
    expect(await exchangeAuthCode()).toMatchObject({
      error: { recoveryReason: "expired" },
    });
    expect(href).toBe("https://localroute.test/?view=explore");
    expect(fixture.exchange).not.toHaveBeenCalled();
  });
  it("keeps PKCE and explicit callback exchange enabled without implicit URL sessions", async () => {
    await import("../src/supabase");
    expect(fixture.create.mock.calls[0][2]).toMatchObject({
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
        persistSession: true,
      },
    });
  });
  it.each([
    "otp_expired",
    "flow_state_expired",
    "flow_state_not_found",
    "invite_not_found",
  ])(
    "handles URL %s without exchanging or echoing error descriptions",
    async (code) => {
      href = `https://localroute.test/plan?error=access_denied&error_code=${code}&error_description=private-email%40example.test%20secret-token&view=explore#main`;
      const { exchangeAuthCode } = await import("../src/supabase");
      const result = exchangeAuthCode("");
      expect(href).toBe("https://localroute.test/plan?view=explore#main");
      expect(await result).toEqual({
        data: { session: null },
        error: { recoveryReason: "expired" },
      });
      expect(fixture.exchange).not.toHaveBeenCalled();
      expect(state).toEqual({
        idx: 2,
        usr: { overlay: true, backgroundPath: "/contribute" },
      });
    },
  );
  it("cleans hash errors/tokens and preserves unrelated route parameters; error wins over code", async () => {
    href =
      "https://localroute.test/login?place=one&code=secret-code#error=denied&error_code=otp_expired&error_description=private&access_token=private-access&refresh_token=private-refresh&type=magiclink";
    const { exchangeAuthCode } = await import("../src/supabase");
    expect(await exchangeAuthCode("secret-code")).toMatchObject({
      error: { recoveryReason: "expired" },
    });
    expect(href).toBe("https://localroute.test/login?place=one");
    expect(fixture.exchange).not.toHaveBeenCalled();
  });
  it("never falls back to accepting implicit URL tokens", async () => {
    href =
      "https://localroute.test/#access_token=private&refresh_token=private&type=magiclink";
    const { exchangeAuthCode } = await import("../src/supabase");
    expect(await exchangeAuthCode()).toMatchObject({
      error: { recoveryReason: "exchange" },
    });
    expect(href).toBe("https://localroute.test/");
    expect(fixture.exchange).not.toHaveBeenCalled();
  });
  it.each([
    [{ code: "pkce_code_verifier_not_found", message: "private" }, "verifier"],
    [
      { name: "AuthPKCECodeVerifierMissingError", message: "private" },
      "verifier",
    ],
    [{ code: "bad_code_verifier", message: "private" }, "verifier"],
    [{ name: "AuthRetryableFetchError", message: "private" }, "network"],
    [{ code: "request_timeout", message: "private" }, "network"],
    [
      { code: "unknown", message: "expired secret-email@example.test" },
      "exchange",
    ],
  ] as const)("maps only allowlisted fields: %j", async (error, reason) => {
    href = "https://localroute.test/?code=secret-code";
    fixture.exchange.mockResolvedValueOnce({ data: { session: null }, error });
    const { exchangeAuthCode } = await import("../src/supabase");
    expect(await exchangeAuthCode()).toEqual({
      data: { session: null },
      error: { recoveryReason: reason },
    });
    expect(href).toBe("https://localroute.test/");
  });
  it("handles rejected network promises without logging private provider errors", async () => {
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    href = "https://localroute.test/?code=private-code";
    fixture.exchange.mockRejectedValueOnce(
      new TypeError("private-email@example.test private-token"),
    );
    const { exchangeAuthCode } = await import("../src/supabase");
    expect(await exchangeAuthCode()).toEqual({
      data: { session: null },
      error: { recoveryReason: "network" },
    });
    expect(logs.flatMap((spy) => spy.mock.calls)).toEqual([]);
  });
  it("deduplicates one code in StrictMode but permits a subsequent new login link", async () => {
    const session = {
      user: { id: "test-member" },
      access_token: "private-session",
    };
    fixture.exchange.mockResolvedValue({ data: { session }, error: null });
    href = "https://localroute.test/?code=one";
    const { exchangeAuthCode } = await import("../src/supabase");
    const first = exchangeAuthCode("one");
    expect(exchangeAuthCode("one")).toBe(first);
    expect(await first).toEqual({ data: { session }, error: null });
    href = "https://localroute.test/?code=two";
    await exchangeAuthCode("two");
    expect(fixture.exchange.mock.calls.map((call) => call[0])).toEqual([
      "one",
      "two",
    ]);
    expect(href).toBe("https://localroute.test/");
  });
  it("fails safely when configuration is unavailable or an exchange has no session", async () => {
    fixture.configured = false;
    href = "https://localroute.test/?code=private";
    let module = await import("../src/supabase");
    expect(await module.exchangeAuthCode()).toMatchObject({
      error: { recoveryReason: "unavailable" },
    });
    expect(href).toBe("https://localroute.test/");
    fixture.configured = true;
    vi.resetModules();
    fixture.exchange.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    module = await import("../src/supabase");
    expect(await module.exchangeAuthCode("new-code")).toMatchObject({
      error: { recoveryReason: "exchange" },
    });
  });
  it("ignores a normal route, including its hash, and never calls Auth", async () => {
    href = "https://localroute.test/discover?view=explore#main";
    const { exchangeAuthCode, readAuthCallback } =
      await import("../src/supabase");
    expect(readAuthCallback(href)).toMatchObject({
      present: false,
      cleanPath: "/discover?view=explore#main",
    });
    expect(exchangeAuthCode()).toBeUndefined();
    expect(fixture.exchange).not.toHaveBeenCalled();
  });
});
