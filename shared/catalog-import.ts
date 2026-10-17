import { z } from "zod";

export const operatorPlaceEntrySchema = z.strictObject({
  sourceUrl: z
    .url()
    .max(2000)
    .refine((value) => {
      const url = new URL(value);
      return (
        value.startsWith("https://") &&
        !/\s/.test(value) &&
        !value.includes("#") &&
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.hash
      );
    }, "Use an HTTPS public source URL without credentials or fragments."),
  observedAt: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(1).max(100),
  address: z.string().trim().min(5).max(250),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  kind: z.enum(["restaurant", "cafe", "attraction", "culture", "experience"]),
  category: z.string().trim().min(1).max(50),
});

export const operatorPlaceBatchSchema = z
  .array(operatorPlaceEntrySchema)
  .min(1)
  .max(50)
  .superRefine((entries, ctx) => {
    const urls = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      if (urls.has(entry.sourceUrl))
        ctx.addIssue({
          code: "custom",
          message: "A source URL may occur only once per batch.",
          path: [index, "sourceUrl"],
        });
      urls.add(entry.sourceUrl);
      if (Date.parse(entry.observedAt) > Date.now() + 5 * 60_000)
        ctx.addIssue({
          code: "custom",
          message: "The observation time cannot be in the future.",
          path: [index, "observedAt"],
        });
    }
  });

export type OperatorPlaceEntry = z.infer<typeof operatorPlaceEntrySchema>;
export const operatorPlaceImportResultSchema = z.strictObject({
  sourceUrl: operatorPlaceEntrySchema.shape.sourceUrl,
  placeId: z.uuid(),
  action: z.enum(["created", "reused", "replayed"]),
});
export type OperatorPlaceImportResult = z.infer<
  typeof operatorPlaceImportResultSchema
>;
