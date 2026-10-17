import { test, expect } from "@playwright/test";

test("fallback map keeps its visible height after the map SDK styles load", async ({
  page,
}) => {
  await page.route("**/src/supabase.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "export const supabase=null;export const exchangeAuthCode=()=>undefined;",
    }),
  );
  await page.route("**/api/places", (route) =>
    route.fulfill({ json: { places: [], mode: "live" } }),
  );
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/discover");
  const canvas = page.locator(".map-panel > .leaflet-container");
  await expect(canvas).toBeVisible({ timeout: 20000 });
  const panelBox = await page.locator(".map-panel").boundingBox();
  const box = await canvas.boundingBox();
  expect(box!.height).toBeGreaterThan(200);
  expect(Math.abs(panelBox!.height - box!.height)).toBeLessThan(4);
  await expect(canvas).toHaveCSS("position", "absolute");
  await expect(page.locator(".leaflet-control-zoom-in")).toBeVisible();
  await expect(
    page.locator(
      '.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]',
    ),
  ).toBeVisible();
});

test("legal source links have reachable 44px touch targets", async ({
  page,
}) => {
  await page.goto("/legal/terms");
  const links = page.locator(".legal-page li a");
  await expect(links.first()).toBeVisible();
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});
