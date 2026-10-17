import sharp from "sharp";
import { createHash } from "node:crypto";
import { AppError } from "./errors";

export const maxPhotoBytes = 5 * 1024 * 1024;
export type PhotoTarget =
  | { placeId: string }
  | {
      manualPlace: {
        name: string;
        address: string;
        lat: number;
        lng: number;
        kind: string;
      };
    }
  | { provider: { id: string } };
export type ProcessedPhoto = {
  data: Buffer;
  sha256: string;
  width: number;
  height: number;
};

// Decode pixels rather than trusting an extension, browser MIME type or EXIF data.
// Output is a single, metadata-free JPEG; no photograph is sent to an AI service.
export async function preparePlacePhoto(
  bytes: Buffer,
  mime: string,
): Promise<ProcessedPhoto> {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxPhotoBytes)
    throw new AppError(413, "photos.error.size");
  const formats: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (!formats[mime]) throw new AppError(415, "photos.error.type");
  try {
    const image = sharp(bytes, {
      limitInputPixels: 20_000_000,
      animated: false,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (metadata.format !== formats[mime] || (metadata.pages || 1) !== 1)
      throw new AppError(415, "photos.error.type");
    if (
      !metadata.width ||
      !metadata.height ||
      Math.min(metadata.width, metadata.height) < 320
    )
      throw new AppError(400, "photos.error.dimensions");
    const { data, info } = await image
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 84 })
      .toBuffer({ resolveWithObject: true });
    if (Math.min(info.width, info.height) < 320)
      throw new AppError(400, "photos.error.dimensions");
    return {
      data,
      width: info.width,
      height: info.height,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "photos.error.decode");
  }
}
