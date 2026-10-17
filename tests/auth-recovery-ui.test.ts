import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { control } from "./auth-recovery-sdk";

describe("PKCE recovery in the real App with mocked Auth", () => {
  let browser: Browser, server: ViteDevServer, base: string;
  const contexts: BrowserContext[] = [];
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      logLevel: "silent",
      plugins: [
        {
          name: "auth-fixture-config",
          enforce: "pre",
          load: async (id) =>
            id.split("?")[0] === resolve("src/config.ts")
              ? readFile(resolve("tests/auth-recovery-config.ts"), "utf8")
              : null,
        },
        react(),
      ],
      resolve: {
        alias: [
          {
            find: "@supabase/supabase-js",
            replacement: resolve("tests/auth-recovery-sdk.ts"),
          },
        ],
      },
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("No local fixture server");
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  }, 30000);
  afterAll(async () => {
    for (const context of contexts) await context.close();
    await browser?.close();
    await server?.close();
  });
  async function setup(language = "en", width = 390, draft = false) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    contexts.push(context);
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const logs: string[] = [],
      external: string[] = [];
    page.on("console", (msg) => logs.push(msg.text()));
    page.on("pageerror", (error) => logs.push(error.message));
    await context.routeWebSocket("**", (socket) => socket.close());
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== base) {
        external.push(url.origin);
        return route.abort();
      }
      if (url.pathname.startsWith("/api/"))
        return route.fulfill({
          status: 503,
          json: { error: "Mock-only test boundary" },
        });
      if (route.request().method() !== "GET") return route.abort();
      return route.continue();
    });
    await context.addInitScript(
      ({ language, draft }) => {
        localStorage.setItem("localroute.language", language);
        if (
          draft &&
          !sessionStorage.getItem("localroute.contribution.draft.v1")
        )
          sessionStorage.setItem(
            "localroute.contribution.draft.v1",
            JSON.stringify({
              expires: Date.now() + 3600000,
              requestId: "90000000-0000-4000-8000-000000000090",
              step: "write",
              manual: true,
              kind: "restaurant",
              name: "QA draft place",
              address: "QA draft address",
              lat: "37.5",
              lng: "127",
              text: "Preserve this contribution draft.",
            }),
          );
      },
      { language, draft },
    );
    return { page, context, logs, external };
  }
  const fixture = (page: Page) =>
    page.evaluate(() => {
      const control = Reflect.get(
        window,
        "__pkceFixture",
      ) as typeof import("./auth-recovery-sdk").control;
      return control.counts;
    });
  async function action(page: Page, action: keyof typeof control) {
    await page.evaluate((action) => {
      const fixture = Reflect.get(window, "__pkceFixture") as Record<
        string,
        () => void
      >;
      fixture[action]();
    }, action);
  }
  const alert = (page: Page, ko = false) =>
    page.getByRole("alert", {
      name: ko ? "이메일 인증 복구" : "Email verification recovery",
    });

  for (const width of [360, 390]) {
    it(`shows safe Korean/English recovery and a focused re-request action at ${width}px`, async () => {
      for (const language of ["ko", "en"]) {
        for (const scenario of ["expired", "missing", "network", "unknown"]) {
          const ko = language === "ko",
            { page, context, logs } = await setup(language, width);
          await page.goto(
            `${base}/?code=private-auth-code&fixture=${scenario}`,
          );
          await alert(page, ko).waitFor();
          const text = await alert(page, ko).innerText();
          expect(text).toContain(
            scenario === "expired"
              ? ko
                ? "이미 사용"
                : "already been used"
              : scenario === "missing"
                ? ko
                  ? "브라우저 정보"
                  : "browser verification information"
                : scenario === "network"
                  ? ko
                    ? "연결 문제"
                    : "connection problem"
                  : ko
                    ? "확인하지 못했어요"
                    : "could not verify",
          );
          expect(page.url()).not.toContain("code=");
          expect(await fixture(page)).toMatchObject({ exchange: 1, mail: 0 });
          for (const privateValue of [
            "private-auth-code",
            "private-provider-message",
            "private-callback@example.invalid",
            "private-token-first",
          ]) {
            expect(await page.locator("body").innerText()).not.toContain(
              privateValue,
            );
            expect(logs.join(" ")).not.toContain(privateValue);
          }
          const button = alert(page, ko).getByRole("button", {
            name: ko ? "로그인 링크 다시 요청" : "Request a new sign-in link",
          });
          await button.scrollIntoViewIfNeeded();
          const box = await button.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await button.click();
          await page.waitForFunction(
            () =>
              document.querySelector('.login-form input[type="email"]') ===
              document.activeElement,
          );
          expect((await fixture(page)).mail).toBe(0);
          await context.close();
        }
      }
    }, 60000);
  }
  it("handles error/error_code query and hash URLs without exchanging; recovery persists beyond a toast", async () => {
    const { page, context } = await setup();
    await page.goto(
      `${base}/?error=access_denied&error_code=otp_expired&error_description=private-provider-message&fixture=expired#access_token=private-token-first`,
    );
    await alert(page).waitFor();
    expect((await fixture(page)).exchange).toBe(0);
    expect(page.url()).not.toMatch(/error|token/);
    await page.waitForTimeout(4700);
    expect(await alert(page).isVisible()).toBe(true);
    await page
      .getByRole("dialog", { name: "Sign in to LocalRoute", exact: true })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/");
    await page.reload();
    expect(await alert(page).count()).toBe(0);
    await context.close();
  });
  it("exchanges only once across StrictMode/language changes, cleans URL while pending, and navigates only after getUser", async () => {
    const { page, context } = await setup("ko");
    await page.goto(`${base}/?code=private-auth-code&fixture=pending`);
    await page.waitForFunction(
      () => Reflect.get(window, "__pkceFixture")?.counts.exchange === 1,
    );
    expect(page.url()).not.toContain("code=");
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await action(page, "release");
    await page.waitForURL((url) => url.pathname === "/plan");
    const counts = await fixture(page);
    expect(counts.exchange).toBe(1);
    expect(counts.verification).toBeGreaterThan(0);
    await page.reload();
    expect((await fixture(page)).exchange).toBe(0);
    await context.close();
  });
  it("preserves the contribution draft through failure, re-request, closing and browser back/forward", async () => {
    const { page, context } = await setup("en", 360, true);
    await page.goto(`${base}/discover`);
    await page.getByRole("textbox", { name: "Search places" }).waitFor();
    await page.goto(`${base}/?code=private-auth-code&fixture=missing`);
    await alert(page).waitFor();
    await alert(page).getByRole("button").click();
    await page
      .getByRole("dialog", { name: "Sign in to LocalRoute", exact: true })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/contribute");
    expect(await page.locator("textarea").inputValue()).toBe(
      "Preserve this contribution draft.",
    );
    await page.reload();
    expect(await page.locator("textarea").inputValue()).toBe(
      "Preserve this contribution draft.",
    );
    await page.goBack();
    await page.waitForURL((url) => url.pathname === "/discover");
    expect(page.url()).not.toContain("code=");
    await page.goForward();
    await page.waitForURL((url) => url.pathname === "/contribute");
    expect(await page.locator("textarea").inputValue()).toBe(
      "Preserve this contribution draft.",
    );
    await context.close();
  });
  it("returns a successfully verified account to its existing contribution draft", async () => {
    const { page, context } = await setup("en", 390, true);
    await page.goto(`${base}/?code=private-auth-code&fixture=success`);
    await page.waitForURL((url) => url.pathname === "/contribute");
    expect(await page.locator("textarea").inputValue()).toBe(
      "Preserve this contribution draft.",
    );
    expect((await fixture(page)).verification).toBeGreaterThan(0);
    expect(await alert(page).count()).toBe(0);
    expect(page.url()).not.toContain("code=");
    await context.close();
  });
  it.each(["cached_deleted", "callback_deleted"])(
    "still rejects a deleted account: %s",
    async (scenario) => {
      const { page, context } = await setup();
      await page.goto(
        `${base}/?fixture=${scenario}${scenario === "callback_deleted" ? "&code=private-auth-code" : ""}`,
      );
      await page.waitForFunction(
        () => Reflect.get(window, "__pkceFixture")?.counts.signOut.length > 0,
      );
      expect((await fixture(page)).signOut[0]).toEqual({ scope: "local" });
      expect(
        await page
          .getByRole("button", { name: "My account", exact: true })
          .count(),
      ).toBe(0);
      if (scenario === "callback_deleted") await alert(page).waitFor();
      await context.close();
    },
  );
  it.each(["race", "cached_race"])(
    "does not restore an earlier account after a newer sign-in: %s",
    async (scenario) => {
      const { page, context } = await setup();
      await page.goto(
        `${base}/account?fixture=${scenario}${scenario === "race" ? "&code=private-auth-code" : ""}`,
      );
      await page.waitForFunction(() => !!Reflect.get(window, "__pkceFixture"));
      if (scenario === "cached_race")
        await page.waitForFunction(
          () => Reflect.get(window, "__pkceFixture")?.counts.verification > 0,
        );
      else
        await page.waitForFunction(
          () => Reflect.get(window, "__pkceFixture")?.counts.exchange === 1,
        );
      await action(page, "switchAccount");
      await page
        .getByText("next-account@example.invalid", { exact: true })
        .waitFor();
      await action(page, scenario === "race" ? "release" : "releaseOldUser");
      await page.waitForTimeout(100);
      expect(
        await page
          .getByText("next-account@example.invalid", { exact: true })
          .isVisible(),
      ).toBe(true);
      expect(
        await page
          .getByText("private-callback@example.invalid", { exact: true })
          .count(),
      ).toBe(0);
      expect(new URL(page.url()).pathname).toBe("/account");
      await context.close();
    },
  );
  it("does not undo sign-out when an old exchange resolves late", async () => {
    const { page, context } = await setup();
    await page.goto(`${base}/discover?code=private-auth-code&fixture=race`);
    await page.waitForFunction(
      () => Reflect.get(window, "__pkceFixture")?.counts.exchange === 1,
    );
    await action(page, "signOut");
    await action(page, "release");
    await page.waitForTimeout(100);
    expect(new URL(page.url()).pathname).toBe("/discover");
    expect((await fixture(page)).verification).toBe(0);
    expect(await alert(page).count()).toBe(0);
    await context.close();
  });
});
