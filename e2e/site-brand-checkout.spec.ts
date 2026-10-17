import { test, expect } from "@playwright/test";

test("legal and checkout headers retain the app brand after visiting links", async ({
  page,
}) => {
  await page.goto("/legal/privacy");
  await page.locator('.legal-page-links a[href="/legal/terms"]').click();
  await page.goto("/legal/privacy");
  for (const path of ["/legal/privacy", "/checkout/test"]) {
    await page.goto(path);
    const brand = page.locator("header .brand");
    await expect(brand.locator(".brand-word")).toContainText("LocalRoute");
    await expect(brand).toHaveCSS("text-decoration-line", "none");
    await expect(brand).toHaveCSS("color", "rgb(32, 43, 60)");
    await expect(brand.locator("img")).toBeVisible();
    const box = await brand.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("test checkout changes no LP and sends no payment or application API requests", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.goto("/checkout/test");
  await expect(page.locator('input:not([type="checkbox"])')).toHaveCount(0);
  const submit = page.getByRole("button", {
    name: "테스트 결제하기 · 실제 ₩0",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox").check();
  await submit.click();
  await expect(
    page.getByRole("heading", { name: "테스트 결제를 완료했어요" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "실제 LP 잔액은 바뀌지 않았고",
  );
  expect(apiRequests).toEqual([]);
});
