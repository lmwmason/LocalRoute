import { AppError } from "../errors";
import {
  clock,
  minutes,
  tripDates,
  tripSchema,
  requiredMeals,
  isMealCandidate,
  distanceMeters,
  type Candidate,
  type Schedule,
  type TripInput,
} from "../../shared/planner";

type Purpose = Schedule["days"][number]["stops"][number]["purpose"];
export type BlueprintPin = {
  date: string;
  stop: Pick<
    Schedule["days"][number]["stops"][number],
    "candidateId" | "start" | "end" | "purpose"
  >;
};
export type FeasibleSlot = {
  date: string;
  start: string;
  end: string;
  purpose: Purpose;
  allowedCandidateIds: string[];
  unknownHoursCandidateIds: string[];
  pinned?: true;
};
export type FeasibleBlueprint = {
  slots: FeasibleSlot[];
  candidateIds: string[];
  durationBasis: "planned_visit_allocation";
  transferBasis: "user_buffer_not_travel_estimate";
};
type Choice = {
  candidate: Candidate;
  start: number;
  end: number;
  purpose: Purpose;
  pinned?: true;
};
const nonFood = (candidate: Candidate) =>
  ["attraction", "culture", "experience"].includes(candidate.kind);
const impossible = () => new AppError(422, "SCHEDULE_CONSTRAINTS_INFEASIBLE");
const mealBounds = (purpose: Purpose) =>
  purpose === "lunch"
    ? [660, 840]
    : purpose === "dinner"
      ? [1050, 1230]
      : [0, 1440];

function fits(
  candidate: Candidate,
  date: string,
  start: number,
  end: number,
  purpose: Purpose,
) {
  if (candidate.possiblyClosed) return false;
  const hours = candidate.hours?.[date];
  if (hours === undefined) return true; // Unknown is disclosed, never asserted open.
  return hours.some(
    (interval) =>
      start >= minutes(interval.open) &&
      end <= minutes(interval.close) &&
      (interval.lastEntry === undefined ||
        start <= minutes(interval.lastEntry)) &&
      (!["lunch", "dinner"].includes(purpose) ||
        interval.lastOrder === undefined ||
        start <= minutes(interval.lastOrder)),
  );
}

/** Deterministic feasibility before an AI call. Durations allocate user time;
 * they are neither observed visit durations nor invented transport estimates.
 * Singleton allowed IDs make each slot independently safe from same-day reuse.
 */
