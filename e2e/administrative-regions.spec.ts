import { expect, test, type Page } from "@playwright/test";
async function choose(
  page: Page,
  label: string,
  query: string,
  option: string,
) {
  const box = page.getByRole("combobox", { name: label, exact: true });
  await box.fill(query);
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(box).toHaveValue(option);
}
test("one searchable control per level, optional town, resets and rural scope", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/administrative-regions-harness.html");
  await expect(page.getByText("목록 기준일", { exact: false })).toBeVisible();
  const save = page.getByRole("button", { name: "Save fixture" });
  await expect(save).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "시·군·구", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await choose(page, "시·도", "충청북", "충청북도");
  await choose(page, "시·군·구", "충주", "충주시");
  await expect(save).toBeEnabled();
  await choose(page, "읍·면·동 (선택)", "살미", "살미면");
  await expect(page.getByTestId("locality")).toContainText(
    '"homeCity":"충주시","homeArea":"살미면","localityScope":"auto"',
  );
  await expect(
    page.getByText("추천 범위: 충주시", { exact: false }),
  ).toBeVisible();
  await choose(page, "시·도", "서울", "서울특별시");
  await expect(
    page.getByRole("combobox", { name: "시·군·구", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "읍·면·동 (선택)", exact: true }),
  ).toHaveValue("");
  await choose(page, "시·군·구", "성동", "성동구");
  await choose(page, "읍·면·동 (선택)", "성수1가제1", "성수1가제1동");
  await expect(page.getByTestId("locality")).toContainText(
    '"homeArea":"성동구 성수1가제1동"',
  );
  await page
    .getByRole("combobox", { name: "지역 추천 범위", exact: true })
    .selectOption("area");
  await choose(page, "읍·면·동 (선택)", "성수1가제2", "성수1가제2동");
  await expect(page.getByTestId("locality")).toContainText(
    '"localityScope":"area"',
  );
  const province = page.getByRole("combobox", { name: "시·도", exact: true });
  await page.evaluate(() => {
    document.body.dataset.escaped = "false";
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") document.body.dataset.escaped = "true";
    });
  });
  await province.fill("없는지역xyz");
  await expect(
    page.getByText("검색 결과가 없어요.", { exact: false }),
  ).toBeVisible();
  await expect(save).toBeDisabled();
  await province.press("Escape");
  expect(await page.locator("body").getAttribute("data-escaped")).toBe("false");
  await expect(province).toHaveValue("서울특별시");
  await expect(save).toBeEnabled();
  await province.click();
  await expect(
    page.getByRole("listbox", { name: "시·도", exact: true }),
  ).toBeVisible();
  await province.press("Home");
  await province.press("ArrowDown");
  await expect(
    page.locator('.region-options [data-active="true"]'),
  ).toHaveAttribute("id", /option-1$/);
  await province.press("Escape");
  for (const control of await page.locator("input, select, button").all())
    if (await control.isVisible())
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
});
test("keyboard selection, English guidance, absent Sejong district and loading/errors", async ({
  page,
}) => {
  await page.goto("/tests/administrative-regions-harness.html?lang=en&error=1");
  await expect(page.getByRole("alert")).toContainText("Could not load");
  await expect(
    page.getByRole("button", { name: "Save fixture" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  const province = page.getByRole("combobox", {
    name: "Province / metropolitan city",
    exact: true,
  });
  await province.fill("세종");
  await province.press("Enter");
  await expect(province).toHaveValue("세종특별자치시");
  await expect(
    page.getByText("This city has no municipality level.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", {
      name: "City / county / district",
      exact: true,
    }),
  ).toBeDisabled();
  await choose(
    page,
    "Town / township / neighborhood (optional)",
    "조치원",
    "조치원읍",
  );
  await expect(
    page.getByRole("button", { name: "Save fixture" }),
  ).toBeEnabled();
  await page.goto("/tests/administrative-regions-harness.html?loading=1");
  await expect(page.getByText("공식 지역 목록을 불러오는 중…")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save fixture" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "시·도", exact: true }),
  ).toBeVisible();
});
test("saved aliases, ambiguous places and international recovery require explicit choices", async ({
  page,
}) => {
  await page.goto(
    "/tests/administrative-regions-harness.html?city=서울&area=성동구",
  );
  await expect(
    page.getByRole("button", { name: "Save fixture" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "공식 명칭으로 복구", exact: false })
    .click();
  await expect(
    page.getByRole("combobox", { name: "시·도", exact: true }),
  ).toHaveValue("서울특별시");
  await expect(
    page.getByRole("button", { name: "Save fixture" }),
  ).toBeEnabled();
  await page.goto("/tests/administrative-regions-harness.html?city=고성군");
  await expect(
    page.getByRole("button", { name: "Save fixture" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "시·도", exact: true }),
  ).toHaveValue("");
  await choose(page, "시·도", "강원", "강원특별자치도");
  await choose(page, "시·군·구", "고성", "고성군");
  await expect(
    page.getByRole("button", { name: "Save fixture" }),
  ).toBeEnabled();
  await page.goto(
    "/tests/administrative-regions-harness.html?lang=en&city=London&area=Camden",
  );
  await expect(
    page.getByRole("button", { name: "Save fixture" }),
  ).toBeDisabled();
  await page
    .getByLabel("Home region entry", { exact: true })
    .selectOption("international");
  await expect(
    page.getByRole("button", { name: "Save fixture" }),
  ).toBeEnabled();
  await expect(page.getByTestId("locality")).toContainText(
    '"homeCity":"London","homeArea":"Camden"',
  );
});

test("signup consent checkboxes align with the first text line and the entire row toggles", async ({
  page,
}) => {
  for (const lang of ["ko", "en"]) {
    await page.goto(
      `/tests/administrative-regions-harness.html?consent=1&lang=${lang}`,
    );
    await expect(
      page.getByText(lang === "ko" ? "목록 기준일" : "Snapshot date", {
        exact: false,
      }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const rows = page.locator(".login-form .legal-choice");
    await expect(rows).toHaveCount(4);
    for (const row of await rows.all()) {
      await row.scrollIntoViewIfNeeded();
      const box = row.getByRole("checkbox");
      const checkbox = (await box.boundingBox())!;
      const text = (await row.locator("span").boundingBox())!;
      expect(checkbox.height).toBe(22);
      expect(checkbox.width).toBe(22);
      expect(Math.abs(checkbox.y - text.y)).toBeLessThanOrEqual(1);
      expect(text.x - checkbox.x - checkbox.width).toBeGreaterThanOrEqual(10);
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await row.locator("span").click();
      await expect(box).toBeChecked();
      await box.focus();
      await page.keyboard.press("Space");
      await expect(box).not.toBeChecked();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
