import { z } from "zod";

export const transportPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const transportRequestSchema = z.object({
  origin: transportPointSchema,
  destination: transportPointSchema,
  mode: z.enum(["car", "transit", "walking", "wheelchair"]),
});
export type TransportRequest = z.infer<typeof transportRequestSchema>;
export type TransportMode = TransportRequest["mode"];
export type TransportPoint = z.infer<typeof transportPointSchema>;
export type TransportReason =
  | "disabled"
  | "unsupported_mode"
  | "invalid_request"
  | "unauthorized"
  | "rate_limited"
  | "budget_exceeded"
  | "provider_unavailable"
  | "timeout"
  | "no_results"
  | "invalid_response";
export type TransportStep = {
  mode: "car" | "bus" | "subway" | "walking";
  guidance: string;
  distanceMeters: number;
  durationSeconds: number;
  stops: string[];
  vehicles: { name: string; type: string }[];
};
export type TransportSource = {
  provider: "kakao_mobility" | "kakao_maps" | "none";
  documentationUrl: string | null;
  /** Time of completed lookup (or local refusal), never a promised departure time. */
  checkedAt: string;
  requestedAt: string;
  attempted: boolean;
};
type TransportBase = {
  request: TransportRequest;
  source: TransportSource;
  /** These adapters query current routes, not a future trip's traffic/timetable. */
  timeBasis: "lookup_time";
  arrivalGuaranteed: false;
  accessibility: "unverified";
};
export type TransportLegResult = TransportBase &
  (
    | {
        status: "estimated";
        distanceMeters: number;
        durationSeconds: number;
        transfers: number | null;
        walking: { distanceMeters: number; durationSeconds: number } | null;
        steps: TransportStep[];
        fare: {
          currency: "KRW";
          value: number | null;
          min: number | null;
          max: number | null;
          kind: "transit" | "toll";
        } | null;
      }
    | {
        status: "unverified";
        reason: TransportReason;
        retryAfterSeconds?: number;
        distanceMeters: null;
        durationSeconds: null;
        transfers: null;
        walking: null;
        steps: [];
        fare: null;
      }
  );
export type TransportGapValidation = {
  status: "fits_estimate" | "exceeds_gap" | "unverified" | "invalid_gap";
  requiredSeconds: number | null;
  availableSeconds: number;
  excessSeconds: number | null;
  arrivalGuaranteed: false;
};

/** Compare a provider route with the gap AFTER the previous visit ends.
 * Caller chooses any additional buffer and must match route endpoints/mode,
 * check freshness and re-query after edits. Unknown is never a passing check.
 */
export function validateTransportGap(
  leg: TransportLegResult,
  availableSeconds: number,
  bufferSeconds = 0,
): TransportGapValidation {
  const base = { availableSeconds, arrivalGuaranteed: false as const };
  if (
    !Number.isFinite(availableSeconds) ||
    availableSeconds < 0 ||
    !Number.isFinite(bufferSeconds) ||
    bufferSeconds < 0
  )
    return {
      ...base,
      status: "invalid_gap",
      requiredSeconds: null,
      excessSeconds: null,
    };
  if (
    leg.status !== "estimated" ||
    !Number.isFinite(leg.durationSeconds) ||
    leg.durationSeconds < 0
  )
    return {
      ...base,
      status: "unverified",
      requiredSeconds: null,
      excessSeconds: null,
    };
  const requiredSeconds = leg.durationSeconds + bufferSeconds;
  if (!Number.isFinite(requiredSeconds))
    return {
      ...base,
      status: "invalid_gap",
      requiredSeconds: null,
      excessSeconds: null,
    };
  return {
    ...base,
    status:
      requiredSeconds > availableSeconds ? "exceeds_gap" : "fits_estimate",
    requiredSeconds,
    excessSeconds: Math.max(0, requiredSeconds - availableSeconds),
  };
}
