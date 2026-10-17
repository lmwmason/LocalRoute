import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import request from "supertest";
import { maxPhotoBytes, preparePlacePhoto } from "../server/photos";
import { createApp } from "../server/app";
import { readConfig } from "../server/config";
import type { Repository } from "../server/repository";
import { AppError } from "../server/errors";

const pixels = () =>
  sharp({
    create: { width: 640, height: 400, channels: 3, background: "#648595" },
  });
describe("real place photo ingestion", () => {
  it("decodes pixels, normalizes orientation and strips EXIF instead of forwarding original files", async () => {
    const input = await pixels()
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const photo = await preparePlacePhoto(input, "image/jpeg");
    const meta = await sharp(photo.data).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect([photo.width, photo.height]).toEqual([400, 640]);
    expect(photo.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejects SVG, MIME spoofing, corrupt files, tiny images and oversized uploads", async () => {
    await expect(
      preparePlacePhoto(Buffer.from("<svg/>"), "image/svg+xml"),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      preparePlacePhoto(await pixels().png().toBuffer(), "image/jpeg"),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      preparePlacePhoto(Buffer.from("not a photograph"), "image/jpeg"),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      preparePlacePhoto(
        await sharp({
          create: { width: 1, height: 1, channels: 3, background: "white" },
        })
          .png()
          .toBuffer(),
        "image/png",
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      preparePlacePhoto(Buffer.alloc(maxPhotoBytes + 1), "image/jpeg"),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("checks authentication and consent before storage; sends only decoded bytes and the selected target to the repository", async () => {
    const repo = {
      authenticate: vi.fn(async (token: string) => {
        if (token !== "valid") throw new AppError(401, "Login required");
        return { id: "user-a", role: "traveler" as const };
      }),
      uploadPhoto: vi.fn(async () => ({ id: crypto.randomUUID() })),
    } as unknown as Repository;
    const app = createApp(readConfig({ VITE_DATA_MODE: "live" }), repo),
      id = crypto.randomUUID(),
      target = {
        manualPlace: {
          kind: "culture",
          name: "Test venue",
          address: "Test address",
          lat: 37.5,
          lng: 127,
        },
      },
      bytes = await pixels().png().toBuffer();
    expect(
      (
        await request(app)
          .post(`/api/place-photos/${id}`)
          .set("Content-Type", "image/png")
          .send(bytes)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(`/api/place-photos/${id}`)
          .set("Authorization", "Bearer valid")
          .set("Content-Type", "image/png")
          .send(bytes)
      ).status,
    ).toBe(400);
    expect(repo.uploadPhoto).not.toHaveBeenCalled();
    const result = await request(app)
      .post(`/api/place-photos/${id}`)
      .set("Authorization", "Bearer valid")
      .set("Content-Type", "image/png")
      .set("X-Photo-Consent", "real-place-photo-v1")
      .set("X-Place-Target", encodeURIComponent(JSON.stringify(target)))
      .send(bytes);
    expect(result.status).toBe(201);
    expect(repo.uploadPhoto).toHaveBeenCalledWith(
      { id: "user-a", role: "traveler" },
      id,
      target,
      expect.objectContaining({
        data: expect.any(Buffer),
        sha256: expect.any(String),
        width: 640,
        height: 400,
      }),
    );
  });
});
