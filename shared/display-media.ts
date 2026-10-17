import { z } from "zod";

/** Canonical presentation metadata, separate from contributor/visit evidence. */
export const displayMediaSchema = z
  .object({
    assetType: z.enum(["photo", "ai_illustration"]),
    assetPath: z
      .string()
      .regex(
        /^\/(?:restaurant-illustrations\/[a-z0-9][a-z0-9_-]{0,159}\.png|example-images\/[a-z0-9][a-z0-9_-]{0,159}\.(?:jpg|png)|place-display-media\/[a-z0-9][a-z0-9_-]{0,159}\.(?:jpg|png|webp))$/,
      ),
    alt: z.string().trim().min(1).max(700),
    credit: z.string().trim().min(1).max(700),
    licenseLabel: z.string().trim().min(1).max(300),
    sourceUrl: z
      .url()
      .max(2000)
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.hash &&
          !/\s/.test(value)
        );
      }),
    observedAt: z.iso
      .datetime({ offset: true })
      .refine((value) => Date.parse(value) <= Date.now() + 300000),
    changes: z.string().trim().min(1).max(1200),
  })
  .refine(
    (media) =>
      media.assetType === "ai_illustration" ||
      (!media.assetPath.startsWith("/restaurant-illustrations/") &&
        !/-ai\.(png|jpg|webp)$/.test(media.assetPath)),
    "AI illustration assets cannot be labeled as real photos.",
  );
export type DisplayMedia = z.infer<typeof displayMediaSchema>;

export function parseDisplayMediaRow(row: unknown): DisplayMedia | undefined {
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  const value = row as Record<string, unknown>;
  const parsed = displayMediaSchema.safeParse({
    assetType: value.asset_type,
    assetPath: value.asset_path,
    alt: value.alt,
    credit: value.credit,
    licenseLabel: value.license_label,
    sourceUrl: value.source_url,
    observedAt: value.observed_at,
    changes: value.changes,
  });
  return parsed.success ? parsed.data : undefined;
}
