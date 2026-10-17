import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import sharp from "sharp";
import { randomBytes } from "node:crypto";

describe("actual browser photo normalization", () => {
  let server: ViteDevServer, browser: Browser, base: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      envDir: false,
      envPrefix: "PHOTO_FIXTURE_NO_ENV_",
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === "string")
      throw new Error("Missing fixture server");
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch();
  }, 30000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  async function normalize(bytes: Buffer, type: string, fallback = false) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    try {
      const page = await context.newPage();
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base || url.pathname.startsWith("/api/"))
          return route.abort();
        if (url.pathname === "/__photo_fixture")
          return route.fulfill({
            contentType: "text/html",
            body: "<!doctype html><title>Local photo processing fixture</title>",
          });
        return route.continue();
      });
      await context.routeWebSocket("**", (socket) => socket.close());
      await page.goto(`${base}/__photo_fixture`);
      await page.addScriptTag({
        type: "module",
        content:
          'import {preparePhotoUpload} from "/src/photos/prepare-upload.ts"; globalThis.__preparePhotoFixture = preparePhotoUpload;',
      });
      await page.waitForFunction(() => "__preparePhotoFixture" in globalThis);
      return await page.evaluate(
        async ({ source, type, fallback }) => {
          if (fallback)
            Object.defineProperty(globalThis, "createImageBitmap", {
              configurable: true,
              value: undefined,
            });
          const preparePhotoUpload = (
            globalThis as unknown as {
              __preparePhotoFixture: (file: File) => Promise<File>;
            }
          ).__preparePhotoFixture;
          const original = new File(
            [Uint8Array.from(atob(source), (char) => char.charCodeAt(0))],
            "PRIVATE_ORIGINAL_FILENAME",
            { type },
          );
          const before = await original.arrayBuffer();
          const result = await preparePhotoUpload(original);
          const after = await original.arrayBuffer();
          return {
            bytes: Array.from(new Uint8Array(await result.arrayBuffer())),
            type: result.type,
            name: result.name,
            size: result.size,
            originalUnchanged:
              new Uint8Array(before).every(
                (byte, index) => byte === new Uint8Array(after)[index],
              ) &&
              original.name === "PRIVATE_ORIGINAL_FILENAME" &&
              original.type === type,
          };
        },
        { source: bytes.toString("base64"), type, fallback },
      );
    } finally {
      await context.close();
    }
  }

  it.each([false, true])(
    "strips real EXIF/GPS, respects orientation and preserves the original (Image fallback=%s)",
    async (fallback) => {
      const bytes = await sharp({
        create: {
          width: 3200,
          height: 1600,
          channels: 3,
          background: "#3388aa",
        },
      })
        .withMetadata({ orientation: 6 })
        .withExif({
          IFD0: { Artist: "PRIVATE_PHOTO_ARTIST" },
          IFD2: { GPSLatitudeRef: "N", GPSLatitude: "37/1 30/1 0/1" },
        })
        .jpeg()
        .toBuffer();
      expect((await sharp(bytes).metadata()).exif).toBeDefined();
      const result = await normalize(bytes, "image/jpeg", fallback),
        output = Buffer.from(result.bytes),
        metadata = await sharp(output).metadata();
      expect(result).toMatchObject({
        type: "image/jpeg",
        name: "localroute-photo.jpg",
        originalUnchanged: true,
      });
      expect(result.size).toBeLessThanOrEqual(4 * 1024 * 1024);
      expect(metadata).toMatchObject({
        format: "jpeg",
        width: 800,
        height: 1600,
      });
      expect(metadata.exif).toBeUndefined();
      expect(metadata.orientation).toBeUndefined();
      expect(output.includes(Buffer.from("PRIVATE_PHOTO_ARTIST"))).toBe(false);
    },
  );

  it("normalizes a PNG above the platform body limit before it can be uploaded", async () => {
    const bytes = await sharp(randomBytes(1600 * 1000 * 3), {
      raw: { width: 1600, height: 1000, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(bytes.length).toBeGreaterThan(4_500_000);
    expect(bytes.length).toBeLessThanOrEqual(5 * 1024 * 1024);
    const result = await normalize(bytes, "image/png");
    expect(result.size).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect((await sharp(Buffer.from(result.bytes)).metadata()).format).toBe(
      "jpeg",
    );
    expect(result.originalUnchanged).toBe(true);
  });

  it.each([false, true])(
    "accepts actual still WebP without raising the menu minimum above 320px (lossless=%s)",
    async (lossless) => {
      const bytes = await sharp({
        create: { width: 320, height: 320, channels: 3, background: "#778899" },
      })
        .webp({ lossless })
        .toBuffer();
      const result = await normalize(bytes, "image/webp");
      expect(await sharp(Buffer.from(result.bytes)).metadata()).toMatchObject({
        format: "jpeg",
        width: 320,
        height: 320,
      });
    },
  );
});
