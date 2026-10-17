import sharp from "sharp";
import { z } from "zod";
import { maxPhotoBytes, preparePlacePhoto } from "../photos";
import { menuPhotoOptionsSchema } from "../../shared/ai-assistance";

export { maxPhotoBytes };
/** Rectangles refer to the auto-oriented, normalized image, with values 0..1.
 * Caller must crop out names/faces/contact details; redaction is supplemental.
 * No storage, external URLs, original metadata, or filenames leave this module.
 */
export async function prepareMenuPhoto(
  bytes: Buffer,
  mime: string,
  options: z.infer<typeof menuPhotoOptionsSchema>,
) {
  const photo = await preparePlacePhoto(bytes, mime);
  if (!options.redactions.length) return photo.data;
  const overlays = await Promise.all(
    options.redactions.map(async (r) => {
      const left = Math.floor(r.left * photo.width),
        top = Math.floor(r.top * photo.height);
      const width = Math.min(
        photo.width - left,
        Math.max(1, Math.ceil(r.width * photo.width)),
      );
      const height = Math.min(
        photo.height - top,
        Math.max(1, Math.ceil(r.height * photo.height)),
      );
      const input = await sharp({
        create: { width, height, channels: 3, background: "white" },
      })
        .png()
        .toBuffer();
      return { input, left, top };
    }),
  );
  return sharp(photo.data).composite(overlays).jpeg({ quality: 84 }).toBuffer();
}
