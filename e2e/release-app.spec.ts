import {
  test as base,
  expect,
  type Page,
  type Locator,
} from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Actual App/router pages; no component harness and no live provider/Auth writes.
const implementationFiles = [
  "src/main.tsx",
  "src/LegalSitePage.tsx",
  "src/legal/LegalConsentGate.tsx",
  "src/App.tsx",
  "src/planner/Planner.tsx",
  "src/planner/ItineraryEditor.tsx",
  "src/components/Map.tsx",
  "src/components/RasterMap.tsx",
  "src/components/Login.tsx",
  "src/styles.css",
  "src/planner/planner.css",
];
const test = base.extend<{ safety: void }>({
  safety: [
    async ({ context, page }, use, info) => {
      const unexpected: string[] = [],
        errors: string[] = [];
      const fingerprint = () =>
        Object.fromEntries(
          implementationFiles.map((path) => [
            path,
            createHash("sha256").update(readFileSync(path)).digest("hex"),
          ]),
        );
      const before = fingerprint();
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== "http://127.0.0.1:5173") {
          if (!/openfreemap|openstreetmap/.test(url.hostname))
            unexpected.push(url.origin + url.pathname);
          await route.abort();
          return;
        }
        if (
          url.pathname.startsWith("/api/") ||
          url.pathname.startsWith("/__release")
        ) {
          await route.fulfill({
            status: 503,
            json: { error: "RELEASE_QA_UNMOCKED_REQUEST" },
          });
          return;
        }
        if (route.request().method() !== "GET") {
          unexpected.push(url.pathname);
          await route.abort();
          return;
        }
        await route.continue();
      });
      // Do not receive implementation HMR changes halfway through a reproduction.
      await context.routeWebSocket("**", (socket) => socket.close());
      await page.route(/\/src\/config\.ts(?:\?|$)/, (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: `export const config={demo:true,mapStyle:'https://tiles.openfreemap.org/styles/liberty',supabaseUrl:'',supabaseKey:''};`,
        }),
      );
      await page.route(/\/src\/supabase\.ts(?:\?|$)/, (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: "export const supabase=null; export function exchangeAuthCode(){return undefined}",
        }),
      );
      page.on("pageerror", (error) => errors.push(error.message));
      await use();
      const after = fingerprint();
      if (JSON.stringify(before) !== JSON.stringify(after))
        info.annotations.push({
          type: "implementation-changed",
          description:
            "Implementation changed during this test; reproduce on a stable snapshot before reporting a defect.",
        });
      await info.attach("implementation-snapshot", {
        body: JSON.stringify(
          { before, after, pageErrors: errors, blockedUnexpected: unexpected },
          null,
          2,
        ),
        contentType: "application/json",
      });
      expect(unexpected, "No unexpected external/Auth traffic").toEqual([]);
      expect(errors, "No uncaught browser exceptions").toEqual([]);
    },
    { auto: true },
  ],
});
test.use({ hasTouch: true, reducedMotion: "reduce", serviceWorkers: "block" });

