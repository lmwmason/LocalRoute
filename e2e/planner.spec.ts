import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/");
});
test("compact planning home, explicit free demo consent, editable itinerary and map toggle", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "어떤 여행을 떠나고 싶나요?" }),
  ).toBeVisible();
  await expect(page.locator(".reference-stop")).toHaveCount(5);
  await expect(page.locator(".reference-stop img")).toHaveCount(0);
  await page
    .getByRole("button", { name: "나의 여행 계획하기", exact: true })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const create = page.getByRole("button", {
    name: "가상 일정 만들기 · 무료",
    exact: true,
  });
  await expect(create).toBeDisabled();
  await expect(page.locator(".lp-confirm")).toContainText("0 LP");
  await page
    .getByRole("checkbox", {
      name: "가격과 검증되지 않은 정보를 확인했고 일정을 만들겠습니다.",
    })
    .check();
  await create.click();
  await expect(page.locator(".schedule-stop")).toHaveCount(5);
  await page
    .locator(".stop-edit-details")
    .first()
    .locator(":scope > summary")
    .click();
  await page.getByLabel("방문 시작 1", { exact: true }).fill("12:30");
  await expect(
    page.getByRole("button", { name: "변경 내용 저장 · 무료", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("방문 시작 1", { exact: true }).fill("09:30");
  await page
    .getByRole("group", { name: "일정 보기 방식" })
    .getByRole("button", { name: "지도", exact: true })
    .click();
  await expect(page.locator(".schedule-map")).toBeVisible();
  await page
    .getByRole("group", { name: "일정 보기 방식" })
    .getByRole("button", { name: "일정", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("English planning and email-verification signup include city-sensitive locality without transmitting booking contact details", async ({
  page,
}) => {
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What kind of trip feels like you?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Plan my trip", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Create a sample itinerary · free",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "로그인", exact: true })
    .count()
    .then(async (count) => {
      if (count) throw new Error("Untranslated login control");
    });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await page.getByLabel("Home city", { exact: true }).fill("충주시");
  await page
    .getByLabel("District or neighborhood (optional)", { exact: true })
    .fill("살미면");
  await expect(page.getByRole("dialog")).toContainText(
    "Recommendation area: 충주시 · Entire city",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "After verifying your email",
  );
  await expect(page.getByRole("dialog").locator("input[type=tel]")).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
