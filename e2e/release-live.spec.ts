import { test, expect, type Page } from "@playwright/test";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import {
  evaluateSchedule,
  type TripInput,
  type Itinerary,
} from "../shared/planner";
import { destinationId, kakaoAddressEndpoint } from "../shared/destinations";

// These fixtures exist only in test memory, never in the application database.
const destination = {
  id: destinationId("서울 성동구"),
  label: "서울 성동구",
  country: "KR",
  level: "district",
  region1: "서울",
  region2: "성동구",
  region3: "",
  lat: 37.5455,
  lng: 127.053,
  source: {
    provider: "kakao",
    endpoint: kakaoAddressEndpoint,
    addressType: "REGION",
    observedAt: "2026-10-17T00:00:00Z",
    verification: "provider",
    coordinateMeaning: "region_representative",
  },
};
const user = {
  id: "90000000-0000-4000-8000-000000000001",
  email: "release-fixture@example.test",
  email_confirmed_at: "2025-01-01T00:00:00Z",
  created_at: "2025-01-01T00:00:00Z",
};
test.use({ hasTouch: true, reducedMotion: "reduce", serviceWorkers: "block" });
async function boundaries(page: Page, signedIn: boolean) {
  await page.context().routeWebSocket("**", (socket) => socket.close());
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:5173") return route.abort();
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/__release")
    )
      return route.fulfill({
        status: 503,
        json: { error: "RELEASE_QA_UNMOCKED_REQUEST" },
      });
    if (route.request().method() !== "GET") return route.abort();
    return route.continue();
  });
  await page.route(/\/src\/config\.ts(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const config={demo:false,mapStyle:'https://tiles.openfreemap.org/styles/liberty',supabaseUrl:'',supabaseKey:''};`,
    }),
  );
  await page.route(/\/src\/supabase\.ts(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
    const session=${signedIn ? JSON.stringify({ access_token: "test-only-not-a-jwt", user }) : "null"};
    export const supabase={auth:{
      getSession:async()=>({data:{session}}),
      getUser:async()=>({data:{user:session?.user||null},error:null}),
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
      signInWithOtp:async(payload)=>{const r=await fetch('/__release_auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return r.json()},
      signOut:async()=>{await fetch('/__release_signout',{method:'POST'});return {error:null}}
    }};
    export function exchangeAuthCode(){return Promise.resolve({error:null})}
  `,
    }),
  );
  await page.route("**/api/places", (route) =>
    route.fulfill({ json: { places: [], mode: "live" } }),
  );
  await page.route("**/api/itineraries", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/destinations?*", (route) =>
    route.fulfill({
      json: { destinations: [destination], page: 1, hasMore: false },
    }),
  );
  await page.route("**/api/planning/quote", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        cost: 100,
        promo: 300,
        earned: 50,
        held: 0,
        policyVersion: "release-qa-only",
      },
    }),
  );
  await page.route("**/api/me/legal-consents", (route) =>
    route.fulfill({
      json: {
        current: true,
        version: "2026-10-17.1",
        recordedAt: "2026-10-17T00:00:00Z",
        publicLocalArea: false,
      },
    }),
  );
}
function fixturePlan(input: TripInput): Itinerary {
  const schedule = demoSchedule(input);
  const catalog = structuredClone(demoCatalog).map((c) => ({
    ...c,
    name: `QA fixture · ${c.name}`,
    source: {
      ...c.source,
      provider: "localroute" as const,
      verification: "canonical" as const,
    },
  }));
  return {
    id: "90000000-0000-4000-8000-000000000099",
    input,
    catalog,
    schedule: { ...schedule, title: "QA fixture · mocked itinerary" },
    evaluation: evaluateSchedule(schedule, input, catalog),
    revision: 1,
    cost: 100,
    provenance: "gemini",
    createdAt: "2026-10-17T00:00:00Z",
    model: "release-qa-mock-no-model-call",
  };
}
async function review(page: Page, en: boolean) {
  await page.goto("/plan/new/1");
  await page.getByRole("searchbox").fill("성동구");
  await page.getByRole("button", { name: "서울 성동구", exact: true }).click();
  for (let step = 1; step < 4; step++)
    await page
      .getByRole("button", { name: en ? "Continue" : "다음", exact: true })
      .click();
  await expect(page.locator(".lp-confirm")).toContainText("100 LP");
}
for (const language of ["ko", "en"] as const) {
  const en = language === "en";
  test.describe(language, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(
        (lang) => localStorage.setItem("localroute.language", lang),
        language,
      );
    });
    test("mocked live generation failure preserves request identity and recovers failed status without a second submit", async ({
      page,
    }) => {
      await boundaries(page, true);
      const payloads: {
        requestId: string;
        consent: boolean;
        expectedCost: number;
      }[] = [];
      await page.route("**/api/planning/generate", (route) => {
        payloads.push(route.request().postDataJSON());
        return route.fulfill({ status: 503, json: { error: "AI_TIMEOUT" } });
      });
      await page.route("**/api/planning/status/*", (route) =>
        route.fulfill({ json: { status: "failed" } }),
      );
      await review(page, en);
      const generate = page.getByRole("button", {
        name: en ? "Create itinerary · 100 LP" : "100 LP로 일정 만들기",
        exact: true,
      });
      await expect(generate).toBeDisabled();
      expect(payloads).toHaveLength(0);
      await page.locator(".checkbox-label input").last().check();
      await generate.dblclick();
      await expect(page.getByRole("alert")).toContainText(
        en ? "timed out" : "시간이 초과",
      );
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({ consent: true, expectedCost: 100 });
      await page.reload();
      await expect(page.getByRole("alert")).toContainText(
        en ? "request status" : "처리 상태",
      );
      await page
        .getByRole("button", {
          name: en ? "Try again" : "다시 시도",
          exact: true,
        })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        en ? "do not cost LP" : "차감하지 않아요",
      );
      expect(payloads).toHaveLength(1);
      await test.info().attach("mocked-generation-requests", {
        body: JSON.stringify(payloads),
        contentType: "application/json",
      });
    });

    test("mocked live sharing requires consent, handles failure, creates link and revokes", async ({
      page,
    }) => {
      await boundaries(page, true);
      let plan: Itinerary;
      await page.route("**/api/planning/generate", (route) => {
        plan = fixturePlan(route.request().postDataJSON().input);
        return route.fulfill({ status: 201, json: plan });
      });
      const posts: unknown[] = [];
      let revoked = false,
        linked = false;
      const link = {
        id: "90000000-0000-4000-8000-000000000088",
        revision: 1,
        createdAt: "2026-10-17T00:00:00Z",
        expiresAt: "2026-10-24T00:00:00Z",
        revokedAt: null,
      };
      await page.route("**/api/itineraries/*/shares", (route) => {
        if (route.request().method() === "GET")
          return route.fulfill({
            json: linked
              ? [
                  {
                    ...link,
                    revokedAt: revoked ? "2026-10-17T01:00:00Z" : null,
                  },
                ]
              : [],
          });
        posts.push(route.request().postDataJSON());
        if (posts.length === 1)
          return route.fulfill({
            status: 503,
            json: { error: "sharing.failed" },
          });
        linked = true;
        return route.fulfill({
          json: { ...link, path: "/s/release-qa-test-only" },
        });
      });
      await page.route("**/api/itinerary-shares/*", (route) => {
        revoked = true;
        return route.fulfill({ json: {} });
      });
      await review(page, en);
      await page.locator(".checkbox-label input").last().check();
      await page
        .getByRole("button", {
          name: en ? "Create itinerary · 100 LP" : "100 LP로 일정 만들기",
          exact: true,
        })
        .click();
      await expect(page.locator(".schedule-stop")).toHaveCount(5);
      await page
        .getByRole("button", {
          name: en ? "Share itinerary" : "일정 공유",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog"),
        create = dialog.getByRole("button", {
          name: en ? "Create sharing link · free" : "공유 링크 만들기 · 무료",
          exact: true,
        });
      await expect(create).toBeDisabled();
      expect(posts).toHaveLength(0);
      await dialog.getByRole("checkbox").check();
      await create.click();
      await expect(dialog.getByRole("alert")).toContainText(
        en ? "could not be processed" : "처리하지 못했어요",
      );
      await create.click();
      await expect(dialog.locator("input[readonly]")).toHaveValue(
        /\/s\/release-qa-test-only$/,
      );
      expect(posts).toHaveLength(2);
      expect(posts[1]).toMatchObject({
        revision: 1,
        consentVersion: "unlisted-itinerary-v1",
      });
      await expect(dialog.getByRole("checkbox")).not.toBeChecked();
      await dialog
        .getByRole("button", {
          name: en ? "Revoke link" : "링크 공유 해제",
          exact: true,
        })
        .click();
      await expect(
        dialog.getByRole("button", {
          name: en ? "Sharing revoked" : "공유 해제됨",
          exact: true,
        }),
      ).toBeDisabled();
      expect(revoked).toBe(true);
    });

    test("mocked email OTP failure, sent-link guidance and immediate-session misconfiguration", async ({
      page,
    }) => {
      await boundaries(page, false);
      const sent: unknown[] = [];
      let calls = 0,
        signedOut = 0;
      await page.route("**/__release_auth", (route) => {
        sent.push(route.request().postDataJSON());
        calls++;
        return route.fulfill({
          json:
            calls === 1
              ? {
                  data: { session: null },
                  error: { message: "QA fixture mail failure" },
                }
              : calls === 2
                ? { data: { session: null }, error: null }
                : { data: { session: { user } }, error: null },
        });
      });
      await page.route("**/__release_signout", (route) => {
        signedOut++;
        return route.fulfill({ json: {} });
      });
      await page.goto("/login");
      await page
        .getByLabel(en ? "Email" : "이메일", { exact: true })
        .fill("release-fixture@example.test");
      const submit = page.getByRole("button", {
        name: en ? "Send sign-in link" : "로그인 링크 받기",
        exact: true,
      });
      await submit.click();
      await expect(page.getByRole("dialog").getByRole("status")).toContainText(
        en ? /could not send/i : "보내지 못했어요",
      );
      await submit.click();
      await expect(page.getByRole("dialog").getByRole("status")).toContainText(
        en ? /verification link/i : "인증 링크를 보냈어요",
      );
      await submit.click();
      await expect(page.getByRole("dialog").getByRole("status")).toContainText(
        en ? /email verification settings/i : "이메일 확인 설정",
      );
      expect(signedOut).toBe(1);
      expect(sent).toHaveLength(3);
      expect(sent[0]).toMatchObject({ options: { shouldCreateUser: false } });
    });
    test("verified legal-status failure blocks planning and retry restores it", async ({
      page,
    }) => {
      await boundaries(page, true);
      let lookupFails = true;
      await page.route("**/api/me/legal-consents", (route) =>
        lookupFails
          ? route.fulfill({ status: 503, json: {} })
          : route.fulfill({
              json: {
                current: true,
                version: "2026-10-17.1",
                recordedAt: "2026-10-17T00:00:00Z",
                publicLocalArea: false,
              },
            }),
      );
      await page.goto("/plan");
      await expect(page.getByRole("alert")).toContainText(
        en ? "Could not check consent" : "동의 기록을 확인하지 못했어요",
      );
      await expect(page.locator(".planner-page")).toHaveCount(0);
      lookupFails = false;
      await page
        .getByRole("button", { name: en ? "Retry" : "다시 확인", exact: true })
        .click();
      await expect(page.locator(".planner-page")).toBeVisible();
      await page.locator('footer a[href="/legal/privacy"]').click();
      await expect(page.locator(".legal-page")).toBeVisible();
    });
    for (const documentId of ["privacy", "terms", "transfers", "location"]) {
      test(`public legal document ${documentId} supports direct loading and refresh`, async ({
        page,
      }) => {
        await boundaries(page, true);
        await page.goto(`/legal/${documentId}`);
        await expect(page.locator(".legal-page")).toHaveAttribute(
          "lang",
          language,
        );
        await expect(
          page.locator('.legal-page-links a[aria-current="page"]'),
        ).toHaveAttribute("href", `/legal/${documentId}`);
        await page.reload();
        await expect(page.locator(".legal-page h2")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        for (const link of await page.locator(".legal-page-links a").all()) {
          const box = await link.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
      });
    }
  });
}
