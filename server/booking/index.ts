import type { Express, Request } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  providerState,
  reservationSchema,
  type BookingVenue,
} from "../../shared/reservations";
import { AppError } from "../errors";
import type { Actor } from "../repository";
import { bookingEnabled, type BookingConfig } from "./config";
import {
  HeyYumiBooking,
  type BookingProvider,
  type ProviderResult,
} from "./provider";
import {
  bookingStore,
  parseRow,
  publicReservation,
  type BookingStore,
  type StoredReservation,
} from "./store";

export type BookingDependencies = {
  store: BookingStore;
  provider: BookingProvider;
};
export function attachBooking(
  app: Express,
  config: BookingConfig,
  actor: (req: Request) => Promise<Actor>,
  dependencies?: BookingDependencies,
) {
  const enabled = bookingEnabled(config);
  app.use("/api/booking", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  // Keep stored records readable with the feature off; never call HeyYumi then.
  const store =
    dependencies?.store ||
    (config.live && config.database ? bookingStore(config) : undefined);
  const provider =
    dependencies?.provider ||
    (enabled
      ? new HeyYumiBooking(config.heyyumiKey, config.booking?.budget)
      : undefined);
  const buckets = new Map<string, { count: number; expires: number }>();
  function limit(id: string, mutation: boolean) {
    const now = Date.now();
    for (const [key, entry] of buckets)
      if (entry.expires <= now) buckets.delete(key);
    const key = `${mutation ? "write" : "read"}:${id}`;
    const entry = buckets.get(key) || { count: 0, expires: now + 60000 };
    buckets.set(key, entry);
    if (++entry.count > (mutation ? 20 : 120))
      throw new AppError(429, "booking.limit", String(Math.max(1, Math.ceil((entry.expires - now) / 1000))));
  }
  async function user(req: Request, sending = false) {
    const user = await actor(req); // Must use existing getUser + confirmed-email authenticator.
    if (!config.live || !store || (sending && (!enabled || !provider)))
      throw new AppError(503, "booking.disabled");
    limit(user.id, req.method !== "GET");
    return user;
  }
  async function venue(userId: string, placeId: string): Promise<BookingVenue> {
    const mapping = z
      .object({ externalId: z.string().min(1) })
      .nullable()
      .parse(await store!.action(userId, "venue", { placeId }));
    if (!mapping) throw new AppError(422, "booking.unsupported");
    const result = await provider!.venue(mapping.externalId);
    return {
      placeId,
      externalId: mapping.externalId,
      name: result.name,
      address: result.address,
      supported: result.supported,
      phone: result.phone,
    };
  }
  async function settle(
    userId: string,
    row: StoredReservation,
    result?: ProviderResult,
  ) {
    const matching =
      result &&
      result.placeId === row.external_id &&
      (!row.provider_reference ||
        result.reservationId === row.provider_reference);
    return parseRow(
      await store!.action(userId, "settle", {
        id: row.id,
        revision: row.revision,
        state: matching
          ? providerState(result.status)
          : row.state === "submitting"
            ? "unknown"
            : row.state,
        reference: matching ? result.reservationId : null,
        expiresAt: matching ? result.expiresAt : null,
        providerStatus: matching ? result.status : null,
        reconciliationRequired:
          !matching || providerState(result.status) === "unknown",
      }),
    );
  }
  app.get("/api/booking/capabilities", (_req, res) =>
    res.json({ enabled, cancellation: false, availability: false }),
  );
  app.get("/api/booking/venues/:placeId", async (req, res) => {
    const u = await user(req, true);
    res.json(await venue(u.id, z.uuid().parse(req.params.placeId)));
  });
  app.get("/api/booking/profile", async (req, res) => {
    const u = await user(req, true);
    res
      .set("Cache-Control", "private, no-store")
      .json(await store!.action(u.id, "profile"));
  });
  app.get("/api/booking/requests/:requestId", async (req, res) => {
    const u = await user(req);
    const row = await store!.action(u.id, "lookup", {
      requestId: z.uuid().parse(req.params.requestId),
    });
    if (!row) throw new AppError(404, "booking.notFound");
    res
      .set("Cache-Control", "private, no-store")
      .json(publicReservation(parseRow(row)));
  });
  app.post("/api/booking/reservations", async (req, res) => {
    const u = await user(req, true);
    const input = reservationSchema.parse(req.body);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const prior = await store!.action(u.id, "lookup", {
      requestId: input.requestId,
    });
    if (prior) {
      const row = parseRow(prior);
      if (row.fingerprint !== fingerprint)
        throw new AppError(409, "booking.changed");
      res.json(publicReservation(row));
      return;
    }
    if (Date.parse(input.reservationTime) <= Date.now())
      throw new AppError(400, "booking.future");
    const target = await venue(u.id, input.placeId);
    if (!target.supported) throw new AppError(422, "booking.unsupported");
    if (
      target.name !== input.expectedName ||
      target.address !== input.expectedAddress
    )
      throw new AppError(409, "booking.venueChanged");
    const claim = z
      .object({ created: z.boolean(), reservation: z.unknown() })
      .parse(
        await store!.action(u.id, "claim", {
          ...input,
          fingerprint,
          externalId: target.externalId,
        }),
      );
    let row = parseRow(claim.reservation);
    if (claim.created) {
      let result: ProviderResult | undefined;
      try {
        // Stable across processes and user-supplied request key collisions.
        result = await provider!.submit(target.externalId, input, row.id);
      } catch {
        // Even 5xx/malformed JSON may follow a successful booking. Never replay POST.
      }
      row = await settle(u.id, row, result);
    }
    res.status(claim.created ? 201 : 200).json(publicReservation(row));
  });
  app.get("/api/booking/reservations/existing", async (req, res) => {
    const u = await user(req);
    const query = z.object({ placeId: z.uuid(), date: z.iso.date() }).parse(req.query);
    const row = await store!.action(u.id, "existing", query);
    res.json({ reservation: row ? publicReservation(parseRow(row)) : null });
  });
  app.get("/api/booking/reservations/:id", async (req, res) => {
    const u = await user(req);
    const row = parseRow(
      await store!.action(u.id, "read", { id: z.uuid().parse(req.params.id) }),
    );
    res.set("Cache-Control", "private, no-store").json(publicReservation(row));
  });
  app.post("/api/booking/reservations/:id/refresh", async (req, res) => {
    const u = await user(req, true);
    let row = parseRow(
      await store!.action(u.id, "read", { id: z.uuid().parse(req.params.id) }),
    );
    if (
      row.state === "submitting" &&
      Date.now() - Date.parse(row.updated_at) < 30000
    ) {
      res.json(publicReservation(row));
      return;
    }
    let result: ProviderResult | undefined;
    if (row.provider_reference) {
      try {
        result = await provider!.status(row.provider_reference);
      } catch {
        /* Preserve state and request reconciliation. */
      }
    }
    row = await settle(u.id, row, result);
    res.json(publicReservation(row));
  });
  // Explicitly unavailable; no invented provider cancellation or local false success.
  app.post("/api/booking/reservations/:id/cancel", async (req, _res) => {
    const u = await user(req);
    await store!.action(u.id, "read", { id: z.uuid().parse(req.params.id) });
    throw new AppError(409, "booking.cancellationUnavailable");
  });
}
