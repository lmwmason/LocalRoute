import { expect, test, type Page } from "@playwright/test";
import { demoPlaces } from "../shared/demo";
import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import {
  evaluateSchedule,
  type Itinerary,
  type TripInput,
} from "../shared/planner";

const user = {
  id: "90000000-0000-4000-8000-000000000001",
  email: "route-fixture@example.test",
  email_confirmed_at: "2025-01-01T00:00:00Z",
  created_at: "2025-01-01T00:00:00Z",
};
const planId = "90000000-0000-4000-8000-000000000099";
// All providers and auth writes are mocked; no account, email or database changes.
async function setup(
  page: Page,
  mode: "demo" | "guest" | "member" | "deleted",
) {
  const demo = mode === "demo";
  await page.context().routeWebSocket("**", (socket) => socket.close());
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:5173") return route.abort();
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 503,
        json: { error: "TEST_UNMOCKED_REQUEST" },
      });
    if (route.request().method() !== "GET") return route.abort();
    return route.continue();
  });
  await page.route(/\/src\/config\.ts(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const config={demo:${demo},mapStyle:'https://tiles.openfreemap.org/styles/liberty',supabaseUrl:'',supabaseKey:''};`,
    }),
  );
  await page.route(/\/src\/supabase\.ts(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: demo
        ? `export const supabase=null; export const exchangeAuthCode=()=>undefined; export const readAuthCallback=()=>({present:false});`
        : `
      let session=${mode === "member" || mode === "deleted" ? JSON.stringify({ access_token: "fixture-not-a-real-token", user }) : "null"};
      export const supabase={auth:{
        getSession:async()=>({data:{session},error:null}),
        getUser:async()=>{globalThis.__routeVerified=(globalThis.__routeVerified||0)+1;return {data:{user:${mode === "deleted" ? "null" : "session?.user||null"}},error:${mode === "deleted" ? '{message:"User not found"}' : "null"}}},
        signOut:async()=>{session=null;globalThis.__routeSignedOut=(globalThis.__routeSignedOut||0)+1;return {error:null}},
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
      }};
      export const exchangeAuthCode=()=>undefined;
      export const readAuthCallback=()=>({present:false});
    `,
    }),
  );
  await page.route("**/api/places", (route) =>
    route.fulfill({ json: { places: [] } }),
  );
  await page.route("**/api/itineraries", (route) =>
    route.fulfill({ json: [] }),
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
function fixturePlan(): Itinerary {
  const input: TripInput = {
    destination: "seongsu",
    startDate: "2026-11-03",
    endDate: "2026-11-03",
    startTime: "09:30",
    endTime: "20:00",
    purpose: "food",
    activities: ["food"],
    foodTypes: ["korean"],
    budget: "moderate",
    companions: "couple",
    mobility: "walking",
    pace: "balanced",
    dietary: "",
    allowUnverifiedDietary: false,
    transferBufferMinutes: 20,
    language: "ko",
  };
  const schedule = demoSchedule(input);
  return {
    id: planId,
    input,
    schedule,
    catalog: demoCatalog,
    evaluation: evaluateSchedule(schedule, input, demoCatalog),
    revision: 1,
    cost: 0,
    provenance: "demo",
    model: "test-fixture",
    createdAt: "2026-10-17T00:00:00Z",
  };
}
test("an unresolved generation can be stopped to edit dates without another AI call", async ({
  page,
}) => {
  await setup(page, "member");
  const requestId = "90000000-0000-4000-8000-000000000088";
  await page.addInitScript(
    ({ actor, requestId, input }) => {
      sessionStorage.setItem(
        `localroute.planning.pending.${actor}`,
        JSON.stringify({
          requestId,
          input,
          expectedCost: 0,
          policyVersion: "fixture",
          consent: true,
        }),
      );
    },
    { actor: user.id, requestId, input: fixturePlan().input },
  );
  await page.route("**/api/planning/quote", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        cost: 0,
        promo: 100,
        earned: 0,
        held: 0,
        policyVersion: "fixture",
      },
    }),
  );
  let cancelled = 0,
    generated = 0;
  await page.route("**/api/planning/cancel/*", (route) => {
    cancelled++;
    return route.fulfill({ json: { status: "failed" } });
  });
  await page.route("**/api/planning/generate", (route) => {
    generated++;
    return route.fulfill({ status: 503, json: {} });
  });
  await page.goto("/plan/new/4");
  const back = page.getByRole("button", { name: "이전", exact: true });
  await expect(back).toBeEnabled();
  await back.click();
  await expect(page).toHaveURL(/\/plan\/new\/3$/);
  await expect.poll(() => cancelled).toBe(1);
  await expect(back).toBeEnabled();
  await back.click();
  await back.click();
  await expect(page).toHaveURL(/\/plan\/new\/1$/);
  await page.getByLabel("마지막 날", { exact: true }).fill("2026-11-04");
  await expect(page.getByLabel("마지막 날", { exact: true })).toHaveValue(
    "2026-11-04",
  );
  expect(
    await page.evaluate(
      (actor) => sessionStorage.getItem(`localroute.planning.pending.${actor}`),
      user.id,
    ),
  ).toBeNull();
  expect(generated).toBe(0);
});
test("direct core pages render without runtime errors", async ({ page }) => {
  await setup(page, "demo");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of [
    "/plan",
    "/discover",
    "/saved",
    "/account",
    "/login",
    "/contribute",
  ]) {
    await page.goto(path);
    await expect(page.locator("#main")).toBeVisible();
    if (["/account", "/login", "/contribute"].includes(path))
      await expect(page.getByRole("dialog")).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test("My trips displays account itineraries without requiring bookmarks", async ({
  page,
}) => {
  await setup(page, "member");
  const plans = [20, 21, 22, 23].map((day) => ({
    ...fixturePlan(),
    id: `90000000-0000-4000-8000-0000000000${day}`,
    provenance: "operator_example" as const,
    input: {
      ...fixturePlan().input,
      startDate: `2026-10-${day}`,
      endDate: `2026-10-${day}`,
    },
    schedule: { ...fixturePlan().schedule, title: `예약 시연 · 10월 ${day}일` },
  }));
  await page.route("**/api/itineraries", (route) =>
    route.fulfill({
      json: plans.map((result) => ({ id: result.id, result, revision: 1 })),
    }),
  );
  await page.goto("/saved");
  await expect(
    page.getByRole("heading", { name: "저장한 여행 일정", exact: true }),
  ).toBeVisible();
  for (const plan of plans)
    await expect(
      page.locator(`a[href="/itineraries/${plan.id}"]`),
    ).toContainText(plan.schedule.title);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("missing place, feedback and report URLs return to discovery", async ({
  page,
}) => {
  await setup(page, "demo");
  for (const path of [
    "/places/missing",
    "/feedback?place=missing",
    "/reports?place=missing",
    "/feedback",
    "/reports",
  ]) {
    await page.goto(path);
    await expect(
      page
        .getByRole("dialog")
        .getByRole("heading", { name: "장소를 확인할 수 없어요" }),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "동네 발견", exact: true })
      .click();
    await expect(page).toHaveURL(/\/discover$/);
  }
});
test("missing demo itinerary and unknown page explain how to continue", async ({
  page,
}) => {
  await setup(page, "demo");
  await page.goto(`/itineraries/${planId}`);
  await expect(
    page.getByRole("heading", { name: "일정을 불러오지 못했어요" }),
  ).toBeVisible();
  await page.goto("/unavailable-route");
  await expect(
    page.getByRole("heading", { name: "페이지를 찾을 수 없어요" }),
  ).toBeVisible();
  await page
    .locator("#main")
    .getByRole("button", { name: "일정 만들기", exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan$/);
});
test("place and contribution history supports back and forward", async ({
  page,
}) => {
  await setup(page, "demo");
  await page.goto("/discover");
  await page.getByRole("button", { name: "소담한 식탁 자세히 보기" }).click();
  await expect(page).toHaveURL(/\/places\//);
  await page.getByRole("button", { name: "나도 추천하기" }).click();
  await expect(page).toHaveURL(/\/contribute\?place=/);
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "동네의 발견" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole("dialog", { name: "동네의 발견" })).toBeVisible();
});
test("deleted cached account is verified and cleared locally before member UI", async ({
  page,
}) => {
  await setup(page, "deleted");
  await page.goto("/account");
  await expect(
    page.getByRole("dialog", { name: "LocalRoute 로그인" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(globalThis, "__routeSignedOut") || 0),
    )
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() => Reflect.get(globalThis, "__routeVerified")),
  ).toBeGreaterThan(0);
  await expect(page.getByText(user.email, { exact: true })).toHaveCount(0);
});
test("private direct itinerary explains login and browser back returns from login", async ({
  page,
}) => {
  await setup(page, "guest");
  await page.goto(`/itineraries/${planId}`);
  await expect(
    page.getByRole("heading", { name: "로그인 후 일정을 확인해 주세요" }),
  ).toBeVisible();
  await page
    .locator(".planner-page")
    .getByRole("button", { name: "로그인", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/itineraries/${planId}$`));
  await expect(
    page.getByRole("heading", { name: "로그인 후 일정을 확인해 주세요" }),
  ).toBeVisible();
});
test("direct saved itinerary failure displays retry and recovers without generation", async ({
  page,
}) => {
  await setup(page, "member");
  let fails = true;
  await page.route(`**/api/itineraries/${planId}`, (route) =>
    fails
      ? route.fulfill({ status: 503, json: { error: "TEST_OFFLINE" } })
      : route.fulfill({ json: fixturePlan() }),
  );
  await page.goto(`/itineraries/${planId}`);
  await expect(
    page.getByRole("heading", { name: "일정을 불러오지 못했어요" }),
  ).toBeVisible();
  await expect(page.locator(".planner-page [role=alert]")).toBeVisible();
  fails = false;
  await page
    .locator(".planner-page")
    .getByRole("button", { name: "다시 시도", exact: true })
    .click();
  await expect(page.locator(".schedule-stop")).toHaveCount(5);
});
test("direct place failure can retry and recover the exact selected place", async ({
  page,
}) => {
  await setup(page, "guest");
  const place = demoPlaces[0];
  let fails = true;
  await page.route(`**/api/places/${place.id}`, (route) =>
    fails
      ? route.fulfill({ status: 404, json: { error: "PLACE_NOT_FOUND" } })
      : route.fulfill({ json: place }),
  );
  await page.goto(`/places/${place.id}`);
  await expect(
    page.getByRole("heading", { name: "장소를 확인할 수 없어요" }),
  ).toBeVisible();
  fails = false;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "다시 시도", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: place.name, exact: true }),
  ).toBeVisible();
});

