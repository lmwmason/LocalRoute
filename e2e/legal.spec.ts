import { expect, test, type Page } from "@playwright/test";
test.beforeEach(async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await page.routeWebSocket("**", (socket) => socket.close());
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin !== origin || url.pathname.startsWith("/api/")
      ? route.abort()
      : route.continue();
  });
});
const version = "2026-10-17.1";
const complete = {
  current: true,
  version,
  recordedAt: "2026-10-17T00:00:00Z",
  publicLocalArea: false,
};
const incomplete = {
  current: false,
  version: null,
  recordedAt: null,
  publicLocalArea: false,
};
async function mockClient(page: Page) {
  // Replaces the network boundary, not the component or validation. No Auth or provider call.
  await page.route(/\/src\/legal\/client\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export async function requestLegalConsent(payload) {
      const response = await fetch('/__legal_fixture_api', {method: payload ? 'POST' : 'GET', headers: {'Content-Type':'application/json'}, ...(payload ? {body:JSON.stringify(payload)} : {})});
      if (!response.ok) throw new Error('fixture failure'); return response.json();
    }`,
    }),
  );
}
async function acceptRequired(page: Page) {
  for (const input of await page.locator(".legal-choice input[required]").all())
    await input.check();
}
test("signup notices: separate required choices, keyboard reading, no booking contact", async ({
  page,
}) => {
  await page.goto("/tests/legal-harness.html?screen=login");
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await expect(page.locator(".legal-choice input[required]")).toHaveCount(4);
  for (const box of await page.locator(".legal-choice input").all())
    await expect(box).not.toBeChecked();
  await expect(page.locator('input[type="tel"]')).toHaveCount(0);
  await expect(page.locator('input[name="guestPhone"]')).toHaveCount(0);
  const privacy = page
    .locator("summary")
    .filter({ hasText: "개인정보 처리방침" });
  await privacy.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("heading", { name: "개인정보 처리방침", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "8. 위탁·국외 처리·변경" })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY",
  );
});
test("verified consent fails closed, retries idempotently and allows optional refusal", async ({
  page,
}) => {
  await mockClient(page);
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/__legal_fixture_api", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: incomplete });
    bodies.push(route.request().postDataJSON());
    return bodies.length === 1
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: complete });
  });
  await page.goto("/tests/legal-harness.html");
  await expect(page.getByText("MEMBER_CONTENT")).toHaveCount(0);
  const save = page.getByRole("button", {
    name: "동의 설정 저장",
    exact: true,
  });
  await expect(save).toBeDisabled();
  await acceptRequired(page);
  await expect(save).toBeEnabled();
  for (const label of await page.locator(".legal-choice").all()) {
    const box = await label.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    const input = await label.locator("input").boundingBox();
    const text = await label.locator("span").boundingBox();
    expect(input).not.toBeNull();
    expect(text).not.toBeNull();
    expect(text!.x - (input!.x + input!.width)).toBeGreaterThanOrEqual(9);
    expect(Math.abs(text!.y - input!.y)).toBeLessThanOrEqual(2);
    expect(text!.x + text!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
  }
  await save.click();
  await expect(page.getByRole("alert")).toContainText(
    "동의는 완료되지 않았습니다",
  );
  await expect(page.getByText("MEMBER_CONTENT")).toHaveCount(0);
  await save.click();
  await expect(page.getByText("MEMBER_CONTENT")).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[0].requestId).toBe(bodies[1].requestId);
  expect(bodies[0].publicLocalArea).toBe(false);
  expect(bodies[0].version).toBe(version);
  expect(bodies[0]).not.toHaveProperty("recordedAt");
  expect(bodies[0]).not.toHaveProperty("userId");
});
test("English consent settings permit publication withdrawal and reduced motion", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("localroute.language", "en"),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockClient(page);
  let saved: Record<string, unknown> | null = null;
  await page.route("**/__legal_fixture_api", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { ...complete, publicLocalArea: true } });
    saved = route.request().postDataJSON();
    return route.fulfill({ json: complete });
  });
  await page.goto("/tests/legal-harness.html?settings");
  const optional = page.getByRole("checkbox", {
    name: "[Optional]",
    exact: false,
  });
  await expect(optional).toBeChecked();
  await optional.uncheck();
  await acceptRequired(page);
  await page
    .getByRole("button", { name: "Save consent settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Consent settings saved",
  );
  expect(saved).toMatchObject({ language: "en", publicLocalArea: false });
  await page
    .locator("summary")
    .filter({ hasText: "Overseas transfers and processors" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Overseas transfers and processors",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("failed status lookup blocks membership and has a working retry", async ({
  page,
}) => {
  await mockClient(page);
  let attempts = 0;
  await page.route("**/__legal_fixture_api", (route) =>
    ++attempts === 1
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: complete }),
  );
  await page.goto("/tests/legal-harness.html");
  await expect(page.getByRole("alert")).toContainText(
    "동의 기록을 확인하지 못했어요",
  );
  await expect(page.getByText("MEMBER_CONTENT")).toHaveCount(0);
  await page.getByRole("button", { name: "다시 확인", exact: true }).click();
  await expect(page.getByText("MEMBER_CONTENT")).toBeVisible();
});
