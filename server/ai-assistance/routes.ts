import express from "express";
import type { Express, Request, Response } from "express";
import type { AiAssistance } from "./index";
import type {
  AssistanceFailure,
  AssistanceResult,
} from "../../shared/ai-assistance";
import { maxPhotoBytes } from "./images";

const httpStatus: Record<AssistanceFailure, number> = {
  disabled: 503,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  invalid_photo: 415,
  photo_too_large: 413,
  rate_limited: 429,
  busy: 429,
  timeout: 504,
  unavailable: 503,
  invalid_output: 502,
};
const token = (req: Request) =>
  req.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1] ?? "";
function respond(res: Response, result: AssistanceResult<unknown>) {
  res.set("Cache-Control", "no-store").set("X-Content-Type-Options", "nosniff");
  if (result.status === "failed" && result.retryAfterSeconds !== undefined)
    res.set("Retry-After", String(result.retryAfterSeconds));
  res
    .status(result.status === "ready" ? 200 : httpStatus[result.code])
    .json(result);
}

/** Mount before the existing /api 404 handler. No persistence/LP/admin actions. */
export function attachAiAssistance(app: Express, assistance: AiAssistance) {
  const router = express.Router();
  router.post(
    "/menu",
    express.raw({ type: () => true, limit: maxPhotoBytes, inflate: false }),
    async (req, res) => {
      let options: unknown;
      try {
        const header = req.get("X-Menu-Options") ?? "";
        if (header.length > 8192) throw new Error();
        options = JSON.parse(header);
      } catch {
        respond(res, { status: "failed", code: "invalid_input" });
        return;
      }
      respond(
        res,
        await assistance.extractMenu(token(req), {
          bytes: req.body,
          mime: (req.get("Content-Type") ?? "")
            .split(";")[0]
            .trim()
            .toLowerCase(),
          options,
        }),
      );
    },
  );
  router.post(
    "/review",
    express.json({ limit: "8kb", strict: true }),
    async (req, res) => {
      respond(res, await assistance.assessContribution(token(req), req.body));
    },
  );
  router.use(((error, _req, res, _next) => {
    respond(res, {
      status: "failed",
      code:
        error?.type === "entity.too.large"
          ? "photo_too_large"
          : "invalid_input",
    });
  }) satisfies express.ErrorRequestHandler);
  app.use("/api/ai-assistance", router);
}