export function buildFeasibleBlueprint(
  input: TripInput,
  catalog: Candidate[],
  pins: BlueprintPin[] = [],
): FeasibleBlueprint {
  if (!tripSchema.safeParse(input).success) throw impossible();
  const dates = tripDates(input.startDate, input.endDate);
  const start = minutes(input.startTime),
    end = minutes(input.endTime);
  const byId = new Map<string, Candidate>();
  for (const candidate of catalog)
    if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
  if (pins.some((pin) => !dates.includes(pin.date))) throw impossible();
  const output: FeasibleSlot[] = [];
  const buffer = input.transferBufferMinutes;
  const distanceLimit =
    input.mobility === "walking"
      ? 1800
      : input.mobility === "wheelchair"
        ? 1000
        : input.mobility === "transit"
          ? 7000
          : 12000;
  function compatible(choice: Choice, selected: Choice[]) {
    if (
      selected.some(
        (other) =>
          other.candidate.id === choice.candidate.id ||
          !(
            choice.end + buffer <= other.start ||
            other.end + buffer <= choice.start
          ),
      )
    )
      return false;
    const ordered = [...selected, choice].sort((a, b) => a.start - b.start);
    return ordered.every(
      (stop, i) =>
        i === 0 ||
        distanceMeters(ordered[i - 1].candidate, stop.candidate) <=
          distanceLimit,
    );
  }
  for (const date of dates) {
    const available = [...byId.values()].filter(
      (candidate) =>
        !candidate.possiblyClosed && candidate.hours?.[date]?.length !== 0,
    );
    const selected: Choice[] = [];
    for (const pin of pins.filter((pin) => pin.date === date)) {
      const candidate = byId.get(pin.stop.candidateId);
      const from = minutes(pin.stop.start),
        to = minutes(pin.stop.end);
      const [open, close] = mealBounds(pin.stop.purpose);
      const meal = ["lunch", "dinner"].includes(pin.stop.purpose);
      if (
        !candidate ||
        !Number.isFinite(from) ||
        !Number.isFinite(to) ||
        from < start ||
        to > end ||
        to - from < (meal ? 45 : 20) ||
        to - from > 240 ||
        from < open ||
        to > close ||
        (meal && !isMealCandidate(candidate)) ||
        !fits(candidate, date, from, to, pin.stop.purpose)
      )
        throw impossible();
      const choice: Choice = {
        candidate,
        start: from,
        end: to,
        purpose: pin.stop.purpose,
        pinned: true,
      };
      if (!compatible(choice, selected)) throw impossible();
      selected.push(choice);
    }
    const meals = requiredMeals(input);
    const tasks: Purpose[] = [];
    for (const purpose of ["lunch", "dinner"] as const) {
      const count = selected.filter(
        (choice) => choice.purpose === purpose,
      ).length;
      if (count > 1) throw impossible();
      if (meals[purpose] && count === 0) tasks.push(purpose);
    }
    if (!selected.some((choice) => nonFood(choice.candidate)))
      tasks.push("visit");
    while (selected.length + tasks.length < 2) tasks.push("break");
    if (selected.length + tasks.length > 8) throw impossible();
    function options(purpose: Purpose): Choice[] {
      const meal = purpose === "lunch" || purpose === "dinner";
      const [mealStart, mealEnd] = mealBounds(purpose);
      const from = Math.max(start, mealStart),
        to = Math.min(end, mealEnd);
      const preferred =
        purpose === "lunch" ? 720 : purpose === "dinner" ? 1080 : start;
      const choices: Choice[] = [];
      for (const candidate of available.filter(
        meal ? isMealCandidate : purpose === "break" ? () => true : nonFood,
      )) {
        for (const duration of meal ? [45] : [60, 30, 20]) {
          const times = new Set<number>([from, to - duration]);
          for (
            let time = Math.ceil(from / 15) * 15;
            time + duration <= to;
            time += 15
          )
            times.add(time);
          for (const interval of candidate.hours?.[date] ?? []) {
            times.add(minutes(interval.open));
            times.add(minutes(interval.close) - duration);
          }
          for (const other of selected) {
            times.add(other.end + buffer);
            times.add(other.start - buffer - duration);
          }
          for (const time of times)
            if (
              time >= from &&
              time + duration <= to &&
              fits(candidate, date, time, time + duration, purpose)
            )
              choices.push({
                candidate,
                start: time,
                end: time + duration,
                purpose,
              });
        }
      }
      return choices.sort((a, b) => {
        const score = (choice: Choice) =>
          Math.abs(choice.start - preferred) +
          (60 - (choice.end - choice.start)) * 2 -
          input.activities.filter((tag) => choice.candidate.tags.includes(tag))
            .length *
            10000 -
          input.foodTypes.filter((tag) => choice.candidate.tags.includes(tag))
            .length *
            10000;
        return (
          score(a) - score(b) ||
          a.candidate.id.localeCompare(b.candidate.id) ||
          a.start - b.start
        );
      });
    }
    let attempts = 0;
    function place(index: number): boolean {
      if (index === tasks.length) return true;
      for (const choice of options(tasks[index])) {
        if (++attempts > 15000) return false;
        if (!compatible(choice, selected)) continue;
        selected.push(choice);
        if (place(index + 1)) return true;
        selected.pop();
      }
      return false;
    }
    if (!place(0)) throw impossible();
    const preferredCount =
      input.pace === "relaxed" ? 4 : input.pace === "balanced" ? 6 : 8;
    // Extra activities are optional; never force an impossible pace or sacrifice
    // existing pins/meals. The schema cap of eight remains hard.
    const hasBreak = (choices: Choice[]) =>
      choices.some((choice) => choice.purpose === "break") ||
      [...choices]
        .sort((a, b) => a.start - b.start)
        .some(
          (choice, i, ordered) =>
            choice.start - (i === 0 ? start : ordered[i - 1].end) >=
            buffer + 30,
        );
    while (selected.length < preferredCount) {
      const choice = options("visit").find(
        (choice) =>
          compatible(choice, selected) &&
          (end - start < 480 || hasBreak([...selected, choice])),
      );
      if (!choice) break;
      selected.push(choice);
    }
    if (end - start >= 480 && !hasBreak(selected)) throw impossible();
    for (const choice of selected.sort((a, b) => a.start - b.start))
      output.push({
        date,
        start: clock(choice.start),
        end: clock(choice.end),
        purpose: choice.purpose,
        allowedCandidateIds: [choice.candidate.id],
        unknownHoursCandidateIds:
          choice.candidate.hours?.[date] === undefined
            ? [choice.candidate.id]
            : [],
        ...(choice.pinned ? { pinned: true as const } : {}),
      });
  }
  return {
    slots: output,
    candidateIds: [
      ...new Set(output.flatMap((slot) => slot.allowedCandidateIds)),
    ],
    durationBasis: "planned_visit_allocation",
    transferBasis: "user_buffer_not_travel_estimate",
  };
}
