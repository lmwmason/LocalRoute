import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

describe("read-only administrator authentication recovery", () => {
  let server: ViteDevServer, browser: Browser, base: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      envDir: false,
      logLevel: "silent",
      plugins: [
        {
          name: "admin-recovery-fixture",
          enforce: "pre",
          transform(code, id) {
            if (!id.includes("/src/components/Admin.tsx")) return;
            return code
              .replace(
                'import { api } from "../api";',
                "const api={admin:()=>globalThis.__adminFixture.load()};",
              )
              .replace(
                'import { config } from "../config";',
                "const config={demo:false};",
              );
          },
          resolveId(id) {
            if (id === "/__admin_fixture.tsx") return id;
          },
          load(id) {
            if (id !== "/__admin_fixture.tsx") return;
            return `import React from"react";import{createRoot}from"react-dom/client";import{I18nProvider}from"/src/i18n";import{Admin}from"/src/components/Admin";import"/src/styles.css";globalThis.__adminFixture={calls:0,load(){this.calls++;return this.calls===1?Promise.reject(new Error(new URLSearchParams(location.search).get("error")||"LEGAL_VERIFIED_EMAIL_REQUIRED")):Promise.resolve({queue:[],history:[]});}};createRoot(document.getElementById("root")).render(<I18nProvider><Admin/></I18nProvider>);`;
          },
          configureServer(s) {
            s.middlewares.use(async (req, res, next) => {
              if (
                new URL(req.url || "/", "http://fixture").pathname !==
                "/__admin_fixture"
              )
                return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                await s.transformIndexHtml(
                  req.url || "/",
                  '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/__admin_fixture.tsx"></script>',
                ),
              );
            });
          },
        },
        react(),
      ],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Missing port");
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch();
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });
  it("replaces raw auth errors with same-origin sign-in and reloads successfully in both languages", async () => {
    for (const language of ["ko", "en"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await context.addInitScript(
        (lang) => localStorage.setItem("localroute.language", lang),
        language,
      );
      const page = await context.newPage();
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base || route.request().method() !== "GET")
          return route.abort();
        if (url.pathname === "/api/health")
          return route.fulfill({
            json: { capabilities: { moderation: false } },
          });
        return route.continue();
      });
      await page.goto(base + "/__admin_fixture");
      const alert = page.getByRole("alert");
      await alert.waitFor();
      expect((await alert.textContent())?.toLowerCase()).toContain("localhost");
      expect(await page.locator("body").textContent()).not.toContain(
        "LEGAL_VERIFIED_EMAIL_REQUIRED",
      );
      expect(await alert.locator("a").getAttribute("href")).toBe("/login");
      const retry = page.getByRole("button", {
        name: language === "ko" ? "다시 확인" : "Retry",
        exact: true,
      });
      expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await retry.click();
      await alert.waitFor({ state: "detached" });
      await page.waitForFunction(
        () => Reflect.get(globalThis, "__adminFixture").calls === 2,
      );
      expect(
        await page.getByText("검토를 기다리는 항목이 없어요.").isVisible(),
      ).toBe(true);
      await context.close();
    }
  });
  it("routes consent recovery to account and hides permission error codes", async () => {
    for (const code of ["LEGAL_CONSENT_REQUIRED", "FORBIDDEN"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route("**/*", (route) =>
        route.request().url().startsWith(base)
          ? route.continue()
          : route.abort(),
      );
      await page.goto(base + "/__admin_fixture?error=" + code);
      await page.getByRole("alert").waitFor();
      expect(await page.getByRole("alert").textContent()).not.toContain(code);
      expect(
        await page.getByRole("alert").locator("a").getAttribute("href"),
      ).toBe(code === "LEGAL_CONSENT_REQUIRED" ? "/account" : "/login");
      await context.close();
    }
  });
});
