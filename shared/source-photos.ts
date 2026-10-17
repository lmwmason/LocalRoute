import { z } from "zod";

export const sourcePhotoLicenses = {
  "CC BY-SA 2.0": "https://creativecommons.org/licenses/by-sa/2.0/",
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0/",
  "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
  "Public Domain": "https://creativecommons.org/publicdomain/mark/1.0/",
  "KOGL Type 1": "https://www.kogl.or.kr/info/licenseType1.do",
} as const;
const httpsSource = z
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
  });
export const sourcePhotoSchema = z
  .object({
    id: z.uuid().optional(),
    assetPath: z
      .string()
      .regex(
        /^\/place-source-photos\/[a-z0-9][a-z0-9_-]{0,159}\.(?:jpg|jpeg|png|webp)$/,
      ),
    sourcePageUrl: httpsSource,
    author: z.string().trim().min(1).max(300),
    license: z.enum(
      Object.keys(sourcePhotoLicenses) as [
        keyof typeof sourcePhotoLicenses,
        ...(keyof typeof sourcePhotoLicenses)[],
      ],
    ),
    licenseUrl: httpsSource,
    title: z.string().trim().min(1).max(300),
    caption: z.string().trim().min(1).max(700),
    capturedAt: z.string().min(1).max(80).nullable(),
    changes: z.string().trim().min(1).max(700),
    priorChanges: z.string().max(1200).nullable(),
    verifiedAt: z.iso.datetime({ offset: true }),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .superRefine((photo, context) => {
    if (photo.licenseUrl !== sourcePhotoLicenses[photo.license])
      context.addIssue({
        code: "custom",
        message: "License URL must match the reviewed license.",
        path: ["licenseUrl"],
      });
    if (Date.parse(photo.verifiedAt) > Date.now() + 300_000)
      context.addIssue({
        code: "custom",
        message: "Verification cannot be in the future.",
        path: ["verifiedAt"],
      });
  });
export type SourcePhoto = z.infer<typeof sourcePhotoSchema>;
export const sourcePhotoImportSchema = sourcePhotoSchema
  .safeExtend({
    placeId: z.uuid().optional(),
    placeSourceUrl: httpsSource.optional(),
  })
  .refine(
    (photo) =>
      Number(Boolean(photo.placeId)) + Number(Boolean(photo.placeSourceUrl)) ===
      1,
    "Select exactly one canonical place or operator source URL.",
  );
export type SourcePhotoImport = z.infer<typeof sourcePhotoImportSchema>;
