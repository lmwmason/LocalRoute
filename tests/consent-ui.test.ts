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
import { LEGAL_VERSION, type LegalConsent } from "../shared/legal";

const complete = {
  current: true,
  version: LEGAL_VERSION,
  recordedAt: "2026-10-17T00:00:00Z",
  publicLocalArea: false,
};
const incomplete = {
  current: false,
  version: null,
  recordedAt: null,
  publicLocalArea: false,
};
describe("consent UI with a mock-only legal boundary", () => {
  let browser: Browser, server: ViteDevServer, base: string;
  const contexts: BrowserContext[] = [];
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      envDir: false,
      logLevel: "silent",
      plugins: [
        {
          name: "consent-network-boundary",
          enforce: "pre",
          load(id) {
            return id.split("?")[0] === resolve("src/legal/client.ts")
              ? 'export { requestLegalConsent } from "/tests/consent-ui-client.ts";'
              : null;
          },
        },
        react(),
      ],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("No fixture server address");
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  }, 30000);
  afterAll(async () => {
    for (const context of contexts) await context.close();
    await browser?.close();
    await server?.close();
  });
  async function setup({
    language = "en",
    width = 390,
    settings = false,
    pauseReads = false,
    current = false,
  } = {}) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    contexts.push(context);
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const control = {
      reads: 0,
      writes: [] as LegalConsent[],
      failReads: 0,
      failWrites: 0,
      pauseReads,
      pauseWrites: false,
      current,
      incompleteWrite: false,
      readResolvers: [] as (() => void)[],
      writeResolvers: [] as (() => void)[],
      releaseReads() {
        this.pauseReads = false;
        this.readResolvers.splice(0).forEach((resolve) => resolve());
      },
      releaseWrites() {
        this.pauseWrites = false;
        this.writeResolvers.splice(0).forEach((resolve) => resolve());
      },
    };
    const external: string[] = [],
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.routeWebSocket("**", (socket) => socket.close());
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin !== base) {
        external.push(url.origin);
        return route.abort();
      }
      if (url.pathname === "/__consent_ui") {
        if (request.method() === "GET") {
          control.reads++;
          if (control.pauseReads)
            await new Promise<void>((resolve) =>
              control.readResolvers.push(resolve),
            );
          if (control.failReads > 0) {
            control.failReads--;
            return route.fulfill({ status: 503, json: {} });
          }
          return route.fulfill({
            json: control.current ? complete : incomplete,
          });
        }
        control.writes.push(request.postDataJSON());
        if (control.pauseWrites)
          await new Promise<void>((resolve) =>
            control.writeResolvers.push(resolve),
          );
        if (control.failWrites > 0) {
          control.failWrites--;
          return route.fulfill({ status: 503, json: {} });
        }
        return route.fulfill({
          json: control.incompleteWrite ? incomplete : complete,
        });
      }
      if (url.pathname.startsWith("/api/") || request.method() !== "GET")
        return route.abort();
      return route.continue();
    });
    await context.addInitScript(
      (language) => localStorage.setItem("localroute.language", language),
      language,
    );
    await page.goto(
      `${base}/tests/consent-ui-harness.html${settings ? "?settings" : ""}`,
    );
    return { page, control, external, errors, context };
  }
  async function required(page: Page) {
    for (const input of await page
      .locator(".legal-choice input[required]")
      .all())
      await input.check();
  }
  async function layout(page: Page) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const locator of await page
      .locator(
        ".legal-gate button, .legal-gate a, .legal-gate summary, .legal-choice",
      )
      .all()) {
      if (await locator.isVisible()) {
        const box = (await locator.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
  }
  for (const language of ["ko", "en"])
    for (const width of [360, 390, 1440]) {
      it(`${language} ${width}px: delayed lookup, failed lookup/retry, delayed save, failed save/retry and success`, async () => {
        const ko = language === "ko",
          { page, control, external, errors, context } = await setup({
            language,
            width,
            pauseReads: true,
          });
        const card = page.locator(".legal-gate-card");
        await card.locator('.legal-gate-wait[role="status"]').waitFor();
        expect(
          await page.getByText("MEMBER_CONTENT", { exact: true }).count(),
        ).toBe(0);
        const height = (await card.boundingBox())!.height;
        if (process.env.CONSENT_UI_SCREENSHOTS === "1" && width === 390 && ko)
          await page.screenshot({
            path: "/tmp/localroute-consent-loading.png",
            fullPage: true,
          });
        expect(
          await page
            .locator(".legal-spinner")
            .evaluate((element) => getComputedStyle(element).animationName),
        ).toBe("none");
        await layout(page);
        control.failReads = 1;
        control.releaseReads();
        await page.getByRole("alert").waitFor();
        expect(
          Math.abs((await card.boundingBox())!.height - height),
        ).toBeLessThanOrEqual(2);
        expect(
          await page
            .getByRole("alert")
            .evaluate((element) => element === document.activeElement),
        ).toBe(true);
        control.pauseReads = true;
        await page
          .getByRole("button", {
            name: ko ? "다시 확인" : "Retry",
            exact: true,
          })
          .click();
        await page
          .getByRole("status")
          .filter({ hasText: ko ? "다시 확인하고" : "again" })
          .waitFor();
        expect(control.writes).toHaveLength(0);
        control.releaseReads();
        const save = page.getByRole("button", {
          name: ko ? "동의 설정 저장" : "Save consent settings",
          exact: true,
        });
        await save.waitFor();
        if (process.env.CONSENT_UI_SCREENSHOTS === "1" && width === 390 && ko)
          await page.screenshot({
            path: "/tmp/localroute-consent-ready.png",
            fullPage: true,
          });
        expect(await save.isDisabled()).toBe(true);
        expect(
          await page
            .locator(".legal-gate-header h2")
            .evaluate((element) => element === document.activeElement),
        ).toBe(true);
        for (const checkbox of await page.getByRole("checkbox").all())
          expect(await checkbox.isChecked()).toBe(false);
        const row = page.locator(".legal-choice").first(),
          checkbox = row.getByRole("checkbox");
        await row.locator("span").click();
        expect(await checkbox.isChecked()).toBe(true);
        await checkbox.focus();
        await page.keyboard.press("Space");
        expect(await checkbox.isChecked()).toBe(false);
        expect(
          await checkbox.evaluate(
            (element) => getComputedStyle(element).outlineStyle,
          ),
        ).toBe("solid");
        const link = page.locator(
          '.legal-document-links a[href="/legal/terms"]',
        );
        expect(await link.getAttribute("target")).toBe("_blank");
        const summary = page.locator(".legal-notices summary").first();
        await summary.focus();
        await page.keyboard.press("Space");
        expect(
          await page
            .locator(".legal-notices details")
            .first()
            .getAttribute("open"),
        ).not.toBeNull();
        await page.keyboard.press("Space");
        await required(page);
        expect(await save.isEnabled()).toBe(true);
        await layout(page);
        control.failWrites = 1;
        control.pauseWrites = true;
        await save.focus();
        await page.keyboard.press("Enter");
        await page
          .getByRole("button", {
            name: ko ? "저장 중…" : "Saving…",
            exact: true,
          })
          .waitFor();
        expect(
          await page.locator(".legal-gate-form").getAttribute("aria-busy"),
        ).toBe("true");
        for (const input of await page.getByRole("checkbox").all())
          expect(await input.isDisabled()).toBe(true);
        expect(
          await page.getByText("MEMBER_CONTENT", { exact: true }).count(),
        ).toBe(0);
        control.releaseWrites();
        await page.getByRole("alert").waitFor();
        expect(await page.getByRole("alert").innerText()).toContain(
          ko ? "선택한 항목은 유지" : "Your choices are kept",
        );
        expect(await page.locator("body").innerText()).not.toContain(
          "fixture-only-sensitive",
        );
        expect(
          await page
            .getByRole("alert")
            .evaluate((element) => element === document.activeElement),
        ).toBe(true);
        for (const input of await page.locator("input[required]").all())
          expect(await input.isChecked()).toBe(true);
        await save.click();
        await page.getByText("MEMBER_CONTENT", { exact: true }).waitFor();
        await page
          .getByRole("status")
          .filter({
            hasText: ko ? "동의 설정을 저장했어요" : "Consent settings saved",
          })
          .waitFor();
        expect(control.writes).toHaveLength(2);
        expect(control.writes[0]).toEqual(control.writes[1]);
        expect(control.writes[0]).toMatchObject({
          version: LEGAL_VERSION,
          language,
          publicLocalArea: false,
          terms: true,
          privacy: true,
          supabaseTransfer: true,
          adult: true,
        });
        expect(control.writes[0]).not.toHaveProperty("userId");
        expect(external).toEqual([]);
        expect(errors).toEqual([]);
        await context.close();
      }, 30000);
    }
  it("does not treat HTTP 200 with incomplete consent as a successful save", async () => {
    const { page, control } = await setup();
    await page
      .getByRole("button", { name: "Save consent settings", exact: true })
      .waitFor();
    await required(page);
    control.incompleteWrite = true;
    await page
      .getByRole("button", { name: "Save consent settings", exact: true })
      .click();
    await page.getByRole("alert").waitFor();
    expect(
      await page.getByText("MEMBER_CONTENT", { exact: true }).count(),
    ).toBe(0);
    expect(
      await page.getByText("Consent settings saved.", { exact: true }).count(),
    ).toBe(0);
    control.incompleteWrite = false;
    await page
      .getByRole("button", { name: "Save consent settings", exact: true })
      .click();
    await page.getByText("MEMBER_CONTENT", { exact: true }).waitFor();
    expect(control.writes[0].requestId).toBe(control.writes[1].requestId);
  });
  it("changed choices get a fresh request ID; settings allow optional withdrawal", async () => {
    const { page, control } = await setup({ settings: true, current: true });
    await page
      .getByRole("button", { name: "Save consent settings", exact: true })
      .waitFor();
    await required(page);
    const optional = page.locator(".legal-choice-optional input");
    await optional.check();
    control.failWrites = 1;
    await page
      .getByRole("button", { name: "Save consent settings", exact: true })
      .click();
    await page.getByRole("alert").waitFor();
    await optional.uncheck();
    await page
      .getByRole("button", { name: "Save consent settings", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Consent settings saved." })
      .waitFor();
    expect(control.writes[0].requestId).not.toBe(control.writes[1].requestId);
    expect(control.writes[1].publicLocalArea).toBe(false);
    expect(
      await page.getByText("MEMBER_CONTENT", { exact: true }).count(),
    ).toBe(0);
  });
  it("changing account resets choices and ignores the former account's delayed save", async () => {
    const { page, control } = await setup();
    await page
      .getByRole("button", { name: "Save consent settings", exact: true })
      .waitFor();
    await required(page);
    control.pauseWrites = true;
    await page
      .getByRole("button", { name: "Save consent settings", exact: true })
      .click();
    await page.getByRole("button", { name: "Saving…", exact: true }).waitFor();
    await page.evaluate(() =>
      Reflect.get(window, "__consentAccount")("fixture-b"),
    );
    const save = page.getByRole("button", {
      name: "Save consent settings",
      exact: true,
    });
    await save.waitFor();
    control.releaseWrites();
    await page.waitForTimeout(100);
    expect(await save.isDisabled()).toBe(true);
    expect(
      await page.getByText("MEMBER_CONTENT", { exact: true }).count(),
    ).toBe(0);
    for (const input of await page.getByRole("checkbox").all())
      expect(await input.isChecked()).toBe(false);
    expect(control.writes).toHaveLength(1);
  });
});
