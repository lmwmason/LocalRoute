import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, expect as ui, type Browser } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const item = {
  endorsementId: "00000000-0000-4000-8000-000000000010",
  versionId: "00000000-0000-4000-8000-000000000020",
  versionNumber: 2,
  text: "현지인이 추천한 점심 장소의 실제 추천 내용 · A contributor’s recommendation ".repeat(
    4,
  ),
  status: "pending",
  placeName: "실제 등록 장소 · A place with a very long name",
  ratingCount: 3,
  helpfulnessAverage: 4.3333333,
  paidLp: 20,
  pendingReviewCount: 1,
  awaitingPayoutCount: 1,
};
describe("contributor outcomes responsive and recovery states (local mocks only)", () => {
  let browser: Browser, server: ViteDevServer, base: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      envDir: false,
      logLevel: "silent",
      plugins: [
        {
          name: "no-real-auth",
          enforce: "pre",
          load: (id) =>
            id.split("?")[0] === resolve("src/supabase.ts")
              ? "export const supabase = null;"
              : null,
        },
        react(),
      ],
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
    await browser?.close();
    await server?.close();
  });

  for (const width of [360, 390, 1280])
    for (const lang of ["ko", "en"]) {
      it(`${lang}: loading, retry, version metrics, empty, auth, account switch at ${width}px`, async () => {
        const context = await browser.newContext({
          viewport: { width, height: 844 },
          reducedMotion: "reduce",
        });
        try {
          const page = await context.newPage();
          page.setDefaultTimeout(7000);
          let release!: () => void;
          const waiting = new Promise<void>((r) => {
            release = r;
          });
          let calls = 0,
            mode = "error";
          const external: string[] = [],
            errors: string[] = [];
          page.on("pageerror", (e) => errors.push(e.message));
          await context.route("**/*", async (route) => {
            const url = new URL(route.request().url());
            if (url.origin !== base) {
              external.push(url.origin);
              return route.abort();
            }
            if (url.pathname === "/api/fixture/outcomes") {
              expect(route.request().method()).toBe("GET");
              calls++;
              if (calls === 1) await waiting;
              if (mode === "error")
                return route.fulfill({ status: 503, json: {} });
              if (mode === "auth")
                return route.fulfill({ status: 401, json: {} });
              return route.fulfill({
                json: {
                  items:
                    mode === "empty" ||
                    url.searchParams.get("owner") === "other"
                      ? []
                      : [
                          item,
                          {
                            ...item,
                            versionId: null,
                            versionNumber: null,
                            text: null,
                            status: null,
                            placeName: null,
                            ratingCount: 0,
                            helpfulnessAverage: null,
                            paidLp: 0,
                            pendingReviewCount: 0,
                            awaitingPayoutCount: 0,
                            endorsementId:
                              "00000000-0000-4000-8000-000000000011",
                          },
                        ],
                },
              });
            }
            return route.continue();
          });
          await page.goto(
            `${base}/tests/contributor-outcomes-harness.html?lang=${lang}`,
          );
          await ui(page.getByRole("status")).toContainText(
            lang === "ko" ? "불러오는 중" : "Loading",
          );
          release();
          await ui(page.getByRole("alert")).toContainText(
            lang === "ko" ? "불러오지 못" : "couldn’t load",
          );
          mode = "ready";
          await page
            .getByRole("button", {
              name: lang === "ko" ? "다시 시도" : "Try again",
            })
            .click();
          await ui(page.locator("article")).toHaveCount(2);
          await ui(page.locator("article").first()).toContainText("4.3 / 5");
          await ui(page.locator("article").first()).toContainText("20 LP");
          await ui(page.locator("article").last()).toContainText(
            lang === "ko" ? "미집계" : "Not available",
          );
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          for (const button of await page
            .locator(".contributor-outcomes button")
            .all()) {
            const box = await button.boundingBox();
            expect(box!.width).toBeGreaterThanOrEqual(44);
            expect(box!.height).toBeGreaterThanOrEqual(44);
          }
          await page
            .locator(".contributor-outcomes-note")
            .scrollIntoViewIfNeeded();
          if (width < 800)
            expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
          const refresh = page.getByRole("button", {
            name: lang === "ko" ? "새로고침" : "Refresh",
          });
          await refresh.focus();
          await ui(refresh).toBeFocused();
          mode = "empty";
          await page.keyboard.press("Enter");
          await ui(page.getByRole("status")).toContainText(
            lang === "ko" ? "아직 등록한" : "haven’t added",
          );
          mode = "ready";
          await refresh.click();
          await ui(page.locator("article")).toHaveCount(2);
          await page.getByRole("button", { name: "Switch account" }).click();
          // On the first paint of a new account, old private rows have been discarded.
          await ui(page.locator("article")).toHaveCount(0);
          await ui(page.getByRole("status")).toContainText(
            lang === "ko" ? "아직 등록한" : "haven’t added",
          );
          mode = "auth";
          await refresh.click();
          await ui(page.getByRole("alert")).toContainText(
            lang === "ko" ? "로그인" : "signed in",
          );
          await page.getByRole("button", { name: "Switch account" }).click();
          expect(
            await page.locator(".contributor-outcomes button").count(),
          ).toBe(0);
          expect(external).toEqual([]);
          expect(errors).toEqual([]);
        } finally {
          await context.close();
        }
      }, 30000);
    }
});
