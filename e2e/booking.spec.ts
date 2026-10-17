import { expect, test } from "@playwright/test";
test("booking review, consent, pending/confirmed and mobile layout", async ({
  page,
}) => {
  let submissions = 0;
  await page.route("**/api/booking/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.endsWith("capabilities")) body = { enabled: true };
    else if (path.includes("/venues/"))
      body = {
        placeId: "70000000-0000-4000-8000-000000000003",
        externalId: "test-venue",
        name: "테스트 식당",
        address: "서울 테스트 주소",
        supported: true,
      };
    else if (path.endsWith("profile"))
      body = { guestName: "Test Guest", guestPhone: "+821012345678" };
    else if (path.endsWith("reservations")) {
      submissions++;
      expect(route.request().postDataJSON()).toMatchObject({
        consent: true,
        consentVersion: "heyyumi-reservation-v1",
        guestName: "Test Guest",
      });
      body = {
        id: "test-id",
        state: "pending",
        reservationTime: "2099-12-01T19:00:00+09:00",
        guestCount: 2,
        reconciliationRequired: false,
      };
    } else if (path.includes("/requests/"))
      body = {
        id: "test-id",
        state: "pending",
        reservationTime: "2099-12-01T19:00:00+09:00",
        guestCount: 2,
        reconciliationRequired: false,
      };
    else if (path.endsWith("refresh"))
      body = {
        id: "test-id",
        state: "confirmed",
        reservationTime: "2099-12-01T19:00:00+09:00",
        guestCount: 2,
        reconciliationRequired: false,
      };
    await route.fulfill({ json: body });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/booking-harness.html");
  await page.getByRole("button", { name: "예약하기", exact: true }).click();
  await expect(page.getByLabel("예약자 이름")).toHaveValue("Test Guest");
  await page.getByLabel("희망 일시").fill("2099-12-01T19:00");
  await page.getByRole("button", { name: "내용 확인", exact: true }).click();
  const submit = page.getByRole("button", {
    name: "동의하고 예약 요청",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  expect(submissions).toBe(0);
  await page.getByRole("checkbox").check();
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("예약 요청됨 · 확정 대기");
  expect(submissions).toBe(1);
  const persisted = await page.evaluate(() =>
    Object.entries(sessionStorage).filter(([key]) =>
      key.startsWith("localroute.booking."),
    ),
  );
  expect(persisted).toHaveLength(1);
  expect(persisted[0][1]).toMatch(/^[0-9a-f-]{36}$/);
  await page.reload();
  await page.getByRole("button", { name: "예약하기", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("예약 요청됨 · 확정 대기");
  expect(submissions).toBe(1);
  await page.getByRole("button", { name: "상태 다시 확인" }).click();
  await expect(page.getByRole("status")).toHaveText("예약 확정");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const button of await page.getByRole("button").all())
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
test("English unknown flow never resends a booking and resets consent after edits", async ({
  page,
}) => {
  let submissions = 0;
  await page.route("**/api/booking/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = null;
    if (path.endsWith("capabilities")) body = { enabled: true };
    else if (path.includes("/venues/"))
      body = {
        placeId: "70000000-0000-4000-8000-000000000003",
        externalId: "test",
        name: "Test Restaurant",
        address: "Seoul",
        supported: true,
      };
    else if (path.endsWith("reservations")) {
      submissions++;
      body = {
        id: "test",
        state: "unknown",
        reservationTime: "2099-12-01T19:00:00+09:00",
        guestCount: 2,
        reconciliationRequired: true,
      };
    } else if (path.endsWith("refresh"))
      body = {
        id: "test",
        state: "unknown",
        reservationTime: "2099-12-01T19:00:00+09:00",
        guestCount: 2,
        reconciliationRequired: true,
      };
    await route.fulfill({ json: body });
  });
  await page.goto("/tests/booking-harness.html?lang=en");
  await page.getByRole("button", { name: "Book a table" }).click();
  await page.getByLabel("Requested date").fill("2099-12-01T19:00");
  await page.getByLabel("Guest name", { exact: true }).fill("Traveler");
  await page.getByLabel("Contact phone").fill("+821012345678");
  await page.getByRole("button", { name: "Review details" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Guests", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Review details" }).click();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Agree and request booking" }).click();
  await expect(page.getByRole("status")).toHaveText("Outcome unknown");
  await expect(
    page.getByText("The outcome needs checking.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check status" }).click();
  expect(submissions).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