test("a delayed discovery catalog cannot erase a directly loaded place", async ({
  page,
}) => {
  await setup(page, "guest");
  let releaseCatalog: (() => void) | undefined;
  let placeLookups = 0;
  await page.route(
    "**/api/places",
    (route) =>
      new Promise<void>((resolve) => {
        releaseCatalog = () => {
          void route.fulfill({ json: { places: [] } }).then(resolve);
        };
      }),
  );
  const place = demoPlaces[0];
  await page.route(`**/api/places/${place.id}`, (route) => {
    placeLookups++;
    return route.fulfill({ json: place });
  });
  await page.goto(`/places/${place.id}`);
  const title = page
    .getByRole("dialog")
    .getByRole("heading", { name: place.name, exact: true });
  await expect(title).toBeVisible();
  await expect.poll(() => typeof releaseCatalog).toBe("function");
  const initialLookups = placeLookups;
  releaseCatalog!();
  await expect(page.locator(".section-heading")).toContainText("1곳의 발견");
  await expect(title).toBeVisible();
  expect(placeLookups).toBe(initialLookups);
});

test("a late auth verification cannot restore the previous account", async ({
  page,
}) => {
  await setup(page, "member");
  const nextUser = {
    ...user,
    id: "90000000-0000-4000-8000-000000000002",
    email: "next-route-fixture@example.test",
  };
  await page.route(/\/src\/supabase\.ts(?:\?|$)/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
      const firstUser=${JSON.stringify(user)}, nextUser=${JSON.stringify(nextUser)};
      let session={access_token:'first',user:firstUser};
      export const supabase={auth:{
        getSession:async()=>({data:{session},error:null}),
        getUser:async(token)=>token==='first'?new Promise(resolve=>{globalThis.__routeResolveOld=()=>resolve({data:{user:firstUser},error:null})}):({data:{user:nextUser},error:null}),
        signOut:async()=>({error:null}),
        onAuthStateChange:(listener)=>{globalThis.__routeChangeAccount=()=>{session={access_token:'next',user:nextUser};listener('SIGNED_IN',session)};return {data:{subscription:{unsubscribe(){}}}}}
      }};
      export const exchangeAuthCode=()=>undefined;
    `,
    }),
  );
  await page.goto("/account");
  await expect
    .poll(() =>
      page.evaluate(() => typeof Reflect.get(globalThis, "__routeResolveOld")),
    )
    .toBe("function");
  await page.evaluate(() => Reflect.get(globalThis, "__routeChangeAccount")());
  await expect(page.getByText(nextUser.email, { exact: true })).toBeVisible();
  await page.evaluate(() => Reflect.get(globalThis, "__routeResolveOld")());
  await expect(page.getByText(nextUser.email, { exact: true })).toBeVisible();
  await expect(page.getByText(user.email, { exact: true })).toHaveCount(0);
});
