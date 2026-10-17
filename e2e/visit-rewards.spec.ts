import { expect, test, type Page } from "@playwright/test";
import type { VisitRewardRequest } from "../shared/visit-rewards";
const id = "80000000-0000-4000-8000-000000000010",
  ratingId = "80000000-0000-4000-8000-000000000011";
const initial: VisitRewardRequest = {
  id,
  requestId: id,
  visitorId: id,
  placeId: id,
  placeName: "테스트 식당 / Test venue",
  curatorId: ratingId,
  ratingId,
  endorsementVersionId: ratingId,
  versionNumber: 2,
  versionText: "An independent recommendation about the restaurant.",
  visitedOn: "2026-10-01",
  helpfulness: 1,
  affiliated: false,
  evidence:
    "Applicant has requested independent human review without a receipt.",
  state: "pending",
  createdAt: "2026-10-01T00:00:00Z",
  decision: null,
  grant: null,
  knownAffiliations: [],
};
async function layout(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const b of await page.getByRole("button").all())
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
}
test("receipt-free bilingual application, private status and touch/keyboard layout", async ({
  page,
}) => {
  let submissions = 0;
  let items: VisitRewardRequest[] = [];
  await page.route("**/api/visit-rewards/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path.endsWith("targets"))
      body = [
        {
          ratingId,
          placeId: id,
          placeName: initial.placeName,
          endorsementVersionId: ratingId,
          versionNumber: 2,
          versionText: initial.versionText,
          helpfulness: 1,
          visitedOn: "2026-10-01",
        },
      ];
    else if (path.endsWith("requests") && route.request().method() === "POST") {
      submissions++;
      expect(route.request().postDataJSON()).toMatchObject({
        ratingId,
        expectedHelpfulness: 1,
        consent: true,
        affiliated: false,
      });
      items = [initial];
      body = initial;
    } else body = items;
    await route.fulfill({ json: body });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const lang of ["ko", "en"]) {
    await page.goto(`/tests/visit-rewards-harness.html?lang=${lang}`);
    const english = lang === "en";
    await expect(
      page.getByText(
        english ? "No receipt is required." : "영수증은 필요하지 않아요.",
        { exact: false },
      ),
    ).toBeVisible();
    await page.getByRole("combobox").selectOption(ratingId);
    await page
      .getByRole("textbox")
      .fill(
        "I can describe the visit without providing receipts or precise location history.",
      );
    const send = page.getByRole("button", {
      name: english ? "Request review" : "검토 요청",
      exact: true,
    });
    await expect(send).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: english ? "I agree to provide" : "작성한 내용을",
        exact: false,
      })
      .check();
    await send.focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .locator("article")
        .getByText(english ? "Awaiting review" : "검토 대기", { exact: true }),
    ).toBeVisible();
    expect(submissions).toBe(english ? 2 : 1);
    await layout(page);
  }
});
test("human admin review requires evidence, and disabled payout cannot be triggered", async ({
  page,
}) => {
  let item = { ...initial };
  let decisions = 0;
  let issues = 0;
  await page.route("**/api/visit-rewards/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path.endsWith("policy"))
      body = {
        version: 1,
        enabled: false,
        effectiveEnabled: false,
        amounts: [0, 2, 8, 15, 20],
        place_month_cap: 300,
        curator_month_cap: 1000,
      };
    else if (path.endsWith("decisions")) {
      decisions++;
      expect(route.request().postDataJSON()).toMatchObject({
        independentEvidence: true,
        affiliationsChecked: true,
        collusionChecked: true,
        decision: "approve",
      });
      item = { ...item, state: "approved" };
      body = item;
    } else if (path.endsWith("issue")) {
      issues++;
      body = item;
    } else body = [item];
    await route.fulfill({ json: body });
  });
  await page.goto("/tests/visit-rewards-harness.html?admin=1&lang=en");
  await expect(page.getByRole("status")).toContainText(
    "LP payouts are disabled",
  );
  const approve = page.getByRole("button", {
    name: "Approve visit",
    exact: true,
  });
  await expect(approve).toBeDisabled();
  await page
    .getByRole("textbox")
    .nth(0)
    .fill("Verified independently by the human reviewer.");
  await page
    .getByRole("textbox")
    .nth(1)
    .fill(
      "Independent source and attribution were checked beyond a booking, photo or location alone.",
    );
  for (const checkbox of await page.getByRole("checkbox").all())
    await checkbox.check();
  await approve.click();
  expect(decisions).toBe(1);
  await expect(
    page.getByRole("button", { name: "Issue under current policy" }),
  ).toBeDisabled();
  expect(issues).toBe(0);
  await layout(page);
});
