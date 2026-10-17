import express, { type ErrorRequestHandler, type Request } from "express";
import { z } from "zod";
import { contributionSchema, placeTargetSchema } from "../shared/domain";
import { maxPhotoBytes, preparePlacePhoto, type PhotoTarget } from "./photos";
import { demoPlaces } from "../shared/demo";
import { bookingProfileSchema } from "../shared/booking";
import { AppError } from "./errors";
import { attachShares } from "./sharing";
import { attachTestCheckout } from "./testcheckout";
import { attachAdminAutomation } from "./admin-automation";
import { attachVisitRewards, readVisitRewardSettings } from "./visit-rewards";
import {
  createAiAssistance,
  createAssistanceModel,
  attachAiAssistance,
} from "./ai-assistance";
import { attachLegal, createLegalStore } from "./legal";
import { KakaoDestinations, attachDestinations } from "./destinations";
import { attachBooking } from "./booking";
import { readBookingSettings, bookingEnabled } from "./booking/config";
import { localitySchema, resolveLocalityCoverage } from "../shared/locality";
import type { ServerConfig } from "./config";
import { HeyYumi, providerPlace } from "./heyyumi";
import type { Actor, Repository } from "./repository";
import { candidateSigner } from "./candidates";
import { attachPlanner, type PlannerDependencies } from "./planner/routes";
import {
  correctionSchema,
  decisionSchema,
  feedbackSchema,
  reportSchema,
} from "../shared/community";

