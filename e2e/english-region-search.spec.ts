import { expect, test } from "@playwright/test";
test("signup searches official Korean options with English province/city/district aliases", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  await page.routeWebSocket("**", (socket) => socket.close());
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin !== origin || url.pathname.startsWith("/api/")
      ? route.abort()
      : route.continue();
  });
  await page.goto("/tests/administrative-regions-harness.html?lang=en");
  const province = page.getByRole("combobox", {
    name: "Province / metropolitan city",
    exact: true,
  });
  await province.fill("se OUL");
  await page.getByRole("option", { name: /Seoul.*서울특별시/ }).click();
  const district = page.getByRole("combobox", {
    name: "City / county / district",
    exact: true,
  });
  await district.fill("Seongdong-gu");
  await page.getByRole("option", { name: /Seongdong-gu.*성동구/ }).click();
  await page
    .getByRole("combobox", {
      name: "Town / township / neighborhood (optional)",
      exact: true,
    })
    .fill("Seongsu");
  await page.getByRole("option").filter({ hasText: "성수" }).first().click();
  await expect(page.getByTestId("locality")).toContainText(
    '"homeCity":"서울특별시"',
  );
  await province.fill("CHUNG-BUK");
  await page
    .getByRole("option", { name: /Chungcheongbuk-do.*충청북도/ })
    .click();
  await district.fill("Chung-ju");
  await page.getByRole("option", { name: /Chungju.*충주시/ }).click();
  await expect(page.getByTestId("locality")).toContainText(
    '"homeCity":"충주시"',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
