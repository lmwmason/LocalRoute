import express, { type ErrorRequestHandler, type Request } from "express";
import { z } from "zod";
import { contributionSchema } from "../shared/domain";
import { demoPlaces } from "../shared/demo";
import { AppError } from "./errors";
import type { ServerConfig } from "./config";
import { HeyYumi, providerPlace } from "./heyyumi";
import type { Actor, Repository } from "./repository";
import { candidateSigner } from "./candidates";

export function createApp(
  config: ServerConfig,
  repository?: Repository,
  provider = new HeyYumi(config.heyyumiKey, config.heyyumiBudget),
) {
  const app = express();
  const candidates = candidateSigner();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "24kb" }));
  const buckets = new Map<string, { count: number; expires: number }>();
  function limit(key: string, maximum: number, seconds: number) {
    const now = Date.now();
    if (buckets.size > 5000)
      for (const [k, value] of buckets)
        if (value.expires <= now) buckets.delete(k);
    let value = buckets.get(key);
    if (!value || value.expires <= now) {
      value = { count: 0, expires: now + seconds * 1000 };
      buckets.set(key, value);
    }
    if (++value.count > maximum)
      throw new AppError(
        429,
        "요청이 많아요. 잠시 후 다시 시도해 주세요.",
        String(Math.ceil((value.expires - now) / 1000)),
      );
  }
  async function actor(req: Request): Promise<Actor> {
    if (!config.live || !repository)
      throw new AppError(503, "실제 저장 기능이 아직 연결되지 않았어요.");
    const header = req.get("Authorization");
    if (!header?.startsWith("Bearer "))
      throw new AppError(401, "로그인 후 이용해 주세요.");
    return repository.authenticate(header.slice(7));
  }
  app.get("/api/health", (_req, res) =>
    res.json({
      ok: true,
      mode: config.live ? "live" : "demo",
      database: Boolean(repository),
      capabilities: {
        search: config.heyyumi,
        menuExtraction: false,
        moderation: false,
        booking: false,
        lp: false,
      },
      warnings: config.warnings,
    }),
  );
  app.get("/api/places", async (_req, res) => {
    if (!config.live) {
      res.json({ places: demoPlaces, mode: "demo" });
      return;
    }
    if (!repository) throw new AppError(503, "Supabase 연결 설정이 필요해요.");
    res.json({ places: await repository.places(), mode: "live" });
  });
  app.get("/api/search", async (req, res) => {
    if (!config.heyyumi)
      throw new AppError(
        503,
        "외부 장소 검색은 이용 권한과 요금 확인 후 연결됩니다.",
      );
    const query = z.string().trim().min(2).max(100).parse(req.query.q);
    limit(`search:${req.ip}`, 15, 60);
    res.json({
      places: (await provider.search(query)).map((venue) => ({
        ...providerPlace(venue),
        candidateToken: candidates.issue(venue),
      })),
    });
  });
  app.post("/api/contributions", async (req, res) => {
    const user = await actor(req);
    limit(`contribute:${user.id}`, 10, 60);
    const payload = contributionSchema.parse(req.body);
    if (payload.candidateToken && !config.heyyumi)
      throw new AppError(503, "외부 장소 등록은 이용 권한 확인 후 연결됩니다.");
    res
      .status(201)
      .json(
        await repository!.contribute(
          user,
          payload,
          payload.candidateToken
            ? candidates.verify(payload.candidateToken)
            : undefined,
        ),
      );
  });
  app.use("/api", (_req, _res, next) =>
    next(new AppError(404, "요청한 기능을 찾을 수 없어요.")),
  );
  const handler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) {
      res
        .status(400)
        .json({
          error: error.issues[0]?.message || "입력 내용을 확인해 주세요.",
        });
      return;
    }
    if (error instanceof AppError) {
      if (error.retryAfter) res.set("Retry-After", error.retryAfter);
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: "올바른 JSON 요청이 필요해요." });
      return;
    }
    res
      .status(500)
      .json({ error: "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." });
  };
  app.use(handler);
  return app;
}
