import { z } from "zod";

const draftSchema = z.object({
  expires: z.number(),
  requestId: z.uuid(),
  step: z.enum(["place", "write", "preview"]),
  selected: z
    .object({
      id: z.string().max(250),
      name: z.string().max(100),
      address: z.string().max(250),
      lat: z.number(),
      lng: z.number(),
      category: z.string(),
      candidateToken: z.string().optional(),
      source: z.enum(["demo", "localroute", "heyyumi"]),
    })
    .optional(),
  manual: z.boolean(),
  kind: z
    .enum(["restaurant", "cafe", "attraction", "culture", "experience"])
    .default("restaurant"),
  photoId: z.uuid().optional(),
  name: z.string().max(100),
  address: z.string().max(250),
  lat: z.string().max(40),
  lng: z.string().max(40),
  text: z.string().max(200),
});
export const draftKey = "localroute.contribution.draft.v1";
export type Draft = z.infer<typeof draftSchema>;
export function readDraft(): Draft | null {
  try {
    const parsed = draftSchema.safeParse(
      JSON.parse(sessionStorage.getItem(draftKey) || "null"),
    );
    return parsed.success && parsed.data.expires > Date.now()
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}
export function saveDraft(draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(draftKey, JSON.stringify(draft));
    else sessionStorage.removeItem(draftKey);
  } catch {
    /* The form remains usable when tab storage is disabled. */
  }
}