export function createApp(
  config: ServerConfig,
  repository?: Repository,
  provider = new HeyYumi(config.heyyumiKey, config.heyyumiBudget),
  plannerDependencies?: PlannerDependencies,
) {
  const app = express();
  const bookingConfig = {
    ...config,
    live: config.live && config.database,
    booking: readBookingSettings(process.env),
  };
  const aiEnabled =
    config.live &&
    config.database &&
    config.aiDataApproved &&
    Boolean(repository && config.geminiKey) &&
    (config.menuExtraction || config.moderation);
  const candidates = candidateSigner();
  const resUser = new WeakMap<Request, Actor>();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.set("Cache-Control", "no-store");
    if (req.path.startsWith("/s/"))
      res
        .set("Referrer-Policy", "strict-origin-when-cross-origin")
        .set("X-Robots-Tag", "noindex, nofollow, noarchive");
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  attachDestinations(app, new KakaoDestinations(config.destinations));
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
  const legal = attachLegal(app, {
    store: config.database ? createLegalStore(config) : undefined,
    limit,
  });
  if (config.live && config.database) {
    app.use("/api/me", legal.requireConsent);
    app.put("/api/me", legal.requirePublicAreaChoice);
    app.post("/api/contributions", legal.requireConsent);
    app.post("/api/place-photos/:requestId", legal.requireConsent);
    app.put("/api/endorsements/:id", legal.requireConsent);
    app.post("/api/feedback", legal.requireConsent);
    app.post("/api/reports", legal.requireConsent);
    app.use("/api/admin", legal.requireConsent);
    app.post("/api/planning/generate", legal.requireConsent);
    app.post("/api/planning/cancel/:requestId", legal.requireConsent);
    app.get("/api/planning/quote", legal.requireConsent);
    app.get("/api/planning/status/:requestId", legal.requireConsent);
    app.use("/api/itineraries", legal.requireConsent);
    app.use("/api/itinerary-shares", legal.requireConsent);
    app.post("/api/booking/reservations", legal.requireConsent);
    app.use("/api/ai-assistance", legal.requireConsent);
    app.use("/api/visit-rewards", legal.requireConsent);
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
        menuExtraction: aiEnabled && config.menuExtraction,
        moderation: aiEnabled && config.moderation,
        booking: bookingEnabled(bookingConfig),
        lp: config.planning,
      },
      warnings: config.warnings,
    }),
  );
  attachBooking(app, bookingConfig, actor);
  attachTestCheckout(app, {
    config: { ...config, live: config.live && config.database },
    actor,
    limit,
  });
  app.get("/api/places/:id", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const place = config.live
      ? (await repository?.places(id))?.[0]
      : demoPlaces.find((place) => place.id === id);
    if (!place) throw new AppError(404, "장소를 찾을 수 없어요.");
    res.json(place);
  });
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
  app.post(
    "/api/place-photos/:requestId",
    async (req, _res, next) => {
      try {
        const user = await actor(req);
        limit(`photo:${user.id}`, 5, 60);
        resUser.set(req, user);
        next();
      } catch (error) {
        next(error);
      }
    },
    express.raw({ type: () => true, limit: maxPhotoBytes }),
    async (req, res) => {
      const user = resUser.get(req)!;
      if (req.get("X-Photo-Consent") !== "real-place-photo-v1")
        throw new AppError(400, "photos.error.consent");
      let raw: unknown;
      try {
        raw = JSON.parse(decodeURIComponent(req.get("X-Place-Target") || ""));
      } catch {
        throw new AppError(400, "photos.error.place");
      }
      const payload = placeTargetSchema.parse(raw);
      let target: PhotoTarget;
      if (payload.candidateToken) {
        if (!config.heyyumi) throw new AppError(503, "photos.error.place");
        target = {
          provider: { id: candidates.verify(payload.candidateToken).id },
        };
      } else
        target = payload.manualPlace
          ? { manualPlace: payload.manualPlace }
          : { placeId: payload.placeId! };
      const photo = await preparePlacePhoto(
        req.body,
        req.get("Content-Type")?.split(";")[0] || "",
      );
      res
        .status(201)
        .json(
          await repository!.uploadPhoto(
            user,
            z.uuid().parse(req.params.requestId),
            target,
            photo,
          ),
        );
    },
  );
  app.get("/api/place-photos/:id/image", async (req, res) => {
    limit(`photo-read:${req.ip}`, 120, 60);
    if (!config.live || !repository)
      throw new AppError(404, "photos.error.load");
    const user = req.get("Authorization") ? await actor(req) : null;
    const bytes = await repository.photo(user, z.uuid().parse(req.params.id));
    res
      .type("image/jpeg")
      .set("Cache-Control", "private, no-store")
      .send(bytes);
  });
  app.get("/api/me", async (req, res) => {
    const user = await actor(req);
    res.json(await repository!.community(user, "workspace", null, {}));
  });
  app.get("/api/me/booking-profile", async (req, res) => {
    const user = await actor(req);
    res.json(await repository!.bookingProfile(user, "get", {}));
  });
  app.put("/api/me/booking-profile", async (req, res) => {
    const user = await actor(req);
    limit(`booking-profile:${user.id}`, 10, 60);
    res.json(
      await repository!.bookingProfile(
        user,
        "save",
        bookingProfileSchema.parse(req.body),
      ),
    );
  });
  app.delete("/api/me/booking-profile", async (req, res) => {
    const user = await actor(req);
    res.json(await repository!.bookingProfile(user, "delete", {}));
  });
  app.post("/api/me/booking-profile/skip", async (req, res) => {
    const user = await actor(req);
    res.json(await repository!.bookingProfile(user, "skip", {}));
  });
  app.get("/api/me/locality-coverage", async (req, res) => {
    const user = await actor(req);
    const minimumNeeded = z.coerce
      .number()
      .int()
      .min(1)
      .max(40)
      .default(1)
      .parse(req.query.minimumNeeded);
    const workspace = (await repository!.community(
      user,
      "workspace",
      null,
      {},
    )) as Record<string, unknown>;
    const locality = localitySchema.safeParse(workspace);
    if (!locality.success) {
      res.json({ coverage: null });
      return;
    }
    limit(`locality:${user.id}`, 15, 60);
    const counts = z
      .object({
        city: z.number().int().nonnegative(),
        area: z.number().int().nonnegative(),
      })
      .parse(await repository!.community(user, "locality_counts", null, {}));
    res.json({
      coverage: {
        ...resolveLocalityCoverage(locality.data, counts, minimumNeeded),
        counts,
        minimumNeeded,
      },
    });
  });
  app.put("/api/me", async (req, res) => {
    const user = await actor(req);
    const payload = z
      .object({
        requestId: z.uuid(),
        displayName: z.string().trim().min(1).max(40),
        publicLocalArea: z.boolean(),
      })
      .and(localitySchema)
      .parse(req.body);
    res.json(
      await repository!.community(user, "profile", payload.requestId, payload),
    );
  });
  app.put("/api/endorsements/:id", async (req, res) => {
    const user = await actor(req);
    const payload = z
      .object({ requestId: z.uuid(), text: z.string().trim().min(5).max(200) })
      .parse(req.body);
    res.json(
      await repository!.community(user, "edit_endorsement", payload.requestId, {
        ...payload,
        id: z.uuid().parse(req.params.id),
      }),
    );
  });
  app.post("/api/feedback", async (req, res) => {
    const user = await actor(req);
    const payload = feedbackSchema.parse(req.body);
    res
      .status(201)
      .json(
        await repository!.community(
          user,
          "feedback",
          payload.requestId,
          payload,
        ),
      );
  });
  app.post("/api/reports", async (req, res) => {
    const user = await actor(req);
    const payload = reportSchema.parse(req.body);
    res
      .status(201)
      .json(
        await repository!.community(user, "report", payload.requestId, payload),
      );
  });
  app.post("/api/corrections", async (req, res) => {
    limit(`correction:${req.ip}`, 3, 3600);
    if (!config.live || !repository)
      throw new AppError(
        503,
        "실제 정보 수정 요청은 서비스 연결 후 이용할 수 있어요.",
      );
    const payload = correctionSchema.parse(req.body);
    res
      .status(201)
      .json(
        await repository.community(
          null,
          "owner_correction",
          payload.requestId,
          payload,
        ),
      );
  });
  app.get("/api/admin/queue", async (req, res) => {
    const user = await actor(req);
    if (!["moderator", "admin"].includes(user.role))
      throw new AppError(403, "운영자 권한이 필요해요.");
    res.json(await repository!.community(user, "queue", null, {}));
  });
  app.post("/api/admin/decisions", async (req, res) => {
    const user = await actor(req);
    if (!["moderator", "admin"].includes(user.role))
      throw new AppError(403, "운영자 권한이 필요해요.");
    const payload = decisionSchema.parse(req.body);
    res.json(
      await repository!.community(user, "decide", payload.requestId, payload),
    );
  });
  if (repository) {
    const enabled = aiEnabled;
    const assistance = createAiAssistance({
      repository,
      enabled,
      menuEnabled: config.menuExtraction,
      reviewEnabled: config.moderation,
      model: enabled
        ? createAssistanceModel({
            key: config.geminiKey,
            model: config.geminiModel,
            budget: config.aiBudget,
            timeoutMs: 15000,
          })
        : undefined,
      maxCalls: enabled ? config.aiBudget : 0,
      perUserCalls: 3,
      timeoutMs: 15000,
      maxConcurrent: 2,
    });
    attachAiAssistance(app, assistance);
    attachAdminAutomation(app, {
      repository,
      assistance,
      enabled: aiEnabled && config.moderation,
    });
  }
  attachPlanner(app, config, repository, actor, plannerDependencies);
  attachVisitRewards(
    app,
    {
      ...config,
      live: config.live && config.database,
      visitRewards: readVisitRewardSettings(process.env),
    },
    actor,
  );
  attachShares(app, repository, actor, limit);
  app.use("/api", (_req, _res, next) =>
    next(new AppError(404, "요청한 기능을 찾을 수 없어요.")),
  );
  const handler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error?.type === "entity.too.large") {
      res.status(413).json({ error: "photos.error.size" });
      return;
    }
    if (error instanceof z.ZodError) {
      res.status(400).json({
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
