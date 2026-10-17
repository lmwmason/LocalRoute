import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { TransportLeg } from "../src/planner/TransportLeg";
import { createKakaoRouting } from "../server/routing";
import type { TransportLegResult, TransportRequest } from "../shared/transport";

const request: TransportRequest = {
  origin: { lat: 37.5, lng: 127 },
  destination: { lat: 37.6, lng: 127.1 },
  mode: "transit",
};
const stamp = "2026-10-17T00:00:00Z";
const leg: TransportLegResult = {
  request,
  status: "estimated",
  timeBasis: "lookup_time",
  arrivalGuaranteed: false,
  accessibility: "unverified",
  distanceMeters: 4000,
  durationSeconds: 1800,
  transfers: 1,
  walking: { distanceMeters: 400, durationSeconds: 360 },
  fare: null,
  source: {
    provider: "kakao_maps",
    documentationUrl: null,
    requestedAt: stamp,
    checkedAt: stamp,
    attempted: true,
  },
  steps: [
    {
      mode: "bus",
      guidance: `승차 ${"아주긴정류장명칭".repeat(40)}`,
      distanceMeters: 3600,
      durationSeconds: 1440,
      stops: ["출발역", "환승역"],
      vehicles: [{ name: "76", type: "마을" }],
    },
  ],
};

describe("transport UI content", () => {
  it("shows estimates, lookup time, wheelchair uncertainty and schedule conflicts in both languages", () => {
    for (const language of ["ko", "en"] as const) {
      const html = renderToStaticMarkup(
        createElement(TransportLeg, { leg, language, availableSeconds: 600 }),
      );
      expect(html).toContain(
        language === "ko" ? "제공자 예상" : "Provider estimate",
      );
      expect(html).toContain(
        language === "ko" ? "초과해요" : "exceeds the schedule gap",
      );
      expect(html).toContain(
        language === "ko" ? "보장되지 않아요" : "not guaranteed",
      );
      expect(html).toContain("Kakao Maps");
      expect(html).toContain("Asia/Seoul");
      expect(html).toContain(language === "ko" ? "무장애" : "step-free");
    }
  });
  it("shows unknown without fake time/fare/steps and renders loading with live status", async () => {
    const unknown = await createKakaoRouting().lookup({
      ...request,
      mode: "wheelchair",
    });
    const html = renderToStaticMarkup(
      createElement(TransportLeg, {
        leg: unknown,
        language: "en",
        onRetry: () => {},
      }),
    );
    expect(html).toContain("Route unverified");
    expect(html).toContain("Provider not queried");
    expect(html).not.toContain("KRW");
    expect(html).not.toContain("<details");
    expect(html).toContain("Check route again");
    const loading = renderToStaticMarkup(
      createElement(TransportLeg, { loading: true, language: "en" }),
    );
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Checking the route");
  });
  it("escapes untrusted provider instructions", () => {
    const malicious = {
      ...leg,
      steps: [{ ...leg.steps[0], guidance: '<script>alert("key")</script>' }],
    };
    const html = renderToStaticMarkup(
      createElement(TransportLeg, { leg: malicious, language: "en" }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("transport UI browser layout and native controls (no providers)", () => {
  let browser: Browser;
  let css: string;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    css = await readFile(
      new URL("../src/planner/transport.css", import.meta.url),
      "utf8",
    );
  });
  afterAll(async () => {
    await browser?.close();
  });
  for (const width of [360, 390, 1440]) {
    it(`supports ${width}px, touch, keyboard, scrolling and reduced motion without overflow`, async () => {
      const context = await browser.newContext({
        viewport: { width, height: 800 },
        hasTouch: true,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.route("**/*", (route) => route.abort());
      for (const language of ["ko", "en"] as const) {
        const html = renderToStaticMarkup(
          createElement(TransportLeg, { leg, language, availableSeconds: 600 }),
        );
        await page.setContent(
          `<meta name="viewport" content="width=device-width"><style>body{margin:0;padding:16px;font-family:sans-serif}${css}</style>${html}`,
        );
        const summary = page.locator("summary");
        const box = await summary.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
        await summary.tap();
        expect(
          await page.locator("details").getAttribute("open"),
        ).not.toBeNull();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await summary.focus();
        expect(
          await summary.evaluate((el) => el === document.activeElement),
        ).toBe(true);
        await page.keyboard.press("Enter");
        expect(await page.locator("details").getAttribute("open")).toBeNull();
        await summary.tap();
        await page.locator("li").scrollIntoViewIfNeeded();
        expect(await page.locator("li").isVisible()).toBe(true);
      }
      const unknown = await createKakaoRouting().lookup(request);
      await page.setContent(
        `<style>${css}</style>${renderToStaticMarkup(createElement(TransportLeg, { leg: unknown, language: "en", onRetry: () => {} }))}`,
      );
      expect(
        (await page.locator("button").boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
      await page.locator("button").focus();
      expect(
        await page
          .locator("button")
          .evaluate((el) => el === document.activeElement),
      ).toBe(true);
      await context.close();
    });
  }
});
