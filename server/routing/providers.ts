import { z } from "zod";
import type {
  TransportLegResult,
  TransportRequest,
  TransportSource,
} from "../../shared/transport";

export const CAR_ENDPOINT = "https://apis-navi.kakaomobility.com/v1/directions";
export const TRANSIT_ENDPOINT =
  "https://dapi.kakao.com/v2/routing/publictraffic";
const quantity = z.number().finite().nonnegative();
const count = quantity.int();
const guide = z.object({
  guidance: z.string(),
  distance: quantity,
  duration: quantity,
});
const carRoute = z.object({
  result_code: z.number().int(),
  summary: z.object({
    distance: quantity,
    duration: quantity,
    fare: z.object({ toll: quantity.optional() }).optional(),
  }),
  sections: z.array(z.object({ guides: z.array(guide) })).min(1),
});
const transitRoute = z.object({
  properties: z.object({
    totalDistance: quantity,
    totalTime: quantity,
    transfers: count,
    fare: z
      .object({
        value: quantity.optional(),
        min: quantity.optional(),
        max: quantity.optional(),
      })
      .optional(),
  }),
  steps: z
    .array(
      z.object({
        properties: z.object({
          guidance: z.string(),
          type: z.enum(["BUS", "SUBWAY", "WALKING"]),
          distance: quantity,
          time: quantity,
          stops: z.array(z.object({ name: z.string() })).optional(),
          vehicles: z
            .array(z.object({ name: z.string(), type: z.string() }))
            .optional(),
        }),
      }),
    )
    .min(1),
});

export function routeUrl(request: TransportRequest): URL {
  const { origin: a, destination: b } = request;
  if (request.mode === "car") {
    const url = new URL(CAR_ENDPOINT);
    url.search = new URLSearchParams({
      origin: `${a.lng},${a.lat}`,
      destination: `${b.lng},${b.lat}`,
      summary: "false",
      alternatives: "false",
      priority: "RECOMMEND",
    }).toString();
    return url;
  }
  if (request.mode !== "transit") throw new Error("UNSUPPORTED_MODE");
  const url = new URL(TRANSIT_ENDPOINT);
  url.search = new URLSearchParams({
    start_x: String(a.lng),
    start_y: String(a.lat),
    end_x: String(b.lng),
    end_y: String(b.lat),
    input_coord: "WGS84",
    output_coord: "WGS84",
  }).toString();
  return url;
}

export class RouteResponseError extends Error {
  constructor(
    public reason: "no_results" | "invalid_response" | "invalid_request",
  ) {
    super(reason);
  }
}
export function parseProviderRoute(
  data: unknown,
  request: TransportRequest,
  source: TransportSource,
): TransportLegResult {
  const base = {
    request,
    source,
    timeBasis: "lookup_time" as const,
    arrivalGuaranteed: false as const,
    accessibility: "unverified" as const,
    status: "estimated" as const,
  };
  if (request.mode === "car") {
    const envelope = z.object({ routes: z.array(z.unknown()) }).safeParse(data);
    if (!envelope.success) throw new RouteResponseError("invalid_response");
    if (!envelope.data.routes.length)
      throw new RouteResponseError("no_results");
    const code = z
      .object({ result_code: z.number().int() })
      .safeParse(envelope.data.routes[0]);
    if (!code.success) throw new RouteResponseError("invalid_response");
    // Documented route-search failures; never treat unknown provider codes as success.
    if ([1, 101, 102, 103, 104, 105, 106, 107].includes(code.data.result_code))
      throw new RouteResponseError("no_results");
    if (code.data.result_code !== 0)
      throw new RouteResponseError("invalid_response");
    const parsed = carRoute.safeParse(envelope.data.routes[0]);
    if (!parsed.success) throw new RouteResponseError("invalid_response");
    const { summary, sections } = parsed.data;
    const toll = summary.fare?.toll;
    return {
      ...base,
      distanceMeters: summary.distance,
      durationSeconds: summary.duration,
      transfers: null,
      walking: null,
      steps: sections.flatMap((section) =>
        section.guides.map((g) => ({
          mode: "car" as const,
          guidance: g.guidance,
          distanceMeters: g.distance,
          durationSeconds: g.duration,
          stops: [],
          vehicles: [],
        })),
      ),
      fare:
        toll === undefined
          ? null
          : {
              currency: "KRW",
              value: toll,
              min: null,
              max: null,
              kind: "toll",
            },
    };
  }
  if (request.mode !== "transit")
    throw new RouteResponseError("invalid_request");
  const envelope = z
    .object({ status: z.string(), routes: z.array(z.unknown()).optional() })
    .safeParse(data);
  if (!envelope.success) throw new RouteResponseError("invalid_response");
  if (
    ["NO_RESULTS", "STARTNODES_NULL", "ENDNODES_NULL", "EQUAL_POINTS"].includes(
      envelope.data.status,
    )
  )
    throw new RouteResponseError("no_results");
  if (envelope.data.status === "INVALID_REQUEST")
    throw new RouteResponseError("invalid_request");
  if (envelope.data.status !== "OK" || !envelope.data.routes)
    throw new RouteResponseError("invalid_response");
  if (!envelope.data.routes.length) throw new RouteResponseError("no_results");
  const parsed = transitRoute.safeParse(envelope.data.routes[0]);
  if (!parsed.success) throw new RouteResponseError("invalid_response");
  const { properties: p, steps } = parsed.data;
  const walk = steps.filter((s) => s.properties.type === "WALKING");
  const f = p.fare;
  return {
    ...base,
    distanceMeters: p.totalDistance,
    durationSeconds: p.totalTime,
    transfers: p.transfers,
    walking: {
      distanceMeters: walk.reduce((sum, s) => sum + s.properties.distance, 0),
      durationSeconds: walk.reduce((sum, s) => sum + s.properties.time, 0),
    },
    steps: steps.map(({ properties: s }) => ({
      mode:
        s.type === "BUS" ? "bus" : s.type === "SUBWAY" ? "subway" : "walking",
      guidance: s.guidance,
      distanceMeters: s.distance,
      durationSeconds: s.time,
      stops: (s.stops ?? []).map((stop) => stop.name),
      vehicles: s.vehicles ?? [],
    })),
    fare:
      f && (f.value !== undefined || f.min !== undefined || f.max !== undefined)
        ? {
            currency: "KRW",
            value: f.value ?? null,
            min: f.min ?? null,
            max: f.max ?? null,
            kind: "transit",
          }
        : null,
  };
}
