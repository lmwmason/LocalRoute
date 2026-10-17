import { z } from "zod";
import { destinationSchema } from "./destinations";
import { regionForDestination, stopTimestamp, type Itinerary } from "./planner";

const sourceSchema = z
  .object({
    provider: z.enum(["localroute", "kakao", "demo"]),
    verification: z.enum(["canonical", "provider", "demo"]),
    observedAt: z.string().max(100),
  })
  .strict();
export const sharedItinerarySchema = z
  .object({
    version: z.literal(1),
    title: z.string().max(200),
    language: z.enum(["ko", "en"]),
    destination: z.union([
      z.enum(["seongsu", "jongno", "haeundae"]),
      destinationSchema,
    ]),
    revision: z.number().int().positive(),
    provenance: z.enum(["gemini", "demo"]),
    sharedAt: z.iso.datetime(),
    days: z
      .array(
        z
          .object({
            date: z.iso.date(),
            stops: z
              .array(
                z
                  .object({
                    id: z.string().max(350),
                    start: z.string().regex(/^\d{2}:\d{2}$/),
                    end: z.string().regex(/^\d{2}:\d{2}$/),
                    startAt: z.iso.datetime({ offset: true }),
                    endAt: z.iso.datetime({ offset: true }),
                    purpose: z.enum(["visit", "lunch", "dinner", "break"]),
                    place: z
                      .object({
                        id: z.string().max(250),
                        name: z.string().max(150),
                        kind: z.enum([
                          "restaurant",
                          "cafe",
                          "attraction",
                          "culture",
                          "experience",
                        ]),
                        address: z.string().max(300),
                        lat: z.number().min(-90).max(90),
                        lng: z.number().min(-180).max(180),
                        photoId: z.uuid().optional(),
                        source: sourceSchema,
                      })
                      .strict(),
                  })
                  .strict(),
              )
              .min(2)
              .max(8),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();
export type SharedItinerary = z.infer<typeof sharedItinerarySchema>;
export type ShareLink = {
  id: string;
  revision: number;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};
export function shareSnapshot(
  plan: Itinerary,
  sharedAt = new Date().toISOString(),
): SharedItinerary {
  const byId = new Map(plan.catalog.map((place) => [place.id, place]));
  // Intentionally no object spreads: model prose can repeat private prompt inputs.
  // Publish only venue identities and visit times, never free-form rationale/summary.
  return sharedItinerarySchema.parse({
    version: 1,
    title: `${regionForDestination(plan.input.destination)[plan.input.language]} · ${plan.input.language === "ko" ? "여행 일정" : "Travel itinerary"}`,
    language: plan.input.language,
    destination: plan.input.destination,
    revision: plan.revision,
    provenance: plan.provenance,
    sharedAt,
    days: plan.schedule.days.map((day) => ({
      date: day.date,
      stops: day.stops.map((stop) => {
        const place = byId.get(stop.candidateId);
        if (!place) throw new Error("UNKNOWN_PLACE");
        return {
          id: `${plan.id}:${day.date}:${place.id}`,
          start: stop.start,
          end: stop.end,
          startAt: stopTimestamp(day.date, stop.start),
          endAt: stopTimestamp(day.date, stop.end),
          purpose: stop.purpose,
          place: {
            id: place.id,
            name: place.name,
            kind: place.kind,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
            photoId:
              place.photo?.review === "approved" ? place.photo.id : undefined,
            source: {
              provider: place.source.provider,
              verification: place.source.verification,
              observedAt: place.source.observedAt,
            },
          },
        };
      }),
    })),
  });
}
export function sharedItineraryText(plan: SharedItinerary) {
  return [
    plan.provenance === "demo" ? "DEMO · FICTIONAL PLACES" : "LocalRoute",
    plan.title,
    ...plan.days.flatMap((day, index) => [
      `\nDay ${index + 1} · ${day.date}`,
      ...day.stops.map(
        (stop) =>
          `${stop.start}–${stop.end} ${stop.place.name}\n${stop.place.address}`,
      ),
    ]),
    plan.language === "ko"
      ? "영업·예약·교통 상황은 방문 전 확인해 주세요."
      : "Check venue hours, booking and transport before traveling.",
  ].join("\n");
}
