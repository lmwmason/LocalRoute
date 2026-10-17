import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

describe("contribution provider search", () => {
  let server: ViteDevServer, browser: Browser, base: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      envDir: false,
      envPrefix: "CONTRIBUTION_FIXTURE_NO_ENV_",
      cacheDir: "/tmp/localroute-contribution-search-cache",
      plugins: [react()],
      logLevel: "silent",
      define: { "import.meta.env.VITE_DATA_MODE": '"live"' },
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Fixture missing");
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch();
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });
  for (const language of ["ko", "en"]) {
    it(`${language}: gates disabled search and keeps existing/manual entry usable`, async () => {
      const context = await browser.newContext({
        viewport: { width: 360, height: 844 },
      });
      try {
        let calls = 0;
        await context.addInitScript(
          (lang) => localStorage.setItem("localroute.language", lang),
          language,
        );
        await context.route("**/*", (route) => {
          const url = new URL(route.request().url());
          if (url.pathname === "/api/health")
            return route.fulfill({ json: { capabilities: { search: false } } });
          if (url.pathname === "/api/search") {
            calls++;
            return route.abort();
          }
          return url.origin === base && !url.pathname.startsWith("/api/")
            ? route.continue()
            : route.abort();
        });
        const page = await context.newPage();
        await page.goto(`${base}/tests/contribution-search-harness.html`);
        await expect
          .poll(() =>
            page
              .getByText(
                language === "ko"
                  ? /검색이 아직 활성화되지/
                  : /search is not enabled/,
              )
              .count(),
          )
          .toBe(1);
        await page.locator(".search-field input").fill("Local");
        await page.getByRole("button", { name: /Local restaurant/ }).click();
        expect(await page.locator(".selected-place").textContent()).toContain(
          "Local restaurant",
        );
        expect(calls).toBe(0);
        await page.locator(".back-link").click();
        await page
          .getByRole("button", {
            name: language === "ko" ? /직접 입력/ : /enter details/i,
          })
          .click();
        expect(await page.locator("input[required]").count()).toBeGreaterThan(
          0,
        );
      } finally {
        await context.close();
      }
    }, 20000);
    it(`${language}: selects verified provider identity once and clears stale/failed results`, async () => {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      try {
        const queries: string[] = [];
        await context.addInitScript(
          (lang) => localStorage.setItem("localroute.language", lang),
          language,
        );
        await context.route("**/*", async (route) => {
          const url = new URL(route.request().url());
          if (url.pathname === "/api/health")
            return route.fulfill({ json: { capabilities: { search: true } } });
          if (url.pathname === "/api/search") {
            const q = url.searchParams.get("q")!;
            queries.push(q);
            if (q === "failure")
              return route.fulfill({
                status: 503,
                json: { error: "private provider detail" },
              });
            if (q === "empty") return route.fulfill({ json: { places: [] } });
            if (q === "older")
              await new Promise((resolve) => setTimeout(resolve, 600));
            return route
              .fulfill({
                json: {
                  places: [
                    {
                      id: `heyyumi:${q}`,
                      name: `${q} restaurant`,
                      address: "Verified provider address",
                      lat: 37.56,
                      lng: 126.99,
                      kind: "restaurant",
                      category: "한식",
                      source: "heyyumi",
                      candidateToken: "signed-provider-candidate",
                      tags: [],
                      endorsements: [],
                      rating: null,
                      reviewCount: 0,
                    },
                  ],
                },
              })
              .catch(() => {});
          }
          return url.origin === base && !url.pathname.startsWith("/api/")
            ? route.continue()
            : route.abort();
        });
        const page = await context.newPage();
        await page.goto(`${base}/tests/contribution-search-harness.html`);
        const input = page.locator(".search-field input");
        await input.fill("older");
        await expect.poll(() => queries.includes("older")).toBe(true);
        await input.fill("newer");
        await page.getByRole("button", { name: /newer restaurant/ }).waitFor();
        expect(
          await page.getByRole("button", { name: /older restaurant/ }).count(),
        ).toBe(0);
        await input.fill("x");
        expect(
          await page.getByRole("button", { name: /newer restaurant/ }).count(),
        ).toBe(0);
        await input.fill("failure");
        await page
          .getByText(
            language === "ko"
              ? /지금 HeyYumi 검색을 이용할 수/
              : /HeyYumi search is unavailable/,
          )
          .waitFor();
        expect(await page.getByText("private provider detail").count()).toBe(0);
        await input.fill("empty");
        await page
          .getByText(
            language === "ko"
              ? /HeyYumi 검색 결과가 없어요/
              : /No HeyYumi results/,
          )
          .waitFor();
        await input.fill("chosen");
        await page.getByRole("button", { name: /chosen restaurant/ }).click();
        const draft = await page.evaluate(() =>
          JSON.parse(
            sessionStorage.getItem("localroute.contribution.draft.v1")!,
          ),
        );
        expect(draft.selected.candidateToken).toBe("signed-provider-candidate");
        expect(draft.name).toBe("chosen restaurant");
        expect(draft.address).toBe("Verified provider address");
        expect(draft.lat).toBe("37.56");
        expect(draft.manual).toBe(false);
        expect(
          await page
            .locator('.photo-upload input[type="file"]')
            .getAttribute("required"),
        ).not.toBeNull();
        expect(
          await page
            .locator('.photo-upload input[type="file"]')
            .getAttribute("aria-required"),
        ).toBe("true");
        expect(
          await page.locator('input[type="file"]').count(),
        ).toBeGreaterThan(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBeLessThanOrEqual(1);
      } finally {
        await context.close();
      }
    }, 30000);
  }
});
