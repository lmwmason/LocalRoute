import { expect, test, type Page } from "@playwright/test";

const a = "70000000-0000-4000-8000-000000000002";
const b = "70000000-0000-4000-8000-000000000003";
async function open(page: Page, lang: string, extra = "") {
  // Any unexpected API request is blocked: tests cannot write real feedback.
  await page.route("**/api/**", (route) => route.abort());
  await page.goto(`/tests/feedback-harness.html?lang=${lang}${extra}`);
  await expect(page.locator(".feedback-form")).toBeVisible();
}
async function completeVisit(page: Page, score = 1) {
  await page.locator(`input[name="rating"][value="${score}"]`).check();
  await page.locator('[name="visitedOn"]').fill("2026-01-10");
  await page.locator('[name="confirmed"]').check();
}
async function calls(page: Page) {
  return JSON.parse((await page.getByTestId("calls").textContent()) || "[]");
}
for (const lang of ["ko", "en"]) {
  test(`${lang}: required guidance, keyboard stars, responsive layout and honest low review`, async ({
    page,
  }) => {
    await open(page, lang);
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('[name="rating"]').first()).toBeFocused();
    await expect(page.locator('[name="rating"]').first()).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[name="rating"][value="2"]')).toBeChecked();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator('[name="rating"][value="1"]')).toBeChecked();
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('[name="visitedOn"]')).toBeFocused();
    await page.locator('[name="visitedOn"]').fill("2026-01-10");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('[name="confirmed"]')).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator('[name="confirmed"]')).toBeChecked();
    await page
      .locator("textarea")
      .fill(lang === "ko" ? "아쉬운 방문이었어요." : "A disappointing visit.");
    expect(await page.locator("select option").count()).toBe(3);
    await expect(page.locator("form")).toContainText(
      lang === "ko" ? "영수증은 필수가 아니에요" : "A receipt is not required",
    );
    for (const target of await page
      .locator(
        ".feedback-star, .feedback-check, .feedback-field input, .feedback-field select, button[type=submit]",
      )
      .all()) {
      const box = await target.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
    for (const row of await page.locator(".feedback-check").all()) {
      expect(await row.evaluate((node) => getComputedStyle(node).display)).toBe(
        "grid",
      );
      const input = await row.locator("input").boundingBox();
      const text = await row.locator("span").boundingBox();
      expect(text!.x - input!.x - input!.width).toBeGreaterThanOrEqual(8);
      expect(Math.abs(text!.y - input!.y)).toBeLessThanOrEqual(1);
    }
    expect(
      await page
        .locator(".feedback-star")
        .first()
        .evaluate((node) => getComputedStyle(node).marginTop),
    ).toBe("0px");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (lang === "en")
      expect(await page.locator("form").innerText()).not.toMatch(
        /장소 만족도|필수|저장|도움 평가/,
      );
    await page.locator('button[type="submit"]').click();
    await expect(page.locator(".feedback-success")).toBeVisible();
    await expect(page.locator(".feedback-success")).toBeFocused();
    const [payload] = await calls(page);
    expect(payload.rating).toBe(1);
    expect(payload).not.toHaveProperty("helpfulness");
    expect(payload).not.toHaveProperty("endorsementVersionId");
  });

  test(`${lang}: recommendation changes clear scores; retry retains exact version and identity`, async ({
    page,
  }) => {
    await open(page, lang, "&fail");
    await completeVisit(page, 5);
    await page.locator("select").selectOption(a);
    await page.locator('[name="helpfulness"][value="5"]').check();
    await page.locator("select").selectOption(b);
    expect(await page.locator('[name="helpfulness"]:checked').count()).toBe(0);
    await page.locator('button[type="submit"]').click();
    expect(await calls(page)).toHaveLength(0);
    await expect(page.locator('[name="helpfulness"]').first()).toBeFocused();
    await page.locator('[name="helpfulness"][value="1"]').check();
    await page.locator("textarea").fill("Honest one-star helpfulness");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("textarea")).toHaveValue(
      "Honest one-star helpfulness",
    );
    await page.locator('button[type="submit"]').click();
    await expect(page.locator(".feedback-success")).toBeVisible();
    const payloads = await calls(page);
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toEqual(payloads[1]);
    expect(payloads[0].endorsementVersionId).toBe(b);
    expect(payloads[0].helpfulness).toBe(1);
  });
}

test("clearing a recommendation omits attribution and all five place scores can submit", async ({
  page,
}) => {
  for (const score of [1, 2, 3, 4, 5]) {
    await open(page, "en");
    await completeVisit(page, score);
    await page.locator("select").selectOption(a);
    await page.locator('[name="helpfulness"][value="4"]').check();
    await page.locator("select").selectOption("");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator(".feedback-success")).toBeVisible();
    const [payload] = await calls(page);
    expect(payload.rating).toBe(score);
    expect(payload).not.toHaveProperty("helpfulness");
    expect(payload).not.toHaveProperty("endorsementVersionId");
  }
});

test("saving locks inputs and duplicate submit; empty recommendations and new place reset", async ({
  page,
}) => {
  await open(page, "en", "&defer&empty");
  await expect(page.locator("form")).toContainText(
    "There are no other curators",
  );
  await completeVisit(page, 3);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('button[type="submit"]')).toHaveText("Saving…");
  await expect(page.locator("textarea")).toBeDisabled();
  await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
  await page.locator("form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(await calls(page)).toHaveLength(1);
  await page.getByRole("button", { name: "Resolve test save" }).click();
  await expect(page.locator(".feedback-success")).toBeVisible();
  await page.getByRole("button", { name: "Switch test place" }).click();
  expect(await page.locator('[name="rating"]:checked').count()).toBe(0);
  await expect(page.locator('[name="visitedOn"]')).toHaveValue("");
});

test("editing a failed draft creates a new identity and future dates are rejected", async ({
  page,
}) => {
  await open(page, "en", "&fail");
  await completeVisit(page, 4);
  await page.locator('[name="visitedOn"]').fill("2099-01-01");
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('[name="visitedOn"]')).toBeFocused();
  expect(await calls(page)).toHaveLength(0);
  await page.locator('[name="visitedOn"]').fill("2026-01-10");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.locator('[name="rating"][value="2"]').check();
  await page.locator('button[type="submit"]').click();
  await expect(page.locator(".feedback-success")).toBeVisible();
  const payloads = await calls(page);
  expect(payloads[0].requestId).not.toBe(payloads[1].requestId);
  expect(payloads[1].rating).toBe(2);
});
