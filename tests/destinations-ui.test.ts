import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { destinationId, kakaoAddressEndpoint } from "../shared/destinations";

function destination(label = "충북 충주시 살미면") {
  const [region1, region2, region3] = label.split(" ");
  return {
    id: destinationId(label),
    label,
    country: "KR",
    level: "township",
    region1,
    region2,
    region3,
    lat: 36.9,
    lng: 127.9,
    source: {
      provider: "kakao",
      endpoint: kakaoAddressEndpoint,
      addressType: "REGION",
      observedAt: "2026-10-17T00:00:00Z",
      verification: "provider",
      coordinateMeaning: "region_representative",
    },
  };
}
const result = (label?: string) => ({
  destinations: [destination(label)],
  page: 1,
  hasMore: false,
});
describe("DestinationSearch browser interaction (only local mocked API)", () => {
  let browser: Browser, server: ViteDevServer, base: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      envFile: false,
      cacheDir: "node_modules/.vite/destinations-tests",
      optimizeDeps: {
        noDiscovery: true,
        include: ["react", "react-dom/client", "react/jsx-dev-runtime", "zod"],
      },
      plugins: [
        react(),
        {
          name: "destination-test-harness",
          configureServer(vite) {
            vite.middlewares.use(async (req, res, next) => {
              if (req.url?.split("?")[0] !== "/__destinations_test") {
                next();
                return;
              }
              const html = await vite.transformIndexHtml(
                "/__destinations_test.html",
                `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{margin:0;padding:16px;font-family:sans-serif}button:focus-visible,input:focus-visible{outline:3px solid #2464c5}</style></head><body><div id="root"></div><script type="module">
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {DestinationSearch} from '/src/planner/DestinationSearch.tsx';
        function Harness(){const [value,setValue]=React.useState(null);return React.createElement('form',{onSubmit:e=>{e.preventDefault();document.body.dataset.submitted='yes'}},React.createElement(DestinationSearch,{value,onChange:setValue,language:new URL(location.href).searchParams.get('lang')||'ko'}),React.createElement('output',null,value?.label||''));}
        createRoot(document.getElementById('root')).render(React.createElement(Harness));
      </script></body></html>`,
              );
              res.setHeader("Content-Type", "text/html");
              res.end(html);
            });
          },
        },
      ],
      server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
      logLevel: "error",
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Missing local test port");
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });
  async function open(width = 390, language = "ko") {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) =>
      route.request().url().startsWith(base) ? route.continue() : route.abort(),
    );
    await page.goto(`${base}/__destinations_test?lang=${language}`);
    try {
      await page.locator("input").waitFor();
    } catch (error) {
      throw new Error(
        `${String(error)}; browser errors: ${errors.join("; ")}`,
        { cause: error },
      );
    }
    return { context, page };
  }
  async function mock(page: Page, payload: unknown, status = 200) {
    await page.route("**/api/destinations?*", (route) =>
      route.fulfill({ status, json: payload }),
    );
  }
  for (const width of [360, 390, 1440]) {
    it(`selects, clears, scrolls and supports keyboard/touch at ${width}px in both languages`, async () => {
      for (const language of ["ko", "en"]) {
        const { context, page } = await open(width, language);
        const destinations = Array.from({ length: 20 }, (_, i) =>
          destination(`충북 충주시 테스트${"가".repeat(i + 1)}면`),
        );
        await mock(page, { destinations, page: 1, hasMore: false });
        await page.locator("input").fill("충주시");
        await page.locator("li button").first().waitFor();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        for (const el of [
          page.locator("input"),
          page.locator("li button").first(),
        ]) {
          const box = await el.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.width).toBeGreaterThanOrEqual(44);
        }
        await page.locator("input").focus();
        await page.keyboard.press("ArrowDown");
        expect(
          await page
            .locator("li button")
            .first()
            .evaluate((el) => el === document.activeElement),
        ).toBe(true);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        expect(await page.locator("output").textContent()).toBe(
          destinations[1].label,
        );
        expect(await page.locator("[role=status]").textContent()).toContain(
          language === "ko" ? "선택한 지역" : "Selected region",
        );
        expect(
          await page.locator("body").getAttribute("data-submitted"),
        ).toBeNull();
        await page
          .getByRole("button", {
            name:
              language === "ko" ? "지역 선택 지우기" : "Clear region selection",
          })
          .tap();
        expect(await page.locator("output").textContent()).toBe("");
        await page.locator("input").fill("충주시");
        await page.locator("li button").last().scrollIntoViewIfNeeded();
        await page.locator("li button").last().tap();
        expect(await page.locator("output").textContent()).toBe(
          destinations[19].label,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await context.close();
      }
    });
  }
  it("shows missing key, failure, no results and retry without fabricated destinations", async () => {
    const { context, page } = await open();
    await mock(page, { error: "DESTINATIONS_KEY_MISSING" }, 503);
    await page.locator("input").fill("서울");
    await page.getByText("지역 검색 서버 키가 설정되지 않았어요.").waitFor();
    await mock(page, { error: "DESTINATIONS_TIMEOUT" }, 504);
    await page.getByRole("button", { name: "다시 검색", exact: true }).click();
    await page
      .getByText("지역 검색 시간이 초과됐어요. 다시 시도해 주세요.")
      .waitFor();
    await mock(page, { destinations: [], page: 1, hasMore: false });
    await page.getByRole("button", { name: "다시 검색", exact: true }).click();
    await page
      .getByText("선택 가능한 지역이 없어요.", { exact: false })
      .waitFor();
    expect(await page.locator("li").count()).toBe(0);
    await context.close();
  });
  it("debounces input, suppresses IME requests, discards stale results and clears edited selections", async () => {
    const { context, page } = await open();
    const requests: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/destinations?*", async (route) => {
      const q = new URL(route.request().url()).searchParams.get("q")!;
      requests.push(q);
      if (q === "서울") await gate;
      await route
        .fulfill({
          json: result(
            q === "서울" ? "충북 충주시 옛지역면" : "충북 충주시 새지역면",
          ),
        })
        .catch(() => {});
    });
    await page.locator("input").dispatchEvent("compositionstart");
    await page.locator("input").fill("서");
    await page.locator("input").fill("서울");
    await page.waitForTimeout(450);
    expect(requests).toEqual([]);
    await page.locator("input").dispatchEvent("compositionend");
    await page.waitForFunction(
      () =>
        document.querySelector('[role="status"]')?.getAttribute("aria-busy") ===
        "true",
    );
    await page.waitForTimeout(450);
    expect(requests).toEqual(["서울"]);
    await page.locator("input").fill("부산");
    await page
      .getByRole("button", { name: "충북 충주시 새지역면", exact: true })
      .waitFor();
    release!();
    await page.waitForTimeout(100);
    expect(
      await page.getByRole("button", { name: "충북 충주시 옛지역면" }).count(),
    ).toBe(0);
    await page
      .getByRole("button", { name: "충북 충주시 새지역면", exact: true })
      .click();
    await page.locator("input").fill("제주");
    expect(await page.locator("output").textContent()).toBe("");
    await context.close();
  });
  it("rejects forged API source and coordinates and supports empty-page pagination", async () => {
    const { context, page } = await open();
    const forged = result();
    forged.destinations[0].lng = 0;
    await mock(page, forged);
    await page.locator("input").fill("지역");
    await page
      .getByText("지역 검색 결과를 확인하지 못했어요. 다시 시도해 주세요.")
      .waitFor();
    await page.route("**/api/destinations?*", (route) => {
      const p = Number(new URL(route.request().url()).searchParams.get("page"));
      return route.fulfill({
        json: {
          destinations: p === 1 ? [] : [destination()],
          page: p,
          hasMore: p === 1,
        },
      });
    });
    await page.getByRole("button", { name: "다시 검색", exact: true }).click();
    await page.getByRole("button", { name: "검색 결과 더 보기" }).click();
    await page
      .getByRole("button", { name: "충북 충주시 살미면", exact: true })
      .waitFor();
    expect(
      await page.getByRole("button", { name: "검색 결과 더 보기" }).count(),
    ).toBe(0);
    await context.close();
  });
});
