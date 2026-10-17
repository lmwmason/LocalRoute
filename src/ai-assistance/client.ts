import type { z } from "zod";
import {
  assessmentRequestSchema,
  menuPhotoOptionsSchema,
  menuAssistanceResultSchema,
  reviewAssistanceResultSchema,
  type AssessmentRequest,
  type MenuPhotoOptions,
  type MenuAssistanceResult,
  type ReviewAssistanceResult,
} from "../../shared/ai-assistance";
import { preparePhotoUpload } from "../photos/prepare-upload";

/** Same-origin API only. Token supplier obtains the existing user's session;
 * the server independently validates the session, email and stored roles.
 * Never use the app's generic request helper: failures here are typed results.
 */
export function createAiAssistanceClient(options: {
  token: () => Promise<string | null>;
  fetcher?: typeof fetch;
}) {
  const fetcher = options.fetcher ?? fetch;
  async function send<T>(
    path: "menu" | "review",
    init: RequestInit,
    schema: z.ZodType<T>,
  ): Promise<
    | T
    | {
        status: "failed";
        code: "unauthenticated" | "invalid_output" | "unavailable";
      }
  > {
    try {
      const token = await options.token();
      if (!token) return { status: "failed", code: "unauthenticated" };
      const response = await fetcher(`/api/ai-assistance/${path}`, {
        ...init,
        method: "POST",
        cache: "no-store",
        redirect: "error",
        credentials: "same-origin",
        referrerPolicy: "no-referrer",
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) return { status: "failed", code: "invalid_output" };
      // Never accept a successful draft transported with an HTTP error.
      if (
        !response.ok &&
        (parsed.data as { status: string }).status !== "failed"
      )
        return { status: "failed", code: "invalid_output" };
      return parsed.data;
    } catch {
      return { status: "failed", code: "unavailable" };
    }
  }
  return {
    async extractMenu(
      file: File,
      input: MenuPhotoOptions,
    ): Promise<MenuAssistanceResult> {
      const parsed = menuPhotoOptionsSchema.safeParse(input);
      if (!parsed.success) return { status: "failed", code: "invalid_input" };
      if (file.size > 5 * 1024 * 1024)
        return { status: "failed", code: "photo_too_large" };
      if (
        !file.size ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      )
        return { status: "failed", code: "invalid_photo" };
      let photo: File;
      try {
        // Menu preprocessing on the server uses the same 320px minimum.
        photo = await preparePhotoUpload(file, { minimumDimension: 320 });
      } catch (error) {
        return {
          status: "failed",
          code:
            error instanceof Error && error.message === "photos.error.size"
              ? "photo_too_large"
              : "invalid_photo",
        };
      }
      return send(
        "menu",
        {
          headers: {
            "Content-Type": photo.type,
            "X-Menu-Options": JSON.stringify(parsed.data),
          },
          body: photo,
        },
        menuAssistanceResultSchema,
      );
    },
    async assessContribution(
      input: AssessmentRequest,
    ): Promise<ReviewAssistanceResult> {
      const parsed = assessmentRequestSchema.safeParse(input);
      if (!parsed.success) return { status: "failed", code: "invalid_input" };
      return send(
        "review",
        {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
        reviewAssistanceResultSchema,
      );
    },
  };
}
