import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
describe("place-neutral ratings and accessible source controls", () => {
  let server: ViteDevServer, browser: Browser, base: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      envDir: false,
      envPrefix: "PLACE_UI_FIXTURE_NO_ENV_",
      cacheDir: "/tmp/localroute-place-ui-qa-cache",
      plugins: [react()],
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Fixture address missing");
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch();
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });
  for (const width of [360, 390, 1440])
    it(`keeps source targets reachable at ${width}px in both languages`, async () => {
      for (const language of ["ko", "en"]) {
        const context = await browser.newContext({
          viewport: { width, height: 844 },
          hasTouch: true,
        });
        try {
          const errors: string[] = [],
            writes: string[] = [];
          await context.addInitScript(
            (lang) => localStorage.setItem("localroute.language", lang),
            language,
          );
          await context.route("**/*", (route) => {
            const url = new URL(route.request().url());
            if (route.request().method() !== "GET") writes.push(url.pathname);
            return url.origin === base && !url.pathname.startsWith("/api/")
              ? route.continue()
              : route.abort();
          });
          const page = await context.newPage();
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto(`${base}/tests/place-ui-qa-harness.html`);
          await page
            .getByRole("group", {
              name: language === "ko" ? "장소 만족도" : "Place satisfaction",
              exact: true,
            })
            .waitFor();
          await page
            .locator("form select")
            .selectOption("00000000-0000-4000-8000-000000000098");
          await page
            .getByRole("group", {
              name:
                language === "ko"
                  ? "추천 도움 평가"
                  : "Recommendation helpfulness",
              exact: true,
            })
            .waitFor();
          const toggle = page.locator(".maplibregl-ctrl-attrib-button");
          await toggle.click();
          await toggle.click();
          for (const control of [
            page.getByRole("link", {
              name: language === "ko" ? "사진 원문" : "Photo source",
              exact: true,
            }),
            toggle,
            ...(await page.locator(".maplibregl-ctrl-attrib-inner a").all()),
            page.getByRole("button", { name: "Zoom in", exact: true }),
          ]) {
            await control.scrollIntoViewIfNeeded();
            const box = (await control.boundingBox())!;
            expect(box.width).toBeGreaterThanOrEqual(44);
            expect(box.height).toBeGreaterThanOrEqual(44);
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
          expect(errors).toEqual([]);
          expect(writes).toEqual([]);
        } finally {
          await context.close();
        }
      }
    }, 30000);
});
