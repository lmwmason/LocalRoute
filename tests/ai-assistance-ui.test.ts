import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

describe("AI assistance interactive components with mocked callbacks", () => {
  let browser: Browser, server: ViteDevServer, base: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      plugins: [react()],
      logLevel: "silent",
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
    await browser?.close();
    await server?.close();
  });

  async function fixture(width = 390, lang = "en", scenario = "success") {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.route("**/*", (route) =>
      route.request().url().startsWith(base) ? route.continue() : route.abort(),
    );
    await page.goto(
      `${base}/tests/ai-assistance-harness.html?lang=${lang}&scenario=${scenario}`,
    );
    await page
      .getByRole("heading", {
        name:
          lang === "ko" ? "메뉴 사진은 선택이에요" : "Menu photos are optional",
      })
      .waitFor();
    return { page, context };
  }
  async function chooseAndExtract(page: Page, ko = false) {
    await page
      .getByLabel(ko ? "메뉴 사진 파일" : "Menu photo file", { exact: true })
      .setInputFiles({
        name: "synthetic-fixture.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "mock photo bytes; no server processing in this UI fixture",
        ),
      });
    const button = page.getByRole("button", {
      name: ko ? "보이는 메뉴 추출" : "Extract visible menu",
    });
    expect(await button.isDisabled()).toBe(true);
    await page.getByRole("checkbox").first().check();
    await button.click();
  }
  for (const width of [360, 390, 1440]) {
    it(`edits and confirms unknown prices at ${width}px in Korean/English, with keyboard and touch support`, async () => {
      for (const lang of ["ko", "en"]) {
        const ko = lang === "ko",
          { page, context } = await fixture(width, lang);
        await chooseAndExtract(page, ko);
        const name = page.getByLabel(ko ? "메뉴명" : "Item name", {
          exact: true,
        });
        await name.waitFor();
        expect(await name.inputValue()).toBe("Fixture 비빔밥");
        const price = page.getByLabel(
          ko
            ? "가격 · 미확인이면 비워 두세요"
            : "Price · leave blank if unknown",
        );
        const currency = page.getByLabel(
          ko ? "통화 · 사진에 표시된 그대로" : "Currency · as printed",
        );
        expect(await price.inputValue()).toBe("");
        expect(await currency.inputValue()).toBe("");
        await name.fill("수정 메뉴");
        await price.fill("15000");
        await currency.fill("원");
        const confirm = page.getByRole("button", {
          name: ko ? "수정한 메뉴 확인" : "Confirm edited menu",
        });
        expect(await confirm.isDisabled()).toBe(true);
        await page.getByRole("checkbox").last().check();
        // Any edit invalidates the user's earlier confirmation.
        await price.fill("16000");
        expect(await confirm.isDisabled()).toBe(true);
        await page.getByRole("checkbox").last().check();
        await confirm.scrollIntoViewIfNeeded();
        expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(
          44,
        );
        await confirm.focus();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() =>
          document
            .querySelector("#confirmed")
            ?.textContent?.includes('"confirmed":true'),
        );
        const result = JSON.parse(
          (await page.locator("#confirmed").textContent()) ?? "null",
        );
        expect(result).toMatchObject({
          items: [{ name: "수정 메뉴", price: 16000, currency: "원" }],
          source: "user_confirmed_draft",
        });
        expect(await confirm.isDisabled()).toBe(true);
        expect(await page.locator("#count").textContent()).toBe("1");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(await page.locator(".ai-assistance script").count()).toBe(0);
        const skip = page.getByRole("button", {
          name: ko ? "메뉴 사진 없이 계속" : "Continue without menu photo",
        });
        await skip.scrollIntoViewIfNeeded();
        await skip.tap();
        await page
          .getByText("Fixture contribution continued without a menu photo.")
          .waitFor();
        await context.close();
      }
    });
  }
  it("allows a manual menu after extraction failure, preserving blanks as null", async () => {
    const { page, context } = await fixture(360, "en", "failure");
    await chooseAndExtract(page);
    await page.getByRole("alert").waitFor();
    expect(await page.getByRole("alert").textContent()).toContain("timed out");
    await page.getByRole("button", { name: "Add item manually" }).click();
    await page.getByLabel("Item name", { exact: true }).fill("Manual fixture");
    await page.getByRole("checkbox").last().check();
    await page.getByRole("button", { name: "Confirm edited menu" }).click();
    await page.waitForFunction(() =>
      document
        .querySelector("#confirmed")
        ?.textContent?.includes("Manual fixture"),
    );
    expect(
      JSON.parse((await page.locator("#confirmed").textContent()) ?? "null")
        .items[0],
    ).toMatchObject({ price: null, currency: null });
    await context.close();
  });
  it("does not overwrite the skip/manual flow when a previous extraction resolves late", async () => {
    const { page, context } = await fixture(390, "en", "slow");
    await chooseAndExtract(page);
    await page
      .getByRole("button", { name: "Continue without menu photo" })
      .click();
    await page.getByRole("button", { name: "Add item manually" }).click();
    await page
      .getByLabel("Item name", { exact: true })
      .fill("Keep my manual input");
    await page.waitForTimeout(650);
    expect(
      await page.getByLabel("Item name", { exact: true }).inputValue(),
    ).toBe("Keep my manual input");
    await context.close();
  });
  it("handles confirmation rejection without exposing raw exceptions or falsely reporting success", async () => {
    const { page, context } = await fixture(390, "en", "confirmfail");
    await chooseAndExtract(page);
    await page.getByLabel("Item name", { exact: true }).waitFor();
    await page.getByRole("checkbox").last().check();
    await page.getByRole("button", { name: "Confirm edited menu" }).click();
    await page.getByRole("alert").waitFor();
    expect(await page.getByRole("alert").textContent()).not.toContain(
      "private provider error",
    );
    expect(await page.locator("#confirmed").textContent()).toBe("null");
    await context.close();
  });
  it("rejects oversized/unsupported files locally and allows skipping without a photo", async () => {
    const { page, context } = await fixture(360);
    const file = page.getByLabel("Menu photo file", { exact: true });
    await file.setInputFiles({
      name: "bad.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
    expect(await page.getByRole("alert").textContent()).toContain("JPEG");
    await file.setInputFiles({
      name: "large.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    expect(await page.getByRole("alert").textContent()).toContain("5MB");
    await page
      .getByRole("button", { name: "Continue without menu photo" })
      .click();
    await page
      .getByText("Fixture contribution continued without a menu photo.")
      .waitFor();
    await context.close();
  });
});
