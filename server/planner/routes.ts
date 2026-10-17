import type { Express, Request } from "express";
import { z } from "zod";
import {
  evaluateSchedule,
  scheduleSchema,
  tripSchema,
  type Candidate,
  type Itinerary,
} from "../../shared/planner";
import type { Actor, Repository } from "../repository";
import type { ServerConfig } from "../config";
import { AppError } from "../errors";
import { Gemini } from "../gemini";
import { KakaoActivities, localCandidates } from "./catalog";
import { generateValidated, type PinnedStop } from "./generate";
import { createKakaoRouting } from "../routing";
import { assessTransport } from "./transport";
import { KakaoDestinations } from "../destinations";
import type {
  TransportRequest,
  TransportLegResult,
} from "../../shared/transport";
export type PlannerDependencies = {
  gemini: Pick<Gemini, "structured">;
  activities: Pick<KakaoActivities, "search">;
  destinations?: Pick<KakaoDestinations, "verifySelection">;
  routing?: {
    lookup: (request: TransportRequest) => Promise<TransportLegResult>;
  };
};
const generateSchema = z.object({
  requestId: z.uuid(),
  input: tripSchema,
  expectedCost: z.number().int().min(1),
  policyVersion: z.string().min(1).max(100),
  consent: z.literal(true),
  sourcePlanId: z.uuid().optional(),
  pinIds: z.array(z.string().max(250)).max(40).default([]),
});
type Reservation = {
  id: string;
  status: "ready" | "generating" | "failed";
  replay?: boolean;
  result?: Itinerary;
  cost?: number;
};
export function attachPlanner(
  app: Express,
  config: ServerConfig,
  repository: Repository | undefined,
  actor: (req: Request) => Promise<Actor>,
  deps: PlannerDependencies = {
    gemini: new Gemini(
      config.geminiKey,
      config.geminiModel,
      fetch,
      config.aiBudget,
    ),
    activities: new KakaoActivities(config.kakaoKey),
  },
) {
  const destinations =
    deps.destinations || new KakaoDestinations(config.destinations);
  const routing =
    deps.routing ||
    createKakaoRouting({
      enabled: config.routing,
      carKey: config.kakaoKey,
      transitKey: config.kakaoKey,
      maxCalls: config.routingBudget,
    });
  app.get("/api/planning/quote", async (req, res) => {
    const user = await actor(req);
    if (!config.planning) {
      res.json({
        enabled: false,
        cost: 100,
        promo: null,
        earned: null,
        held: 0,
        policyVersion: "unapproved",
      });
      return;
    }
    res.json(await repository!.planning(user, "balance", null, {}));
  });
  app.get("/api/itineraries", async (req, res) => {
    const user = await actor(req);
    res.json(await repository!.planning(user, "list", null, {}));
  });
  app.get("/api/itineraries/:id", async (req, res) => {
    const user = await actor(req);
    res.json(
      await repository!.planning(user, "get", null, {
        id: z.uuid().parse(req.params.id),
      }),
    );
  });
  app.get("/api/planning/status/:requestId", async (req, res) => {
    const user = await actor(req);
    res.json(
      await repository!.planning(
        user,
        "status",
        z.uuid().parse(req.params.requestId),
        {},
      ),
    );
  });
  app.post("/api/planning/generate", async (req, res) => {
    const user = await actor(req);
    if (!config.planning) throw new AppError(503, "PLANNING_DISABLED");
    const payload = generateSchema.parse(req.body);
    // Replays are resolved before provider calls; reserve validates the original payload fingerprint.
    try {
      const prior = (await repository!.planning(
        user,
        "status",
        payload.requestId,
        {},
      )) as Reservation;
      if (prior.status === "ready" || prior.status === "generating") {
        const replay = (await repository!.planning(
          user,
          "reserve",
          payload.requestId,
          payload,
        )) as Reservation;
        if (replay.status === "ready") {
          res.json(replay.result);
          return;
        }
        res
          .status(202)
          .json({ status: "generating", requestId: payload.requestId });
        return;
      }
      if (prior.status === "failed")
        throw new AppError(409, "PREVIOUS_REQUEST_FAILED");
    } catch (error) {
      if (!(error instanceof AppError && error.status === 404)) throw error;
    }
    if (typeof payload.input.destination === "string")
      throw new AppError(400, "DESTINATION_SELECTION_INVALID");
    const canonicalInput = {
      ...payload.input,
      destination: await destinations.verifySelection(
        payload.input.destination,
      ),
    };
    const reservation = (await repository!.planning(
      user,
      "reserve",
      payload.requestId,
      payload,
    )) as Reservation;
    if (reservation.status === "ready") {
      res.json(reservation.result);
      return;
    }
    if (reservation.status === "failed")
      throw new AppError(409, "PREVIOUS_REQUEST_FAILED");
    if (reservation.replay) {
      res
        .status(202)
        .json({ status: "generating", requestId: payload.requestId });
      return;
    }
    try {
      const pins: PinnedStop[] = [];
      let pinnedCatalog: Candidate[] = [];
      if (payload.sourcePlanId) {
        const original = (await repository!.planning(user, "get", null, {
          id: payload.sourcePlanId,
        })) as Itinerary;
        if (
          (typeof original.input.destination === "string"
            ? original.input.destination
            : original.input.destination.id) !== payload.input.destination.id ||
          original.input.startDate !== payload.input.startDate ||
          original.input.endDate !== payload.input.endDate
        )
          throw new AppError(400, "PIN_DATES_CHANGED");
        for (const day of original.schedule.days)
          for (const stop of day.stops)
            if (payload.pinIds.includes(stop.candidateId))
              pins.push({ date: day.date, stop });
        if (pins.length !== payload.pinIds.length)
          throw new AppError(400, "INVALID_PIN");
        pinnedCatalog = original.catalog.filter((c) =>
          payload.pinIds.includes(c.id),
        );
      } else if (payload.pinIds.length) throw new AppError(400, "INVALID_PIN");
      const [places, activities] = await Promise.all([
        repository!.places(undefined, canonicalInput.destination),
        deps.activities.search(canonicalInput),
      ]);
      const catalog = [
        ...new Map(
          [
            ...localCandidates(places, canonicalInput),
            ...activities,
            ...pinnedCatalog,
          ].map((c) => [c.id, c]),
        ).values(),
      ];
      const generated = await generateValidated(
        deps.gemini,
        canonicalInput,
        catalog,
        pins,
        routing.lookup,
      );
      const itinerary: Itinerary = {
        id: reservation.id,
        revision: 1,
        input: canonicalInput,
        catalog,
        ...generated,
        createdAt: new Date().toISOString(),
        model: config.geminiModel,
        provenance: "gemini",
        cost: reservation.cost || payload.expectedCost,
      };
      const saved = await repository!.planning(
        user,
        "finalize",
        payload.requestId,
        { result: itinerary },
      );
      res.status(201).json(saved);
    } catch (error) {
      try {
        const status = (await repository!.planning(
          user,
          "status",
          payload.requestId,
          {},
        )) as Reservation;
        if (status.status === "ready" && status.result) {
          res.json(status.result);
          return;
        }
        await repository!.planning(user, "fail", payload.requestId, {
          code: error instanceof AppError ? error.message : "GENERATION_FAILED",
        });
      } catch {
        throw new AppError(503, "REQUEST_STATUS_UNKNOWN");
      }
      throw error;
    }
  });
  app.put("/api/itineraries/:id", async (req, res) => {
    const user = await actor(req);
    const id = z.uuid().parse(req.params.id);
    const payload = z
      .object({ revision: z.number().int().min(1), schedule: scheduleSchema })
      .parse(req.body);
    const original = (await repository!.planning(user, "get", null, {
      id,
    })) as Itinerary;
    const evaluation = evaluateSchedule(
      payload.schedule,
      original.input,
      original.catalog,
    );
    if (!evaluation.valid) {
      res
        .status(422)
        .json({ error: "SCHEDULE_QUALITY_FAILED", issues: evaluation.errors });
      return;
    }
    const checked = await assessTransport(
      payload.schedule,
      original.input,
      original.catalog,
      routing.lookup,
    );
    evaluation.errors.push(...checked.errors);
    evaluation.warnings.push(...checked.warnings);
    evaluation.valid = evaluation.errors.length === 0;
    if (!evaluation.valid) {
      res
        .status(422)
        .json({ error: "SCHEDULE_QUALITY_FAILED", issues: evaluation.errors });
      return;
    }
    res.json(
      await repository!.planning(user, "save", null, {
        id,
        revision: payload.revision,
        result: {
          ...original,
          schedule: payload.schedule,
          evaluation,
          transport: checked.transport,
        },
      }),
    );
  });
}
