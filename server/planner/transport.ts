import {
  minutes,
  type Candidate,
  type QualityIssue,
  type Schedule,
  type TripInput,
} from "../../shared/planner";
import {
  validateTransportGap,
  type TransportLegResult,
  type TransportRequest,
} from "../../shared/transport";
export type ScheduledTransport = {
  date: string;
  fromId: string;
  toId: string;
  leg: TransportLegResult;
};
export async function assessTransport(
  schedule: Schedule,
  input: TripInput,
  catalog: Candidate[],
  lookup: (request: TransportRequest) => Promise<TransportLegResult>,
) {
  const transport: ScheduledTransport[] = [],
    errors: QualityIssue[] = [],
    warnings: QualityIssue[] = [];
  const places = new Map(catalog.map((place) => [place.id, place]));
  // Maximum 35 adjacent legs: five days, eight stops/day. No user identity or dietary text leaves here.
  for (const day of schedule.days) {
    const legs = await Promise.all(
      day.stops.slice(1).map(async (stop, index) => {
        const previous = day.stops[index],
          origin = places.get(previous.candidateId),
          destination = places.get(stop.candidateId);
        if (!origin || !destination) return;
        const leg = await lookup({
          origin: { lat: origin.lat, lng: origin.lng },
          destination: { lat: destination.lat, lng: destination.lng },
          mode: input.mobility,
        });
        const same =
          leg.request.mode === input.mobility &&
          leg.request.origin.lat === origin.lat &&
          leg.request.origin.lng === origin.lng &&
          leg.request.destination.lat === destination.lat &&
          leg.request.destination.lng === destination.lng;
        const age = Date.now() - Date.parse(leg.source.checkedAt);
        if (!same || !Number.isFinite(age) || age < -60000 || age > 300000) {
          errors.push({
            code: "ROUTE_EVIDENCE_INVALID",
            day: day.date,
            candidateId: stop.candidateId,
          });
          return;
        }
        const check = validateTransportGap(
          leg,
          (minutes(stop.start) - minutes(previous.end)) * 60,
          input.transferBufferMinutes * 60,
        );
        if (["exceeds_gap", "invalid_gap"].includes(check.status))
          errors.push({
            code: "ROUTE_TIME_CONFLICT",
            day: day.date,
            candidateId: stop.candidateId,
          });
        if (check.status === "unverified")
          warnings.push({
            code: "ROUTE_UNVERIFIED",
            day: day.date,
            candidateId: stop.candidateId,
          });
        return { date: day.date, fromId: origin.id, toId: destination.id, leg };
      }),
    );
    transport.push(
      ...legs.filter((leg): leg is ScheduledTransport => Boolean(leg)),
    );
  }
  return { transport, errors, warnings };
}
