import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const placeId = "70000000-0000-4000-8000-000000000003";
const venue = {
  placeId,
  externalId: "fixture-cafe",
  name: "하이드미플리즈 을지로점",
  address: "서울 중구 을지로11길 33 2층",
  supported: true,
};
const dates = [20, 21, 22, 23].map((day) => `2026-10-${day}`);
const labels = (ko: boolean) => ({
  open: ko ? "예약하기" : "Book a table",
  time: ko ? "희망 일시 (한국 시간)" : "Requested date and time (Korea)",
  preview: ko ? "내용 확인" : "Review details",
  send: ko ? "동의하고 예약 요청" : "Agree and request booking",
  edit: ko ? "수정" : "Edit",
});

describe("itinerary booking prefills (mock API only)", () => {
  let browser: Browser, server: ViteDevServer, base: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      envDir: false,
      envPrefix: "MOCK_BOOKING_NO_ENV_",
      cacheDir: "/tmp/localroute-booking-prefill-vite",
      logLevel: "silent",
      plugins: [
        {
          name: "no-auth-network",
          enforce: "pre",
          load(id) {
            if (id.split("?")[0] === resolve("src/supabase.ts"))
              return "export const supabase=null; export function exchangeAuthCode(){return undefined}";
          },
        },
        react(),
      ],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw Error("No fixture address");
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch();
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });
  async function setup(
    ko = false,
    width = 390,
    mode = "editor",
    existingOn20 = false,
  ) {
    // A deliberately different browser timezone catches accidental UTC/browser conversions.
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      timezoneId: "America/Los_Angeles",
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    const calls: {
      path: string;
      method: string;
      body: Record<string, unknown> | null;
      date: string | null;
    }[] = [];
    let delayedVenue: Promise<void> | null = null,
      releaseVenue: () => void = () => {},
      venueCalls = 0,
      submitFailure = false;
    await context.routeWebSocket("**", (socket) => socket.close());
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin !== base) return route.abort();
      if (!url.pathname.startsWith("/api/")) return route.continue();
      calls.push({
        path: url.pathname,
        method: request.method(),
        body: request.postDataJSON(),
        date: url.searchParams.get("date"),
      });
      if (url.pathname === "/api/booking/reservations/existing")
        return route.fulfill({
          json: {
            reservation:
              existingOn20 && url.searchParams.get("date") === dates[0]
                ? {
                    id: "80000000-0000-4000-8000-000000000001",
                    requestId: "80000000-0000-4000-8000-000000000002",
                    placeId,
                    state: "pending",
                    reservationTime: "2026-10-20T13:15:00+09:00",
                    guestCount: 2,
                    providerReference: null,
                    expiresAt: null,
                    updatedAt: "2026-10-17T00:00:00Z",
                    revision: 1,
                    reconciliationRequired: false,
                  }
                : null,
          },
        });
      if (url.pathname.endsWith("/capabilities"))
        return route.fulfill({ json: { enabled: true } });
      if (url.pathname.includes("/venues/")) {
        venueCalls++;
        const delay = delayedVenue;
        delayedVenue = null;
        if (delay) await delay;
        return route.fulfill({ json: venue });
      }
      if (url.pathname.endsWith("/profile"))
        return route.fulfill({
          json: { guestName: "Mock Guest", guestPhone: "01000000000" },
        });
      if (
        url.pathname.endsWith("/reservations") &&
        request.method() === "POST"
      ) {
        if (submitFailure)
          return route.fulfill({
            status: 503,
            json: { error: "booking.network" },
          });
        return route.fulfill({
          json: {
            ...request.postDataJSON(),
            id: "80000000-0000-4000-8000-000000000001",
            state: "pending",
            providerReference: null,
            expiresAt: null,
            updatedAt: "2026-10-17T00:00:00Z",
            revision: 1,
            reconciliationRequired: false,
          },
        });
      }
      if (url.pathname.includes("/requests/"))
        return route.fulfill({
          json: {
            id: "80000000-0000-4000-8000-000000000001",
            placeId,
            requestId: url.pathname.split("/").at(-1),
            state: "pending",
            reservationTime: "2026-10-20T13:15:00+09:00",
            guestCount: 2,
            providerReference: null,
            expiresAt: null,
            updatedAt: "2026-10-17T00:00:00Z",
            revision: 1,
            reconciliationRequired: false,
          },
        });
      return route.fulfill({
        status: 503,
        json: { error: "booking.unavailable" },
      });
    });
    await context.addInitScript(
      (language) => localStorage.setItem("localroute.language", language),
      ko ? "ko" : "en",
    );
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.goto(
      `${base}/tests/booking-itinerary-harness.html?lang=${ko ? "ko" : "en"}&mode=${mode}`,
    );
    return {
      page,
      context,
      calls,
      venueCalls: () => venueCalls,
      delayVenue() {
        delayedVenue = new Promise<void>((r) => (releaseVenue = r));
        return () => releaseVenue();
      },
      failSubmit() {
        submitFailure = true;
      },
    };
  }
  const submissions = (calls: { method: string; path: string }[]) =>
    calls.filter(
      (c) => c.method === "POST" && c.path.endsWith("/reservations"),
    );
  async function preview(page: Page, ko = false) {
    const t = labels(ko);
    await page
      .getByLabel(ko ? "예약자 이름" : "Guest name", { exact: true })
      .fill("Mock Guest");
    await page.getByRole("button", { name: t.preview, exact: true }).click();
    await page.getByRole("checkbox").check();
  }

  for (const ko of [true, false]) {
    it(`${ko ? "ko" : "en"}: a failed booking lookup offers retry and recovers without submitting a reservation`, async () => {
      const { page, context, calls } = await setup(ko, 390, "form");
      try {
        await page
          .getByRole("button", { name: labels(ko).open, exact: true })
          .waitFor();
        let attempts = 0;
        await context.route("**/api/booking/venues/*", async (route) => {
          attempts++;
          await route.fulfill(
            attempts === 1
              ? { status: 503, json: { error: "booking.unavailable" } }
              : { json: venue },
          );
        });
        await page.reload();
        const retry = page.getByRole("button", {
          name: ko ? "예약 정보 다시 확인" : "Retry booking details",
          exact: true,
        });
        await retry.waitFor();
        expect(await page.getByRole("alert").innerText()).not.toContain(
          "권한 확인 후",
        );
        await retry.click();
        await page
          .getByRole("button", { name: labels(ko).open, exact: true })
          .waitFor();
        expect(attempts).toBe(2);
        expect(submissions(calls)).toHaveLength(0);
      } finally {
        await context.close();
      }
    }, 30000);
  }

  for (const ko of [true, false])
    for (const width of [360, 390]) {
      it(`${ko ? "ko" : "en"} ${width}px: reuses an existing pending October 20 reservation and keeps October 21 separately bookable without submitting`, async () => {
        const { page, context, calls } = await setup(ko, width, "editor", true);
        const t = labels(ko);
        try {
          const pending = ko
            ? "예약 요청됨 · 확정 대기"
            : "Requested · awaiting confirmation";
          await page.getByRole("status").filter({ hasText: pending }).waitFor();
          expect(
            await page
              .getByRole("button", { name: t.open, exact: true })
              .count(),
          ).toBe(0);
          expect(await page.getByLabel(t.time, { exact: true }).count()).toBe(
            0,
          );
          await page
            .getByRole("group", { name: "Fixture plans" })
            .getByRole("button", { name: dates[1], exact: true })
            .click();
          const open = page.getByRole("button", { name: t.open, exact: true });
          await open.waitFor();
          expect(
            await page.getByRole("status").filter({ hasText: pending }).count(),
          ).toBe(0);
          await open.click();
          expect(
            await page.getByLabel(t.time, { exact: true }).inputValue(),
          ).toBe(`${dates[1]}T13:15`);
          await page
            .getByRole("group", { name: "Fixture plans" })
            .getByRole("button", { name: dates[0], exact: true })
            .click();
          await page.getByRole("status").filter({ hasText: pending }).waitFor();
          expect(
            await page
              .getByRole("button", { name: t.open, exact: true })
              .count(),
          ).toBe(0);
          expect(
            calls
              .filter(
                (call) => call.path === "/api/booking/reservations/existing",
              )
              .map((call) => call.date),
          ).toEqual([dates[0], dates[1], dates[0]]);
          expect(calls.filter((call) => call.method !== "GET")).toHaveLength(0);
          expect(submissions(calls)).toHaveLength(0);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
        } finally {
          await context.close();
        }
      }, 30000);
      it(`${ko ? "ko" : "en"} ${width}px: each October 20–23 plan passes its actual day and 13:15, editable before review`, async () => {
        const { page, context, calls } = await setup(ko, width),
          t = labels(ko);
        try {
          for (const date of dates) {
            await page
              .getByRole("group", { name: "Fixture plans" })
              .getByRole("button", { name: date, exact: true })
              .click();
            await page
              .getByRole("button", { name: t.open, exact: true })
              .click();
            const time = page.getByLabel(t.time, { exact: true });
            await time.waitFor();
            expect(await time.inputValue()).toBe(`${date}T13:15`);
            await time.fill(`${date}T14:45`);
            await preview(page, ko);
            expect(await time.getAttribute("readonly")).not.toBeNull();
            await page
              .getByRole("button", { name: t.edit, exact: true })
              .click();
            await time.fill(`${date}T15:00`);
            await page
              .getByRole("button", { name: t.preview, exact: true })
              .click();
            expect(await page.getByRole("checkbox").isChecked()).toBe(false);
            expect(
              await page
                .getByRole("button", { name: t.send, exact: true })
                .isDisabled(),
            ).toBe(true);
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            for (const c of await page
              .locator(
                ".lr-booking button,.lr-booking input:not([type=checkbox]),.lr-booking-consent",
              )
              .all()) {
              const box = await c.boundingBox();
              if (box) expect(box.height).toBeGreaterThanOrEqual(44);
            }
          }
          expect(submissions(calls)).toHaveLength(0);
        } finally {
          await context.close();
        }
      }, 60000);
    }
  it("changing a multi-day itinerary tab resets an open review/consent and loads the next day's planned time", async () => {
    const { page, context, calls } = await setup(false, 390, "editor&multi");
    try {
      await page
        .getByRole("button", { name: "Book a table", exact: true })
        .click();
      await preview(page);
      await page
        .locator(".day-tabs button")
        .filter({ hasText: "2026-10-21" })
        .click();
      await page
        .getByRole("button", { name: "Book a table", exact: true })
        .click();
      const time = page.getByLabel(labels(false).time);
      await time.waitFor();
      expect(await time.inputValue()).toBe("2026-10-21T13:15");
      expect(await time.getAttribute("readonly")).toBeNull();
      expect(await page.getByRole("checkbox").count()).toBe(0);
      expect(submissions(calls)).toHaveLength(0);
    } finally {
      await context.close();
    }
  });
  it("props reset review and consent while preserving ordinary date overrides and reusing venue facts; legacy empty props stay empty", async () => {
    const { page, context, calls, venueCalls } = await setup(
      false,
      360,
      "form",
    );
    try {
      await page
        .getByRole("button", { name: "Book a table", exact: true })
        .click();
      const time = page.getByLabel(labels(false).time);
      await time.fill("2026-10-23T17:00");
      await page.getByRole("button", { name: "Unchanged context" }).click();
      expect(await time.inputValue()).toBe("2026-10-23T17:00");
      await preview(page);
      const count = venueCalls();
      await page
        .getByRole("button", { name: "2026-10-21", exact: true })
        .click();
      await page.waitForTimeout(100);
      await page
        .getByRole("button", { name: "2026-10-22", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Book a table", exact: true })
        .click();
      await time.waitFor();
      expect(await time.inputValue()).toBe("2026-10-22T13:15");
      expect(venueCalls()).toBe(count);
      await page.waitForTimeout(100);
      expect(await time.inputValue()).toBe("2026-10-22T13:15");
      expect(await page.getByRole("checkbox").count()).toBe(0);
      await page.getByRole("button", { name: "Change planned time" }).click();
      await page
        .getByRole("button", { name: "Book a table", exact: true })
        .click();
      expect(await time.inputValue()).toBe("2026-10-22T14:30");
      await page.getByRole("button", { name: "Clear prefill" }).click();
      await page
        .getByRole("button", { name: "Book a table", exact: true })
        .click();
      expect(await time.inputValue()).toBe("");
      expect(submissions(calls)).toHaveLength(0);
    } finally {
      await context.close();
    }
  });
  it("submits the edited KST time exactly once only after customer review and separate consent", async () => {
    const { page, context, calls } = await setup(false, 390, "form");
    try {
      await page
        .getByRole("button", { name: "Book a table", exact: true })
        .click();
      await page.getByLabel(labels(false).time).fill("2026-10-23T18:45");
      await preview(page);
      expect(submissions(calls)).toHaveLength(0);
      await page
        .getByRole("button", { name: labels(false).send, exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Requested · awaiting confirmation" })
        .waitFor();
      expect(submissions(calls)).toHaveLength(1);
      expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
        reservationTime: "2026-10-23T18:45:00+09:00",
        guestName: "Mock Guest",
        guestPhone: "01000000000",
        consent: true,
      });
    } finally {
      await context.close();
    }
  });
  it("isolates ambiguous recovery to the original date without resending that request", async () => {
    const { page, context, calls, failSubmit } = await setup(
      false,
      390,
      "form",
    );
    try {
      failSubmit();
      await page
        .getByRole("button", { name: "Book a table", exact: true })
        .click();
      await preview(page);
      await page
        .getByRole("button", { name: labels(false).send, exact: true })
        .click();
      await page.getByRole("alert").waitFor();
      await page
        .getByRole("button", { name: "2026-10-21", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Book a table", exact: true })
        .click();
      expect(await page.getByLabel(labels(false).time).inputValue()).toBe(
        "2026-10-21T13:15",
      );
      await page
        .getByRole("button", { name: "2026-10-20", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Book a table", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Requested · awaiting confirmation" })
        .waitFor();
      expect(submissions(calls)).toHaveLength(1);
      expect(calls.some((c) => c.path.includes("/requests/"))).toBe(true);
      expect(await page.getByLabel(labels(false).time).count()).toBe(0);
    } finally {
      await context.close();
    }
  });
});
