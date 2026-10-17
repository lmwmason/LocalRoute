import { createHash, randomBytes } from "node:crypto";
import type { Express, Request } from "express";
import { z } from "zod";
import type { Actor, Repository } from "./repository";
import type { Itinerary } from "../shared/planner";
import { sharedItinerarySchema, shareSnapshot } from "../shared/sharing";
import { AppError } from "./errors";
export const hashShareToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function attachShares(
  app: Express,
  repository: Repository | undefined,
  actor: (req: Request) => Promise<Actor>,
  limit: (key: string, max: number, seconds: number) => void,
) {
  app.post("/api/itineraries/:id/shares", async (req, res) => {
    const user = await actor(req);
    limit(`share:${user.id}`, 5, 60);
    const id = z.uuid().parse(req.params.id),
      payload = z
        .object({
          revision: z.number().int().positive(),
          expiresInDays: z
            .union([z.literal(1), z.literal(7), z.literal(30)])
            .default(7),
          consentVersion: z.literal("unlisted-itinerary-v1"),
        })
        .strict()
        .parse(req.body);
    const original = (await repository!.planning(user, "get", null, {
      id,
    })) as Itinerary;
    if (!original.evaluation.valid) throw new AppError(422, "sharing.invalid");
    if (original.revision !== payload.revision)
      throw new AppError(409, "sharing.changed");
    const token = randomBytes(32).toString("base64url");
    const link = (await repository!.shares(user, "create", {
      ...payload,
      itineraryId: id,
      tokenHash: hashShareToken(token),
      snapshot: shareSnapshot(original),
    })) as Record<string, unknown>;
    res.status(201).json({ ...link, path: `/s/${token}` });
  });
  app.get("/api/itineraries/:id/shares", async (req, res) => {
    const user = await actor(req);
    res.json(
      await repository!.shares(user, "list", {
        itineraryId: z.uuid().parse(req.params.id),
      }),
    );
  });
  app.delete("/api/itinerary-shares/:id", async (req, res) => {
    const user = await actor(req);
    res.json(
      await repository!.shares(user, "revoke", {
        id: z.uuid().parse(req.params.id),
      }),
    );
  });
  app.get("/api/shared-itineraries/:token", async (req, res) => {
    res
      .set("Referrer-Policy", "no-referrer")
      .set("X-Robots-Tag", "noindex, nofollow, noarchive");
    limit(`shared-read:${req.ip}`, 60, 60);
    if (!repository || !/^[-_A-Za-z0-9]{43}$/.test(String(req.params.token)))
      throw new AppError(404, "sharing.unavailable");
    const data = await repository.shares(null, "public", {
      tokenHash: hashShareToken(String(req.params.token)),
    });
    res.json(sharedItinerarySchema.parse(data));
  });
}
