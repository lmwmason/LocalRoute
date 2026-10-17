import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

describe("public Euljiro example page", () => {
  let server: ViteDevServer, browser: Browser, base: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      envDir: false,
      envPrefix: "EXAMPLE_FIXTURE_NO_ENV_",
      cacheDir: "/tmp/localroute-euljiro-example-vite-cache",
      plugins: [react()],
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Missing fixture address");
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch();
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });
  for (const width of [360, 390, 1440])
    it(`works in Korean and English at ${width}px without submitting a booking or charging LP`, async () => {
      for (const language of ["ko", "en"]) {
        const context = await browser.newContext({
          viewport: { width, height: 844 },
          hasTouch: true,
          reducedMotion: "reduce",
          serviceWorkers: "block",
        });
        try {
          const page = await context.newPage(),
            errors: string[] = [],
            writes: string[] = [],
            bookingRequests: string[] = [];
          page.setDefaultTimeout(10000);
          page.on("pageerror", (error) => errors.push(error.message));
          await context.route("**/*", (route) => {
            const request = route.request(),
              url = new URL(request.url());
            if (request.method() !== "GET") writes.push(url.pathname);
            if (
              url.pathname.startsWith("/api/") &&
              url.pathname.includes("booking")
            )
              bookingRequests.push(url.pathname);
            if (url.pathname === "/api/places")
              return route.fulfill({
                json: {
                  places: [
                    {
                      id: "5e5098cd-0fbd-43c7-b9f4-5b81d8e3720c",
                      name: "하이드미플리즈 을지로점",
                      address: "서울 중구 을지로11길 33 2층",
                      displayMedia: {
                        assetType: "photo",
                        assetPath:
                          "/place-display-media/hidemeplease-euljiro-founder.jpg",
                        alt: "Canonical database image fixture",
                        credit: "Fixture photographer",
                        licenseLabel: "CC BY-SA 4.0",
                        sourceUrl: "https://example.test/verified-source",
                        observedAt: "2026-10-17T05:15:37Z",
                        changes:
                          "Test fixture only; image is not evidence of a cafe visit",
                      },
                      officialSources: [
                        {
                          url: "https://www.spacecloud.kr/space/59739",
                          observedAt: "2026-10-17T05:15:37Z",
                        },
                      ],
                    },
                  ],
                },
              });
            if (url.origin !== base || url.pathname.startsWith("/api/"))
              return route.abort();
            if (url.pathname === "/examples/euljiro")
              return route.fulfill({
                contentType: "text/html",
                body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/euljiro-example-harness.tsx"></script></body></html>',
              });
            return route.continue();
          });
          await context.routeWebSocket("**", (socket) => socket.close());
          await page.addInitScript((lang) => {
            localStorage.setItem("localroute.language", lang);
            Object.defineProperty(navigator, "clipboard", {
              configurable: true,
              value: {
                writeText: async (value: string) => {
                  (window as unknown as { copied: string }).copied = value;
                },
              },
            });
          }, language);
          await page.goto(`${base}/tests/euljiro-example-harness.html`);
          await page
            .locator(".example-stop-select")
            .first()
            .waitFor()
            .catch((error) => {
              throw new Error(
                `${String(error)}; browser errors: ${JSON.stringify(errors)}`,
              );
            });
          await page
            .locator(
              '.example-place-actions a[href="/places/5e5098cd-0fbd-43c7-b9f4-5b81d8e3720c"]',
            )
            .waitFor();
          expect(await page.locator(".example-stop").count()).toBe(3);
          const booking = page.locator(".euljiro-booking-panel");
          await booking
            .getByText(
              language === "ko"
                ? /현재 예약 기능이 꺼져/
                : /Bookings are currently disabled/,
            )
            .waitFor();
          expect(await booking.locator("form,input,button").count()).toBe(0);
          expect(
            await booking
              .locator('a[href="https://www.spacecloud.kr/space/59739"]')
              .count(),
          ).toBe(1);
          const canonicalImage = page
            .locator(".example-stop")
            .nth(1)
            .locator(".example-stop-image img");
          await canonicalImage.waitFor();
          await canonicalImage.scrollIntoViewIfNeeded();
          expect(await canonicalImage.getAttribute("src")).toBe(
            "/place-display-media/hidemeplease-euljiro-founder.jpg",
          );
          expect(await canonicalImage.getAttribute("alt")).toBe(
            "Canonical database image fixture",
          );
          await expect
            .poll(() =>
              canonicalImage.evaluate(
                (image) =>
                  (image as HTMLImageElement).complete &&
                  (image as HTMLImageElement).naturalWidth > 0,
              ),
            )
            .toBe(true);
          expect(
            await page
              .locator('.example-place-actions a[href^="/places/"]')
              .count(),
          ).toBe(2);
          await page.locator(".example-stop-select").last().tap();
          expect(
            await page
              .locator(".example-stop-select")
              .last()
              .getAttribute("aria-pressed"),
          ).toBe("true");
          await page
            .locator(".leaflet-marker-icon")
            .first()
            .waitFor({ timeout: 20000 });
          await page.locator(".map-panel .map-pin").first().click();
          expect(
            await page
              .locator(".example-stop-select")
              .first()
              .getAttribute("aria-pressed"),
          ).toBe("true");
          await page.locator(".example-actions button").click();
          expect(
            await page.evaluate(
              () => (window as unknown as { copied: string }).copied,
            ),
          ).toBe(`${base}/examples/euljiro`);
          for (const control of [
            page.locator(".example-stop-select").first(),
            page.locator(".example-actions button"),
          ]) {
            await control.scrollIntoViewIfNeeded();
            const box = (await control.boundingBox())!;
            expect(box.height).toBeGreaterThanOrEqual(44);
            expect(box.width).toBeGreaterThanOrEqual(44);
            expect(
              await control.evaluate((element) => {
                const r = element.getBoundingClientRect(),
                  hit = document.elementFromPoint(
                    r.x + r.width / 2,
                    r.y + r.height / 2,
                  );
                return element === hit || element.contains(hit);
              }),
            ).toBe(true);
          }
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          ).toBeLessThanOrEqual(1);
          expect(writes).toEqual([]);
          expect(bookingRequests).toEqual([]);
          expect(errors).toEqual([]);
        } finally {
          await context.close();
        }
      }
    }, 60000);
});
