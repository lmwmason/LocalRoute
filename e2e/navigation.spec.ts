import { expect, test } from "@playwright/test";
test("multi-select survives steps, browser back and refresh", async ({
  page,
}) => {
  await page.goto("/plan");
  // Check the reference home selections by their stable pressed state.
  const homeChoices = page.locator(".preference-chips [aria-pressed]");
  if (await homeChoices.count()) {
    await homeChoices.nth(1).click();
    await homeChoices.nth(2).click();
    await expect(homeChoices.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(homeChoices.nth(2)).toHaveAttribute("aria-pressed", "true");
  }
  await page
    .getByRole("button", { name: "나의 여행 계획하기", exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan\/new\/1$/);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/new\/2$/);
  const choices = page.locator(".choice-chips").first().getByRole("button");
  await choices.nth(1).click();
  await choices.nth(2).click();
  const expected = await choices.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-pressed")),
  );
  await page.reload();
  await expect(page).toHaveURL(/\/plan\/new\/2$/);
  await expect(choices).toHaveCount(7);
  expect(
    await choices.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-pressed")),
    ),
  ).toEqual(expected);
  await page.goBack();
  await expect(page).toHaveURL(/\/plan\/new\/1$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/plan\/new\/2$/);
});
test("place and login URLs close with browser back", async ({ page }) => {
  await page.goto("/discover");
  await page.locator(".place-card").first().click();
  await expect(page).toHaveURL(/\/places\//);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
