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
import { shareLink, shareToken, sharedSnapshot } from "./share-ui-fixture";

describe("sharing browser flow with mocked API, native share and clipboard", () => {
  let browser: Browser, server: ViteDevServer, base: string;
  const contexts: BrowserContext[] = [];
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      envDir: false,
      logLevel: "silent",
      plugins: [
        {
          name: "share-api-fixture",
          enforce: "pre",
          load(id) {
            return id.split("?")[0] === resolve("src/api.ts")
              ? 'export { api } from "/tests/share-ui-api.ts";'
              : null;
          },
        },
        react(),
      ],
      server: { host: "127.0.0.1", port: 0, hmr: false },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("No fixture address");
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
    native = "success",
    clipboard = "success",
    listFailure = false,
    expired = false,
  } = {}) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    contexts.push(context);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const control = {
      posts: [] as unknown[],
      deletes: 0,
      reads: 0,
      publicStatus: 200,
      publicPayload: sharedSnapshot as unknown,
      createFailure: false,
      revokeFailure: false,
      listFailure,
      revoked: false,
      expiresAt: shareLink.expiresAt,
      path: `/s/${shareToken}`,
    };
    const requests: { path: string; method: string }[] = [],
      external: string[] = [],
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
      if (!url.pathname.startsWith("/api/")) return route.continue();
      requests.push({ path: url.pathname, method: request.method() });
      if (url.pathname.startsWith("/api/shared-itineraries/")) {
        control.reads++;
        return route.fulfill({
          status: control.revoked ? 404 : control.publicStatus,
          json: control.publicPayload,
        });
      }
      if (url.pathname.endsWith("/shares")) {
        if (request.method() === "GET")
          return route.fulfill({
            status: control.listFailure ? 503 : 200,
            json: control.listFailure
              ? { error: "PRIVATE_EMAIL@example.invalid" }
              : expired
                ? [{ ...shareLink, expiresAt: "2000-01-01T00:00:00Z" }]
                : [],
          });
        control.posts.push(request.postDataJSON());
        return route.fulfill({
          status: control.createFailure ? 503 : 201,
          json: control.createFailure
            ? { error: "PRIVATE_EMAIL@example.invalid" }
            : {
                ...shareLink,
                expiresAt: control.expiresAt,
                path: control.path,
              },
        });
      }
      if (request.method() === "DELETE") {
        control.deletes++;
        if (control.revokeFailure)
          return route.fulfill({
            status: 503,
            json: { error: "PRIVATE_PHONE" },
          });
        control.revoked = true;
        return route.fulfill({ json: {} });
      }
      return route.fulfill({ status: 503, json: { error: "Mock-only API" } });
    });
    await context.addInitScript(
      ({ language, native, clipboard }) => {
        localStorage.setItem("localroute.language", language);
        const counts = { native: [] as unknown[], copies: [] as string[] };
        Reflect.set(window, "__shareCalls", counts);
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            async writeText(value: string) {
              counts.copies.push(value);
              if (clipboard === "failure")
                throw new DOMException("PRIVATE_PHONE", "NotAllowedError");
            },
          },
        });
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value:
            native === "unsupported"
              ? undefined
              : async (value: unknown) => {
                  counts.native.push(value);
                  if (native !== "success")
                    throw new DOMException(
                      "PRIVATE_EMAIL@example.invalid",
                      native === "cancel" ? "AbortError" : "NotAllowedError",
                    );
                },
        });
      },
      { language, native, clipboard },
    );
    return { page, context, control, requests, external, errors };
  }
  async function owner(page: Page) {
    await page.goto(`${base}/tests/share-ui-harness.html`);
    await page.getByRole("dialog").waitFor();
  }
  async function create(page: Page, ko = false) {
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", {
        name: ko ? "공유 링크 만들기 · 무료" : "Create sharing link · free",
        exact: true,
      })
      .click();
    await page
      .getByLabel(ko ? "읽기 전용 공유 링크" : "Read-only itinerary link", {
        exact: true,
      })
      .waitFor();
  }
  async function calls(page: Page) {
    return page.evaluate(
      () =>
        Reflect.get(window, "__shareCalls") as {
          native: unknown[];
          copies: string[];
        },
    );
  }
  async function mobileLayout(page: Page) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const control of await page
      .locator(
        ".share-itinerary button, .share-itinerary select, .share-itinerary .checkbox-label, .shared-itinerary-page button, .shared-itinerary-page a",
      )
      .all()) {
      if (await control.isVisible()) {
        const box = (await control.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
  }
  for (const language of ["ko", "en"])
    for (const width of [360, 390]) {
      it(`${language} ${width}px: explicit consent, create, native share, copy and revocation`, async () => {
        const ko = language === "ko",
          { page, context, control, requests, external, errors } = await setup({
            language,
            width,
          });
        await owner(page);
        const button = page.getByRole("button", {
          name: ko ? "공유 링크 만들기 · 무료" : "Create sharing link · free",
          exact: true,
        });
        expect(await button.isDisabled()).toBe(true);
        expect(control.posts).toHaveLength(0);
        await page.getByRole("checkbox").check();
        await page.getByRole("combobox").selectOption("1");
        expect(await page.getByRole("checkbox").isChecked()).toBe(false);
        await create(page, ko);
        expect(control.posts).toEqual([
          {
            revision: 1,
            expiresInDays: 1,
            consentVersion: "unlisted-itinerary-v1",
          },
        ]);
        expect((await calls(page)).native).toEqual([]);
        expect(await page.getByRole("checkbox").isChecked()).toBe(false);
        await page
          .getByRole("button", {
            name: ko ? "휴대폰 공유 메뉴" : "Open sharing menu",
            exact: true,
          })
          .click();
        expect((await calls(page)).native).toHaveLength(1);
        expect(JSON.stringify((await calls(page)).native)).not.toContain(
          "PRIVATE_",
        );
        await page
          .getByRole("button", {
            name: ko ? "링크 복사" : "Copy link",
            exact: true,
          })
          .click();
        await page
          .getByRole("status")
          .filter({ hasText: ko ? "복사했어요" : "Copied." })
          .waitFor();
        expect((await calls(page)).copies[0]).toBe(`${base}/s/${shareToken}`);
        await page
          .getByRole("button", {
            name: ko ? "일정 텍스트 복사" : "Copy itinerary text",
            exact: true,
          })
          .click();
        expect((await calls(page)).copies.at(-1)).not.toContain("PRIVATE_");
        await page
          .getByText(
            ko ? "공유할 내용 미리 보기" : "Preview what will be shared",
            { exact: true },
          )
          .click();
        expect(await page.locator("pre").innerText()).not.toContain("PRIVATE_");
        await mobileLayout(page);
        control.revokeFailure = true;
        const revoke = page.getByRole("button", {
          name: ko ? "링크 공유 해제" : "Revoke link",
          exact: true,
        });
        await revoke.click();
        await page.getByRole("alert").waitFor();
        expect(await page.locator("body").innerText()).not.toContain(
          "PRIVATE_PHONE",
        );
        expect(
          await page
            .getByLabel(
              ko ? "읽기 전용 공유 링크" : "Read-only itinerary link",
              { exact: true },
            )
            .isVisible(),
        ).toBe(true);
        control.revokeFailure = false;
        await revoke.click();
        await page
          .getByRole("status")
          .filter({ hasText: ko ? "공유 해제됨" : "Sharing revoked" })
          .waitFor();
        expect(await page.locator(".share-link-result").count()).toBe(0);
        expect(
          requests.every((request) => request.path.includes("shares")),
        ).toBe(true);
        expect(external).toEqual([]);
        expect(errors).toEqual([]);
        await context.close();
      }, 30000);
    }
  it.each(["cancel", "unsupported", "failure"])(
    "native %s keeps copy/manual alternatives without automatically copying",
    async (native) => {
      const { page } = await setup({ native, clipboard: "failure" });
      await owner(page);
      await create(page);
      await page
        .getByRole("button", { name: "Open sharing menu", exact: true })
        .click();
      await page
        .getByText(
          native === "cancel"
            ? "Sharing cancelled."
            : native === "unsupported"
              ? "This browser does not support the sharing menu."
              : "The sharing menu could not open.",
          { exact: false },
        )
        .first()
        .waitFor();
      expect((await calls(page)).copies).toHaveLength(0);
      await page
        .getByRole("button", { name: "Copy link", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "automatic copying" })
        .waitFor();
      const link = page.getByLabel("Read-only itinerary link", { exact: true });
      expect(
        await link.evaluate((element) => element === document.activeElement),
      ).toBe(true);
      expect(
        await link.evaluate(
          (element: HTMLInputElement) =>
            element.selectionEnd! - element.selectionStart!,
        ),
      ).toBe(`${base}/s/${shareToken}`.length);
      await page
        .getByRole("button", { name: "Select link manually", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      expect(
        await link.evaluate((element) => element === document.activeElement),
      ).toBe(true);
      await page
        .getByRole("button", { name: "Copy itinerary text", exact: true })
        .click();
      const manual = page.getByRole("textbox", {
        name: "Itinerary text for manual copying",
        exact: true,
      });
      await manual.waitFor();
      expect(await manual.inputValue()).not.toContain("PRIVATE_");
    },
  );
  it("separates list loading failure from creation success and sanitizes creation errors", async () => {
    const { page, control } = await setup({ listFailure: true });
    await owner(page);
    await page.getByRole("alert").waitFor();
    control.createFailure = true;
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Create sharing link · free", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "could not be processed" })
      .waitFor();
    expect(await page.locator("body").innerText()).not.toContain(
      "PRIVATE_EMAIL@",
    );
    control.createFailure = false;
    await page
      .getByRole("button", { name: "Create sharing link · free", exact: true })
      .click();
    await page
      .getByLabel("Read-only itinerary link", { exact: true })
      .waitFor();
    await page
      .getByRole("status")
      .filter({ hasText: "Sharing link created" })
      .waitFor();
  });
  it("labels expired owner links and never enables their revocation/copy controls", async () => {
    const { page } = await setup({ expired: true });
    await owner(page);
    const expired = page.getByRole("button", { name: "Expired", exact: true });
    await expired.waitFor();
    expect(await expired.isDisabled()).toBe(true);
    expect(await page.locator(".share-link-result").count()).toBe(0);
  });
  for (const language of ["ko", "en"])
    for (const width of [360, 390]) {
      it(`${language} ${width}px: actual main entry reads a direct link and reloads without login or private data`, async () => {
        const ko = language === "ko",
          { page, control, external, errors } = await setup({
            language,
            width,
          });
        await page.goto(`${base}/s/${shareToken}`);
        await page
          .getByRole("heading", { name: sharedSnapshot.title, exact: true })
          .waitFor();
        expect(await page.locator("body").innerText()).not.toContain(
          "PRIVATE_",
        );
        expect(
          await page.locator('meta[name="robots"]').getAttribute("content"),
        ).toContain("noindex");
        expect(
          await page.locator('meta[name="referrer"]').getAttribute("content"),
        ).toBe("no-referrer");
        await mobileLayout(page);
        const before = control.reads;
        await page.reload();
        await page
          .getByRole("heading", { name: sharedSnapshot.title, exact: true })
          .waitFor();
        expect(control.reads).toBeGreaterThan(before);
        control.publicStatus = 503;
        await page.reload();
        await page.getByRole("alert").waitFor();
        control.publicStatus = 200;
        await page
          .getByRole("button", {
            name: ko ? "다시 불러오기" : "Try loading again",
            exact: true,
          })
          .click();
        await page
          .getByRole("heading", { name: sharedSnapshot.title, exact: true })
          .waitFor();
        control.revoked = true;
        await page.reload();
        await page
          .getByRole("alert")
          .filter({ hasText: ko ? "만료·해제" : "expired, was revoked" })
          .waitFor();
        expect(
          await page
            .getByRole("heading", { name: sharedSnapshot.title, exact: true })
            .count(),
        ).toBe(0);
        expect(external).toEqual([]);
        expect(errors).toEqual([]);
      }, 30000);
    }
  it("rejects unexpected private fields in a public API response", async () => {
    const { page, control } = await setup();
    control.publicPayload = {
      ...sharedSnapshot,
      guestName: "PRIVATE_BOOKING_NAME",
      guestPhone: "PRIVATE_PHONE",
      email: "PRIVATE_EMAIL@example.invalid",
    };
    await page.goto(`${base}/s/${shareToken}`);
    await page.getByRole("alert").waitFor();
    expect(await page.locator("body").innerText()).not.toContain("PRIVATE_");
    expect(
      await page
        .getByRole("heading", { name: sharedSnapshot.title, exact: true })
        .count(),
    ).toBe(0);
  });
  it("does not copy a link that expires between timer updates", async () => {
    const { page, control } = await setup();
    const time = new Date();
    await page.clock.install({ time });
    control.expiresAt = new Date(time.getTime() + 10_000).toISOString();
    await owner(page);
    await create(page);
    await page.clock.fastForward(11_000);
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "This link has expired" })
      .waitFor();
    expect((await calls(page)).copies).toHaveLength(0);
    expect(await page.locator(".share-link-result").count()).toBe(0);
  });
  it("a new saved revision resets consent and the previous link", async () => {
    const { page } = await setup();
    await owner(page);
    await create(page);
    await page.evaluate(() =>
      Reflect.get(
        window,
        "__sharePlan",
      )((plan: Record<string, unknown>) => ({ ...plan, revision: 2 })),
    );
    await page.getByRole("checkbox").waitFor();
    expect(await page.getByRole("checkbox").isChecked()).toBe(false);
    expect(await page.locator(".share-link-result").count()).toBe(0);
    expect(
      await page
        .getByRole("button", {
          name: "Create sharing link · free",
          exact: true,
        })
        .isDisabled(),
    ).toBe(true);
  });
  it("rejects a sharing URL outside the current site", async () => {
    const { page, control } = await setup();
    control.path = "https://untrusted.invalid/s/" + shareToken;
    await owner(page);
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Create sharing link · free", exact: true })
      .click();
    await page.getByRole("alert").waitFor();
    expect(await page.locator(".share-link-result").count()).toBe(0);
    expect(await page.locator("body").innerText()).not.toContain(
      "untrusted.invalid",
    );
  });
});