async function tapAll(items: Locator) {
  // Real browser touch events, with no per-item state assertion/delay between taps.
  const count = await items.count();
  for (let index = 0; index < count; index++) await items.nth(index).tap();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
async function reachable(control: Locator, page: Page, soft = false) {
  const check = soft ? expect.soft : expect;
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  check(box).not.toBeNull();
  if (!box) return;
  check(box.width).toBeGreaterThanOrEqual(44);
  check(box.height).toBeGreaterThanOrEqual(44);
  const point = await control.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return {
      reachable: Boolean(hit && (element === hit || element.contains(hit))),
      label: element.getAttribute("aria-label") || element.textContent,
      rect: r.toJSON(),
      covering: hit?.outerHTML.slice(0, 700),
      scrollY,
      innerHeight,
    };
  });
  if (!point.reachable)
    await test.info().attach("covered-control", {
      body: JSON.stringify(point, null, 2),
      contentType: "application/json",
    });
  check(
    point.reachable,
    "Control center must not be covered by bottom navigation/overlay",
  ).toBe(true);
  await noOverflow(page);
}
const words = {
  ko: {
    start: "나의 여행 계획하기",
    next: "다음",
    back: "이전",
    generate: "가상 일정 만들기 · 무료",
    save: "변경 내용 저장 · 무료",
    share: "일정 공유",
    close: "닫기",
    login: "로그인",
    signup: "회원가입",
    copy: "일정 텍스트 복사",
    map: "지도",
    timeline: "일정",
    arrival: "방문 시작 1",
    departure: "방문 종료 1",
    legal: "법적 고지",
    privacy: "개인정보 처리방침",
  },
  en: {
    start: "Plan my trip",
    next: "Continue",
    back: "Back",
    generate: "Create a sample itinerary · free",
    save: "Save changes · free",
    share: "Share itinerary",
    close: "Close",
    login: "Sign in",
    signup: "Sign up",
    copy: "Copy itinerary text",
    map: "Map",
    timeline: "Itinerary",
    arrival: "Arrival time 1",
    departure: "Departure time 1",
    legal: "Legal notices",
    privacy: "Privacy policy",
  },
};
type Language = keyof typeof words;
async function start(page: Page, language: Language, final = 4) {
  await page.goto("/plan");
  await page
    .getByRole("button", { name: words[language].start, exact: true })
    .click();
  for (let step = 1; step < final; step++) {
    await expect(page).toHaveURL(new RegExp(`/plan/new/${step}$`));
    await page
      .getByRole("button", { name: words[language].next, exact: true })
      .click();
  }
  await expect(page).toHaveURL(new RegExp(`/plan/new/${final}$`));
}
async function generateDemo(page: Page, language: Language) {
  await start(page, language);
  const generate = page.getByRole("button", {
    name: words[language].generate,
    exact: true,
  });
  await expect(generate).toBeDisabled();
  await expect(page.locator(".lp-confirm")).toContainText("0 LP");
  await page.locator(".checkbox-label input[type=checkbox]").last().check();
  await generate.click();
  await expect(page.locator(".schedule-stop")).toHaveCount(5);
  await expect(page).toHaveURL(/\/itineraries\//);
}

for (const language of ["ko", "en"] as const) {
  test.describe(language, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(
        (lang) => localStorage.setItem("localroute.language", lang),
        language,
      );
    });

    test("rapid touch multi-select and persistence across steps, history and reload", async ({
      page,
    }) => {
      await start(page, language, 1);
      await page.locator('input[type="date"]').first().fill("2026-11-03");
      await page.locator('input[type="date"]').last().fill("2026-11-03");
      await page.locator('input[type="time"]').first().fill("10:00");
      await page.locator('input[type="time"]').last().fill("18:30");
      await page
        .getByRole("button", { name: words[language].next, exact: true })
        .click();
      const activities = page
        .locator(".choice-chips")
        .nth(0)
        .getByRole("button");
      const food = page.locator(".choice-chips").nth(1).getByRole("button");
      await expect(activities).toHaveCount(7);
      await expect(food).toHaveCount(4);
      // Normalize the initial selections through UI; all remaining taps are consecutive.
      for (const group of [activities, food]) {
        for (const button of await group.all())
          if ((await button.getAttribute("aria-pressed")) === "true")
            await button.tap();
        await tapAll(group);
        await expect(
          group.locator("xpath=self::*[@aria-pressed='true']"),
        ).toHaveCount(await group.count());
        await group.nth(1).tap();
        await group.nth(2).tap();
        await expect(group.nth(1)).toHaveAttribute("aria-pressed", "false");
        await expect(group.nth(2)).toHaveAttribute("aria-pressed", "false");
      }
      const selected = await page
        .locator(".choice-chips button")
        .evaluateAll((buttons) =>
          buttons.map((b) => b.getAttribute("aria-pressed")),
        );
      await page
        .getByRole("button", { name: words[language].next, exact: true })
        .click();
      await page
        .getByRole("button", { name: words[language].back, exact: true })
        .click();
      await expect
        .poll(() =>
          page
            .locator(".choice-chips button")
            .evaluateAll((buttons) =>
              buttons.map((b) => b.getAttribute("aria-pressed")),
            ),
        )
        .toEqual(selected);
      await page.reload();
      await expect
        .poll(() =>
          page
            .locator(".choice-chips button")
            .evaluateAll((buttons) =>
              buttons.map((b) => b.getAttribute("aria-pressed")),
            ),
        )
        .toEqual(selected);
      await page.goBack();
      await expect(page).toHaveURL(/\/plan\/new\/3$/);
      await page.goForward();
      await expect(page).toHaveURL(/\/plan\/new\/2$/);
      await expect
        .poll(() =>
          page
            .locator(".choice-chips button")
            .evaluateAll((buttons) =>
              buttons.map((b) => b.getAttribute("aria-pressed")),
            ),
        )
        .toEqual(selected);
      await reachable(activities.first(), page);
      await page
        .getByRole("button", { name: words[language].back, exact: true })
        .click();
      await expect(page.locator('input[type="date"]').first()).toHaveValue(
        "2026-11-03",
      );
      await expect(page.locator('input[type="date"]').last()).toHaveValue(
        "2026-11-03",
      );
      await expect(page.locator('input[type="time"]').first()).toHaveValue(
        "10:00",
      );
      await expect(page.locator('input[type="time"]').last()).toHaveValue(
        "18:30",
      );
    });

    test("direct entry routes, place dialog keyboard focus and account", async ({
      page,
    }) => {
      await page.goto("/plan");
      await expect(
        page
          .locator(".reference-welcome, .reference-page, .planner-page")
          .first(),
      ).toBeVisible();
      await page.goto("/discover");
      await expect(page.locator(".place-card")).toHaveCount(5);
      await noOverflow(page);
      const card = page.locator(".place-card-main").first();
      await card.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(
        await page
          .getByRole("dialog")
          .evaluate((dialog) => dialog.contains(document.activeElement)),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(card).toBeFocused();
      await page.goto("/places/00000000-0000-4000-8000-000000000001");
      await expect(page.getByRole("dialog")).toContainText("소담한 식탁");
      await page.reload();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page
        .getByRole("button", { name: words[language].close, exact: true })
        .click();
      await expect(page).toHaveURL(/\/discover$/);
      await page.goto("/account");
      await expect(page.getByRole("dialog")).toBeVisible();
      await noOverflow(page);
      await test.info().attach("account-direct-entry", {
        body: await page.getByRole("dialog").innerText(),
        contentType: "text/plain",
      });
    });

    test("map provider failure retains fallback map, resize, retry and place list", async ({
      page,
    }) => {
      test.setTimeout(60000);
      await page.goto("/discover");
      await expect(page.locator(".place-card")).toHaveCount(5);
      await expect(page.locator(".raster-map")).toBeVisible({ timeout: 20000 });
      await expect(page.locator(".raster-warning")).toBeVisible();
      await expect(page.locator(".leaflet-marker-icon")).toHaveCount(5);
      const original = page.viewportSize()!;
      await page.setViewportSize({
        width: Math.max(320, original.width - 30),
        height: original.height - 150,
      });
      await expect(page.locator(".raster-map")).toBeVisible();
      await noOverflow(page);
      await page.setViewportSize(original);
      await page.locator(".map-fallback-info summary").click();
      await page.locator(".map-fallback-info button").click();
      await expect(page.locator(".raster-map")).toBeVisible({ timeout: 20000 });
      await page.locator(".place-card-main").first().click();
      await expect(page.getByRole("dialog")).toContainText("소담한 식탁");
      await page.keyboard.press("Escape");
      await expect(page.locator(".place-card")).toHaveCount(5);
      const zoom = page.locator(".leaflet-control-zoom-in");
      await test.info().attach("fallback-map-controls", {
        body: JSON.stringify({
          zoom: await zoom.boundingBox(),
          language,
          viewport: page.viewportSize(),
        }),
        contentType: "application/json",
      });
      await reachable(zoom, page);
    });

    test("generation consent reset, edit validation, replacement, save, reload and sharing failure", async ({
      page,
    }) => {
      await generateDemo(page, language);
      const edit = page.locator(".stop-edit-details").first();
      await edit.locator(":scope > summary").click();
      await page
        .getByLabel(words[language].arrival, { exact: true })
        .fill("12:30");
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(
        page.getByRole("button", { name: words[language].save, exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: words[language].share, exact: true }),
      ).toBeDisabled();
      await page
        .getByLabel(words[language].arrival, { exact: true })
        .fill("09:30");
      await edit.locator(".replace-options > summary").click();
      await edit.locator("select").selectOption("demo-market-1");
      await expect(page.locator(".schedule-stop").first()).toContainText(
        "로컬 메이커 골목",
      );
      const save = page.getByRole("button", {
        name: words[language].save,
        exact: true,
      });
      await expect(save).toBeEnabled();
      await save.click();
      await page.reload();
      await expect(page.locator(".schedule-stop").first()).toContainText(
        "로컬 메이커 골목",
      );
      await page
        .getByRole("button", { name: words[language].share, exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText("DEMO");
      await page.evaluate(() =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async () => {
              throw new Error("QA copy blocked");
            },
          },
        }),
      );
      await page
        .getByRole("button", { name: words[language].copy, exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        language === "ko" ? "자동 복사" : "blocked automatic copying",
      );
      await page.evaluate(() =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (text: string) => {
              document.body.dataset.releaseCopied = text;
            },
          },
        }),
      );
      await page
        .getByRole("button", { name: words[language].copy, exact: true })
        .click();
      await expect(page.getByRole("dialog").getByRole("status")).toContainText(
        language === "ko" ? "복사했어요" : "Copied",
      );
      expect(
        await page.locator("body").getAttribute("data-release-copied"),
      ).toContain("DEMO");
      await page
        .getByRole("button", { name: words[language].close, exact: true })
        .click();
      const toggle = page.locator(".result-view-toggle");
      await toggle
        .getByRole("button", { name: words[language].map, exact: true })
        .click();
      await expect(page.locator(".schedule-map")).toBeVisible();
      await toggle
        .getByRole("button", { name: words[language].timeline, exact: true })
        .click();
      await expect(page.locator(".timeline")).toBeVisible();
      await expect(
        toggle.getByRole("button", {
          name: words[language].timeline,
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        toggle.getByRole("button", { name: words[language].map, exact: true }),
      ).toHaveAttribute("aria-pressed", "false");
      if (page.viewportSize()!.width < 900)
        await expect(page.locator(".schedule-map")).toBeHidden();
      await noOverflow(page);
    });

    test("consent never survives back navigation or reload; unsupported generation fails visibly", async ({
      page,
    }) => {
      await start(page, language);
      const consent = page.locator(".checkbox-label input").last();
      await consent.check();
      await page
        .getByRole("button", { name: words[language].back, exact: true })
        .click();
      await page
        .getByRole("button", { name: words[language].next, exact: true })
        .click();
      await expect(consent).not.toBeChecked();
      await consent.check();
      await page.reload();
      await expect(consent).not.toBeChecked();
      for (let i = 0; i < 3; i++)
        await page
          .getByRole("button", { name: words[language].back, exact: true })
          .click();
      await page.locator('input[type="time"]').first().fill("10:00");
      for (let i = 0; i < 3; i++)
        await page
          .getByRole("button", { name: words[language].next, exact: true })
          .click();
      await consent.check();
      await page
        .getByRole("button", { name: words[language].generate, exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        language === "ko" ? "데모에서는" : "The demo supports",
      );
      await expect(page.locator(".schedule-stop")).toHaveCount(0);
    });

    test("login and signup email-verification guidance, required choices and keyboard legal notices", async ({
      page,
    }) => {
      await page.goto("/login");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(
        language === "ko" ? "이메일 소유 확인" : "email",
      );
      const privacy = dialog
        .getByRole("navigation", { name: words[language].legal })
        .locator("summary")
        .filter({
          hasText: language === "ko" ? "개인정보 처리방침" : /Privacy/i,
        });
      await privacy.focus();
      await page.keyboard.press("Space");
      await expect(
        dialog
          .locator(".legal-page")
          .filter({
            hasText: language === "ko" ? "개인정보 처리방침" : /Privacy/i,
          })
          .first(),
      ).toBeVisible();
      await page
        .getByRole("button", { name: words[language].signup, exact: true })
        .click();
      await expect(dialog.locator(".legal-choice input[required]")).toHaveCount(
        4,
      );
      for (const input of await dialog.locator(".legal-choice input").all())
        await expect(input).not.toBeChecked();
      await expect(dialog.locator('input[type="tel"]')).toHaveCount(0);
      await expect(dialog).toContainText(
        language === "ko" ? "이메일 확인 후" : "After email verification",
      );
      await reachable(
        dialog.getByRole("button", {
          name: words[language].close,
          exact: true,
        }),
        page,
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    });

    test("44px controls, focus, no horizontal overflow and bottom-menu reachability", async ({
      page,
    }) => {
      await page.goto("/plan");
      await reachable(
        page.getByRole("button", { name: words[language].start, exact: true }),
        page,
      );
      await start(page, language, 2);
      for (const control of await page
        .locator(".choice-chips button, .wizard-actions button")
        .all())
        await reachable(control, page, true);
      const heading = page.locator(".wizard-heading h1");
      // Focus returns to the wizard heading after advancing the route.
      await page
        .getByRole("button", { name: words[language].next, exact: true })
        .click();
      await expect(heading).toBeFocused();
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => document.activeElement?.tagName),
      ).not.toBe("BODY");
      const bottom = page.locator(".bottom-nav");
      if (await bottom.isVisible())
        for (const button of await bottom.getByRole("button").all())
          await reachable(button, page, true);
      await noOverflow(page);
    });

    test("anonymous account direct entry must offer sign-in rather than signed-in-only actions", async ({
      page,
    }) => {
      await page.goto("/account");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await test.info().attach("anonymous-account", {
        body: await dialog.innerText(),
        contentType: "text/plain",
      });
      await expect(
        dialog.getByRole("button", {
          name: language === "ko" ? "로그아웃" : "Sign out",
          exact: true,
        }),
      ).toHaveCount(0);
    });

    if (language === "en")
      test("English discovery exposes English detail-action labels", async ({
        page,
      }) => {
        await page.goto("/discover");
        await expect(page.locator(".place-card-main")).toHaveCount(5);
        await test.info().attach("discovery-accessible-labels", {
          body: JSON.stringify(
            await page
              .locator(".place-card-main")
              .evaluateAll((buttons) =>
                buttons.map((b) => b.getAttribute("aria-label")),
              ),
          ),
          contentType: "application/json",
        });
        await expect(
          page.getByRole("button", { name: /자세히 보기/ }),
        ).toHaveCount(0);
      });
  });
}
