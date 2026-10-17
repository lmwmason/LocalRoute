import { expect, test } from "@playwright/test";
test("storage failures remain visible instead of being overwritten by success", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await page.route("https://tiles.openfreemap.org/**", (r) => r.abort());
  await page.goto("/");
  await page
    .getByRole("button", { name: "소담한 식탁 저장", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "이번 화면에서만 보관해요" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "소담한 식탁 저장 해제", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "이번 화면에서만 보관해요" }),
  ).toBeVisible();
});
test("draft survives closing and reloading the page without carrying consent", async ({
  page,
}, info) => {
  await page.route("https://tiles.openfreemap.org/**", (r) => r.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "소담한 식탁 자세히 보기" }).click();
  await page.getByRole("button", { name: "나도 추천하기" }).click();
  await page
    .getByRole("textbox", { name: "직접 경험한 추천 한마디" })
    .fill("다시 열어도 이 추천 내용은 남아 있어야 해요.");
  await page.getByRole("button", { name: "미리 보기" }).click();
  await page.getByRole("checkbox").check();
  await page.reload();
  if (info.project.name.startsWith("mobile"))
    await page
      .getByRole("navigation", { name: "모바일 메뉴" })
      .getByRole("button", { name: "추천하기", exact: true })
      .click();
  else
    await page
      .getByRole("button", { name: "맛집 추천하기", exact: true })
      .click();
  await expect(page.getByRole("dialog")).toContainText(
    "다시 열어도 이 추천 내용은 남아 있어야 해요.",
  );
  await expect(page.getByRole("checkbox")).not.toBeChecked();
});
