import sharp from "sharp";
import type { Page } from "@playwright/test";
// A solid-color test image, created in memory solely for automated form tests.
// This is never a product asset or a claimed photograph of a real venue.
export async function attachTestPhoto(page: Page) {
  const buffer = await sharp({
    create: { width: 400, height: 400, channels: 3, background: "#8090a0" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("실제 장소 사진 (필수)", { exact: true })
    .setInputFiles({
      name: "form-test-only.png",
      mimeType: "image/png",
      buffer,
    });
  await page
    .getByRole("checkbox", {
      name: "이 장소에서 직접 촬영한 실제 사진이며,",
      exact: false,
    })
    .check();
}
