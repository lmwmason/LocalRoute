import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chromium,
  expect as ui,
  type Browser,
  type BrowserContext,
} from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

describe("launch landing and verified account presentation", () => {
  let browser: Browser, server: ViteDevServer, base: string;
  const contexts: BrowserContext[] = [];
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      envDir: false,
      logLevel: "silent",
      plugins: [
        {
          name: "landing-mocked-config",
          enforce: "pre",
          load: (id) =>
            id.split("?")[0] === resolve("src/config.ts")
              ? 'export const config = { demo: true, supabaseUrl: "https://pjdawapasozsrpnrtsfx.supabase.co", supabaseKey: "sb_publishable_landing_fixture_only", mapStyle: "" };'
              : null,
        },
        react(),
      ],
      resolve: {
        alias: [
          {
            find: "@supabase/supabase-js",
            replacement: resolve("tests/landing-auth.ts"),
          },
        ],
      },
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("No fixture port");
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  }, 30000);
  afterAll(async () => {
    for (const context of contexts) await context.close();
    await browser?.close();
    await server?.close();
  });
  async function setup(width = 390, language = "ko") {
    const requests: string[] = [];
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: width < 800,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    contexts.push(context);
    await context.addInitScript(
      (language) => localStorage.setItem("localroute.language", language),
      language,
    );
    await context.routeWebSocket("**", (socket) => socket.close());
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === base && url.pathname.startsWith("/api/"))
        requests.push(url.pathname);
      if (url.origin !== base || route.request().method() !== "GET")
        return route.abort();
      if (url.pathname.startsWith("/api/"))
        return route.fulfill({
          status: 503,
          json: { error: "Local fixture only" },
        });
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    return { page, context, requests };
  }
  for (const width of [360, 390, 1280]) {
    it(`supports both languages, 44px targets, keyboard, scrolling and reduced motion at ${width}px`, async () => {
      for (const language of ["ko", "en"]) {
        const ko = language === "ko",
          { page, context } = await setup(width, language);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(base);
        await ui(page.getByRole("heading", { level: 1 })).toContainText(
          ko ? "현지인의 발견" : "Local discoveries",
        );
        await ui(
          page.getByText(
            ko ? "지금은 비회원이에요" : "YOU’RE BROWSING AS A GUEST",
            { exact: true },
          ),
        ).toBeVisible();
        expect(await page.locator(".landing img").count()).toBe(1);
        expect(await page.locator(".landing-source-grid a").count()).toBe(3);
        await page
          .getByRole("button", {
            name: ko ? "지도 흐름" : "Map flow",
            exact: true,
          })
          .click();
        await ui(page.locator(".landing-map-flow")).toContainText(
          ko ? "실제 지도" : "not a geographic map",
        );
        await page
          .getByRole("button", {
            name: ko ? "시간표" : "Timetable",
            exact: true,
          })
          .click();
        await ui(page.locator(".landing-timeline")).toContainText(
          ko ? "서울숲" : "Seoul Forest",
        );
        await page.keyboard.press("Tab");
        const focus = await page.evaluate(
          () => document.activeElement?.tagName,
        );
        expect(["A", "BUTTON"]).toContain(focus);
        await page
          .getByRole("link", {
            name: ko
              ? "어떻게 만드는지 볼까요?"
              : "See how your day comes together",
            exact: true,
          })
          .click();
        expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
        for (const target of await page
          .locator(".landing a, .landing button")
          .all()) {
          if (
            !(await target.isVisible()) ||
            (await target.getAttribute("class")) === "landing-skip"
          )
            continue;
          const box = await target.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.width).toBeGreaterThanOrEqual(44);
        }
        await page.locator(".landing-footer").scrollIntoViewIfNeeded();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          await page
            .locator(".landing-primary")
            .first()
            .evaluate((node) => getComputedStyle(node).transitionDuration),
        ).toBe("0s");
        if (language === "ko" && [390, 1280].includes(width)) {
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({
            path: `/tmp/localroute-landing-${width}.png`,
            fullPage: true,
          });
        }
        expect(errors).toEqual([]);
        await context.close();
      }
    }, 45000);
  }
  it("keeps direct routes, login, legal pages, refresh and browser back working", async () => {
    const { page, context } = await setup();
    await page.goto(base);
    await page
      .getByRole("link", { name: "여행 계획하기", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/login");
    await ui(page.locator(".login-form")).toBeVisible();
    await page.goto(`${base}/plan`);
    await page.reload();
    await ui(page.locator(".main-app-shell")).toBeVisible();
    await ui(page.locator(".planning-access")).toBeVisible();
    await page
      .getByRole("button", { name: "LocalRoute 홈", exact: true })
      .click();
    await ui(page.locator(".landing")).toBeVisible();
    await page
      .getByRole("link", { name: "장소 둘러보기", exact: true })
      .last()
      .click();
    await page.waitForURL((url) => url.pathname === "/discover");
    await page.reload();
    await ui(page.getByRole("textbox", { name: "장소 검색" })).toBeVisible();
    await page.goBack();
    await ui(page.locator(".landing")).toBeVisible();
    await page
      .getByRole("link", { name: "개인정보 처리방침", exact: true })
      .click();
    await page.reload();
    await ui(
      page.getByRole("heading", {
        level: 2,
        name: "개인정보 처리방침",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(base);
    await page
      .getByRole("button", { name: "로그인 / 회원가입", exact: true })
      .click();
    await page.waitForURL((url) => url.pathname === "/login");
    await ui(page.locator(".login-form")).toBeVisible();
    await context.close();
  }, 45000);
  it("blocks guest planning and direct wizard/itinerary URLs, including demo mode, while allowing place browsing", async () => {
    for (const language of ["ko", "en"]) {
      const { page, context, requests } = await setup(360, language);
      for (const path of [
        "/plan",
        "/plan/new/4",
        "/itineraries/90000000-0000-4000-8000-000000000001",
      ]) {
        await page.goto(base + path);
        await ui(page.locator(".planning-access")).toBeVisible();
        expect(await page.locator(".planner-page, .wizard-shell").count()).toBe(
          0,
        );
        expect(
          await page.evaluate(() =>
            sessionStorage.getItem("localroute.demo.plan"),
          ),
        ).toBeNull();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
      expect(
        requests.filter((path) => /\/api\/(planning|itineraries)/.test(path)),
      ).toEqual([]);
      await page
        .getByRole("link", {
          name: language === "ko" ? "장소 둘러보기" : "Explore places",
          exact: true,
        })
        .click();
      await ui(
        page.getByRole("textbox", {
          name: language === "ko" ? "장소 검색" : "Search places",
          exact: true,
        }),
      ).toBeVisible();
      await context.close();
    }
  }, 45000);
  it("allows only email-confirmed, server-verified members into the planner", async () => {
    for (const scenario of ["member", "unconfirmed", "deleted", "anonymous"]) {
      const { page, context } = await setup(390, "en");
      await page.goto(`${base}/plan?landingAuth=${scenario}`);
      if (scenario === "member") {
        await ui(page.locator(".planner-page")).toBeVisible();
        expect(await page.locator(".planning-access").count()).toBe(0);
      } else {
        await ui(page.locator(".planning-access")).toBeVisible();
        expect(await page.locator(".planner-page").count()).toBe(0);
      }
      await context.close();
    }
  }, 30000);
  it("shows a member only after server verification; cached/deleted/unconfirmed identities do not get member actions", async () => {
    for (const scenario of ["member", "deleted", "unconfirmed", "anonymous"]) {
      const { page, context } = await setup(390, "en");
      await page.goto(`${base}/?landingAuth=${scenario}`);
      await page.waitForFunction(
        () => Reflect.get(window, "__landingAuth")?.verifications > 0,
      );
      if (scenario === "member") {
        await ui(page.getByText("SIGNED IN", { exact: true })).toBeVisible();
        expect(
          await page
            .getByRole("link", { name: "My itineraries", exact: true })
            .getAttribute("href"),
        ).toBe("/plan");
        await ui(
          page.getByRole("button", { name: "My account", exact: true }),
        ).toBeVisible();
      } else {
        await ui(
          page.getByText(
            scenario === "unconfirmed"
              ? "EMAIL VERIFICATION NEEDED"
              : "YOU’RE BROWSING AS A GUEST",
            { exact: true },
          ),
        ).toBeVisible();
        expect(
          await page
            .getByRole("link", { name: "My itineraries", exact: true })
            .count(),
        ).toBe(0);
      }
      expect(await page.locator("body").innerText()).not.toMatch(
        /private-landing/,
      );
      await context.close();
    }
  });
  it("does not promote a pending cached token or restore a signed-out user after a late verification", async () => {
    const { page, context } = await setup(360, "en");
    await page.goto(`${base}/?landingAuth=pending`);
    await ui(page.getByText("CHECKING ACCOUNT", { exact: true })).toBeVisible();
    expect(
      await page
        .getByRole("link", { name: "My itineraries", exact: true })
        .count(),
    ).toBe(0);
    await page.evaluate(() => {
      Reflect.get(window, "__landingAuth").signOut();
      Reflect.get(window, "__landingAuth").release();
    });
    await ui(
      page.getByText("YOU’RE BROWSING AS A GUEST", { exact: true }),
    ).toBeVisible();
    expect(
      await page
        .getByRole("link", { name: "My itineraries", exact: true })
        .count(),
    ).toBe(0);
    await context.close();
  });
  it("delegates root auth callbacks to the existing recovery flow even after URL scrubbing", async () => {
    const { page, context } = await setup(390, "en");
    await page.goto(`${base}/?code=private-landing-code`);
    await ui(
      page.getByRole("alert", { name: "Email verification recovery" }),
    ).toBeVisible();
    expect(page.url()).not.toContain("private-landing-code");
    expect(new URL(page.url()).pathname).toBe("/login");
    await context.close();
  });
});
