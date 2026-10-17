import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { LEGAL_VERSION } from "../shared/legal";

const placeId = "70000000-0000-4000-8000-000000000003";
const venue = {
  placeId,
  externalId: "1185547279",
  name: "Fixture cafe",
  address: "Fixture address",
  supported: true,
};
describe("Euljiro booking entry with existing reservation form (mock only)", () => {
  let browser: Browser, server: ViteDevServer, base: string;
  const contexts: BrowserContext[] = [];
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      envDir: false,
      logLevel: "silent",
      plugins: [
        {
          name: "booking-auth-fixture",
          enforce: "pre",
          load: async (id) =>
            id.split("?")[0] === resolve("src/supabase.ts")
              ? readFile(resolve("tests/euljiro-booking-auth.ts"), "utf8")
              : null,
        },
        react(),
      ],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Missing fixture address");
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  }, 30000);
  afterAll(async () => {
    for (const context of contexts) await context.close();
    await browser?.close();
    await server?.close();
  });
  async function setup({
    width = 390,
    language = "en",
    auth = "member",
    missing = false,
    support = "supported",
    legal = "current",
  } = {}) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    contexts.push(context);
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    const calls: { path: string; method: string; body: unknown }[] = [],
      external: string[] = [];
    let consentCurrent = legal === "current";
    await context.routeWebSocket("**", (socket) => socket.close());
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin !== base) {
        external.push(url.origin);
        return route.abort();
      }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      calls.push({
        path: url.pathname,
        method: request.method(),
        body: request.postDataJSON(),
      });
      if (url.pathname === "/api/me/legal-consents") {
        if (legal === "error") return route.fulfill({ status: 503, json: {} });
        if (request.method() === "POST") consentCurrent = true;
        return route.fulfill({
          json: {
            current: consentCurrent,
            version: consentCurrent ? LEGAL_VERSION : null,
            recordedAt: consentCurrent ? "2026-10-17T00:00:00Z" : null,
            publicLocalArea: false,
          },
        });
      }
      if (support === "error")
        return route.fulfill({
          status: 503,
          json: { error: "booking.providerUnavailable" },
        });
      if (url.pathname.endsWith("/capabilities"))
        return route.fulfill({ json: { enabled: support !== "disabled" } });
      if (url.pathname.includes("/venues/"))
        return route.fulfill({
          json: {
            ...venue,
            supported: support !== "unsupported",
            externalId: support === "wrongVenue" ? "wrong" : venue.externalId,
          },
        });
      if (url.pathname.endsWith("/profile"))
        return route.fulfill({ json: null });
      if (
        url.pathname.endsWith("/reservations") &&
        request.method() === "POST"
      ) {
        const input = request.postDataJSON();
        return route.fulfill({
          json: {
            ...input,
            id: "80000000-0000-4000-8000-000000000001",
            state: "pending",
            providerReference: null,
            expiresAt: null,
            updatedAt: "2026-10-17T00:00:00Z",
            revision: 1,
            reconciliationRequired: false,
          },
        });
      }
      return route.fulfill({
        status: 503,
        json: { error: "booking.unavailable" },
      });
    });
    await context.addInitScript(
      (language) => localStorage.setItem("localroute.language", language),
      language,
    );
    await page.goto(
      `${base}/tests/euljiro-booking-panel-harness.html?auth=${auth}${missing ? "&missing" : ""}`,
    );
    return { page, calls, external, context };
  }
  const submissions = <T extends { method: string; path: string }>(
    calls: T[],
  ) =>
    calls.filter(
      (call) => call.method === "POST" && call.path.endsWith("/reservations"),
    );
  async function fill(page: Page, ko: boolean) {
    await page
      .getByRole("button", {
        name: ko ? "예약하기" : "Book a table",
        exact: true,
      })
      .click();
    await page
      .getByLabel(
        ko ? "희망 일시 (한국 시간)" : "Requested date and time (Korea)",
      )
      .fill("2030-01-02T13:00");
    await page
      .getByLabel(ko ? "예약자 이름" : "Guest name", { exact: true })
      .fill("QA Guest");
    await page
      .getByLabel(ko ? "연락처" : "Contact phone", { exact: true })
      .fill("01000000000");
  }
  for (const language of ["ko", "en"])
    for (const width of [360, 390, 1280]) {
      it(`${language} ${width}px: explicit review + distinct consent, edit resets consent; pending stays pending`, async () => {
        const ko = language === "ko",
          { page, calls, external, context } = await setup({ language, width });
        await fill(page, ko);
        expect(submissions(calls)).toHaveLength(0);
        await page
          .getByRole("button", {
            name: ko ? "내용 확인" : "Review details",
            exact: true,
          })
          .click();
        const submit = page.getByRole("button", {
          name: ko ? "동의하고 예약 요청" : "Agree and request booking",
          exact: true,
        });
        expect(await submit.isDisabled()).toBe(true);
        const consent = page.getByRole("checkbox");
        await consent.check();
        await page
          .getByRole("button", { name: ko ? "수정" : "Edit", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: ko ? "내용 확인" : "Review details",
            exact: true,
          })
          .click();
        expect(await consent.isChecked()).toBe(false);
        await consent.check();
        for (const control of await page.locator("button, a, input").all()) {
          const box = await control.boundingBox();
          if (box) {
            expect(box.height).toBeGreaterThanOrEqual(44);
            expect(box.width).toBeGreaterThanOrEqual(44);
          }
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await submit.focus();
        await page.keyboard.press("Enter");
        await page
          .getByRole("status")
          .filter({
            hasText: ko
              ? "예약 요청됨 · 확정 대기"
              : "Requested · awaiting confirmation",
          })
          .waitFor();
        expect(submissions(calls)).toHaveLength(1);
        expect(submissions(calls)[0].body).toMatchObject({
          placeId,
          consent: true,
        });
        expect(
          await page
            .getByText(ko ? "예약 확정" : "Confirmed", { exact: true })
            .count(),
        ).toBe(0);
        const hire = page.getByRole("link", {
          name: ko
            ? "대관 안내 · Spacecloud"
            : "Venue-hire information · Spacecloud",
        });
        expect(await hire.getAttribute("href")).toBe(
          "https://www.spacecloud.kr/space/59739",
        );
        expect(external).toEqual([]);
        await context.close();
      });
    }
  it("missing placeId makes no Auth, legal or booking requests, including after removal", async () => {
    const { page, calls } = await setup({ missing: true });
    await page
      .getByText("Checking the LocalRoute place link.", { exact: false })
      .waitFor();
    expect(
      await page.evaluate(() => Reflect.get(window, "__bookingAuth").calls),
    ).toBe(0);
    expect(calls).toEqual([]);
    await page.evaluate(
      (id) => Reflect.get(window, "__bookingPlace")(id),
      placeId,
    );
    await page
      .getByRole("button", { name: "Book a table", exact: true })
      .waitFor();
    await page.evaluate(() => Reflect.get(window, "__bookingPlace")(undefined));
    await page
      .getByText("Checking the LocalRoute place link.", { exact: false })
      .waitFor();
    const count = calls.length;
    await page.waitForTimeout(100);
    expect(calls).toHaveLength(count);
    expect(submissions(calls)).toHaveLength(0);
  });
  it.each(["guest", "anonymous", "email", "error", "unconfigured"])(
    "gates %s before any legal or booking request",
    async (auth) => {
      const { page, calls } = await setup({ auth });
      await page
        .getByText(
          auth === "email"
            ? "Verify your email before booking."
            : auth === "error"
              ? "Unable to verify your sign-in."
              : auth === "unconfigured"
                ? "Bookings are currently disabled."
                : "Sign in to request a booking.",
          { exact: false },
        )
        .waitFor();
      expect(calls).toEqual([]);
      if (["guest", "anonymous", "email"].includes(auth))
        expect(
          await page
            .getByRole("link", {
              name:
                auth === "email" ? "Sign-in and verification help" : "Sign in",
              exact: true,
            })
            .getAttribute("href"),
        ).toBe("/login");
    },
  );
  it.each(["disabled", "unsupported", "error", "wrongVenue"])(
    "distinguishes %s and retries without submitting",
    async (support) => {
      const { page, calls } = await setup({ support });
      await page
        .getByText(
          support === "disabled"
            ? "Bookings are currently disabled."
            : support === "unsupported"
              ? "This venue currently does not support in-app bookings."
              : "Unable to check booking provider information.",
          { exact: false },
        )
        .waitFor();
      expect(
        await page
          .getByRole("button", { name: "Book a table", exact: true })
          .count(),
      ).toBe(0);
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
      expect(submissions(calls)).toHaveLength(0);
      if (support === "disabled")
        expect(calls.some((call) => call.path.includes("/venues/"))).toBe(
          false,
        );
    },
  );
  it("requires current legal consent before checking provider or opening the form", async () => {
    const { page, calls } = await setup({ legal: "missing" });
    const save = page.getByRole("button", {
      name: "Save consent settings",
      exact: true,
    });
    await save.waitFor();
    expect(await save.isDisabled()).toBe(true);
    expect(calls.every((call) => call.path === "/api/me/legal-consents")).toBe(
      true,
    );
    const checkboxes = page.getByRole("checkbox");
    for (let i = 0; i < 4; i++) await checkboxes.nth(i).check();
    await save.click();
    await page
      .getByRole("button", { name: "Book a table", exact: true })
      .waitFor();
    expect(submissions(calls)).toHaveLength(0);
    expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({
      terms: true,
      privacy: true,
      supabaseTransfer: true,
      adult: true,
    });
  });
  it("legal failure blocks booking and sign-out removes an open form", async () => {
    const failed = await setup({ legal: "error" });
    await failed.page.getByRole("alert").waitFor();
    expect(
      failed.calls.every((call) => call.path === "/api/me/legal-consents"),
    ).toBe(true);
    const { page, calls } = await setup();
    await fill(page, false);
    await page.evaluate(() => Reflect.get(window, "__bookingAuth").signOut());
    await page
      .getByText("Sign in to request a booking.", { exact: true })
      .waitFor();
    expect(await page.getByLabel("Guest name", { exact: true }).count()).toBe(
      0,
    );
    expect(submissions(calls)).toHaveLength(0);
  });
  it("does not reopen booking when an old Auth check resolves after sign-out", async () => {
    const { page, calls } = await setup({ auth: "race" });
    await page.waitForFunction(
      () => Reflect.get(window, "__bookingAuth")?.calls === 2,
    );
    await page.evaluate(() => Reflect.get(window, "__bookingAuth").signOut());
    await page
      .getByText("Sign in to request a booking.", { exact: true })
      .waitFor();
    await page.evaluate(() => Reflect.get(window, "__bookingAuth").release());
    await page.waitForTimeout(100);
    expect(calls).toEqual([]);
    expect(
      await page
        .getByText("Sign in to request a booking.", { exact: true })
        .isVisible(),
    ).toBe(true);
  });
  it("recovers from a provider outage when the user retries", async () => {
    const { page, calls } = await setup({ support: "error" });
    await page.getByRole("alert").waitFor();
    await page.route("**/api/booking/**", (route) =>
      route.fulfill({
        json: route.request().url().endsWith("/capabilities")
          ? { enabled: true }
          : venue,
      }),
    );
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page
      .getByRole("button", { name: "Book a table", exact: true })
      .waitFor();
    expect(submissions(calls)).toHaveLength(0);
  });
  it("preserves ambiguous submission failure without automatically resending", async () => {
    const { page } = await setup();
    let attempts = 0;
    await page.route("**/api/booking/reservations", (route) => {
      attempts++;
      return route.fulfill({ status: 503, json: { error: "booking.network" } });
    });
    await fill(page, false);
    await page
      .getByRole("button", { name: "Review details", exact: true })
      .click();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Agree and request booking", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "No response received." })
      .waitFor();
    await page
      .getByRole("button", { name: "Check same request", exact: true })
      .waitFor();
    await page.waitForTimeout(100);
    expect(attempts).toBe(1);
  });
});
