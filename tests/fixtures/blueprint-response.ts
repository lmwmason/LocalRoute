import type { Schedule } from "../../shared/planner";
import type { FeasibleBlueprint } from "../../server/planner/feasibility";

/** Model fixture follows the supplied authoritative slots; prose remains test data. */
export function blueprintResponse(template: Schedule, data: unknown): Schedule {
  const blueprint = (data as { feasibleBlueprint: FeasibleBlueprint })
    .feasibleBlueprint;
  return {
    title: template.title,
    summary: template.summary,
    days: [...new Set(blueprint.slots.map((slot) => slot.date))].map(
      (date) => ({
        date,
        stops: blueprint.slots
          .filter((slot) => slot.date === date)
          .map((slot) => ({
            candidateId: slot.allowedCandidateIds[0],
            start: slot.start,
            end: slot.end,
            purpose: slot.purpose,
            explanation:
              template.days
                .flatMap((day) => day.stops)
                .find(
                  (stop) => stop.candidateId === slot.allowedCandidateIds[0],
                )?.explanation ||
              "A fixture explanation for this grounded candidate and planned visit.",
          })),
      }),
    ),
  };
}
