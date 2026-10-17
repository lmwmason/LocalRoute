import { expect, test } from "@playwright/test";
import { attachTestPhoto } from "./photo-fixture";

test.beforeEach(async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/?view=explore");
});
test("mobile-first discovery: no overflow, accessible touch targets, free search and category filter", async ({
  page,
}, info) => {
  await expect(
    page.getByRole("heading", { name: "좋은 여행은, 동네의 한마디에서." }),
  ).toBeVisible();
  await expect(
    page.getByText("장소·추천·평점은 모두 가상 데이터입니다.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (info.project.name.startsWith("mobile")) {
    const buttons = page
      .getByRole("navigation", { name: "모바일 메뉴" })
      .getByRole("button");
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.getByRole("button", { name: "카페", exact: true }).click();
  await expect(page.locator(".place-card")).toHaveCount(2);
  await page.getByRole("textbox", { name: "장소 검색" }).fill("오후");
  await expect(page.locator(".place-card")).toHaveCount(1);
  await page.getByRole("textbox", { name: "장소 검색" }).fill("없는가게");
  await expect(
    page.getByRole("heading", { name: "아직 발견하지 못한 곳이에요" }),
  ).toBeVisible();
});
test("save, reorder and remove a free itinerary; keep assumptions explicit", async ({
  page,
}, info) => {
  await page
    .getByRole("button", { name: "소담한 식탁 저장", exact: true })
    .click();
  await page
    .getByRole("button", { name: "오후의 모퉁이 저장", exact: true })
    .click();
  if (info.project.name.startsWith("mobile"))
    await page
      .getByRole("navigation", { name: "모바일 메뉴" })
      .getByRole("button", { name: "나의 여행" })
      .click();
  else
    await page
      .getByRole("navigation", { name: "메인 메뉴" })
      .getByRole("button", { name: "나의 여행" })
      .click();
  await expect(page.locator(".trip-stop")).toHaveCount(2);
  await page.getByRole("button", { name: "오후의 모퉁이 위로 이동" }).click();
  await expect(page.locator(".trip-stop").first()).toContainText(
    "오후의 모퉁이",
  );
  await expect(
    page.getByText("실제 이동 시간·거리·영업 여부는 계산하지 않았어요.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "소담한 식탁 여행에서 삭제" }).click();
  await expect(page.locator(".trip-stop")).toHaveCount(1);
  await page.reload();
  await expect(page).toHaveURL(/\/saved$/);
  await expect(page.locator(".trip-stop")).toHaveCount(1);
  await expect(page.locator(".trip-stop").first()).toContainText(
    "오후의 모퉁이",
  );
});
test("recommendation preview, explicit consent, pending demo receipt and focus-safe modal", async ({
  page,
}) => {
  await page.getByRole("button", { name: "소담한 식탁 자세히 보기" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "나도 추천하기" }).click();
  await attachTestPhoto(page);
  await page
    .getByRole("textbox", { name: "직접 경험한 추천 한마디" })
    .fill("들깨 향이 은은해서 따뜻한 한 끼로 추천해요.");
  await page.getByRole("button", { name: "미리 보기" }).click();
  await expect(
    page.getByRole("button", { name: "데모 추천 제출" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "데모 추천 제출" }).click();
  await expect(
    page.getByRole("heading", { name: "데모 추천을 저장했어요" }),
  ).toBeVisible();
  await expect(page.getByText("검토 대기", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page).toHaveURL(/\/places\//);
  await expect(page.getByRole("dialog", { name: "동네의 발견" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("map failure leaves discovery usable and reduced motion works", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByText("기본 지도로 전환했어요", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "골목의 면 자세히 보기" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "골목의 면", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
