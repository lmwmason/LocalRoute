import { z } from "zod";
import { destinationSchema, type Destination } from "./destinations";
import type { HoursProvenance, PlaceExternalId } from "./place-facts";

export const regions = {
  seongsu: {
    ko: "서울 성수",
    en: "Seongsu, Seoul",
    lat: 37.5455,
    lng: 127.053,
  },
  jongno: { ko: "서울 종로", en: "Jongno, Seoul", lat: 37.5728, lng: 126.9816 },
  haeundae: {
    ko: "부산 해운대",
    en: "Haeundae, Busan",
    lat: 35.1631,
    lng: 129.1635,
  },
} as const;
export function regionForDestination(
  destination: keyof typeof regions | Destination,
) {
  return typeof destination === "string"
    ? regions[destination]
    : {
        lat: destination.lat,
        lng: destination.lng,
        ko: destination.label,
        en: destination.label,
      };
}
export const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export function minutes(clock: string) {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
}
export function clock(value: number) {
  return `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}
export function tripDates(start: string, end: string) {
  const dates: string[] = [];
  for (
    let value = new Date(`${start}T00:00:00Z`),
      last = new Date(`${end}T00:00:00Z`);
    value <= last && dates.length < 6;
    value.setUTCDate(value.getUTCDate() + 1)
  )
    dates.push(value.toISOString().slice(0, 10));
  return dates;
}
export const tripSchema = z
  .object({
    destination: z.union([
      z.enum(["seongsu", "jongno", "haeundae"]),
      destinationSchema,
    ]),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    startTime: clockSchema,
    endTime: clockSchema,
    purpose: z.enum(["relax", "culture", "food", "explore"]),
    activities: z
      .array(
        z.enum([
          "food",
          "art",
          "nature",
          "shopping",
          "history",
          "coffee",
          "hotspots",
        ]),
      )
      .max(7)
      .refine((values) => new Set(values).size === values.length),
    foodTypes: z
      .array(z.enum(["korean", "japanese", "western", "cafe"]))
      .max(4),
    budget: z.enum(["value", "moderate", "flexible"]),
    companions: z.enum(["solo", "couple", "friends", "family"]),
    mobility: z.enum(["walking", "transit", "car", "wheelchair"]),
    pace: z.enum(["relaxed", "balanced", "active"]),
    dietary: z.string().trim().max(500),
    allowUnverifiedDietary: z.boolean(),
    transferBufferMinutes: z.number().int().min(10).max(90),
    language: z.enum(["ko", "en"]),
  })
  .superRefine((v, ctx) => {
    const dates = tripDates(v.startDate, v.endDate);
    if (!dates.length || dates.length > 5)
      ctx.addIssue({
        code: "custom",
        message: "Choose one to five days.",
        path: ["endDate"],
      });
    if (
      minutes(v.endTime) - minutes(v.startTime) < 180 ||
      minutes(v.endTime) - minutes(v.startTime) > 960
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose a daily window of 3–16 hours.",
        path: ["endTime"],
      });
  });
export type TripInput = z.infer<typeof tripSchema>;
export type Candidate = {
  displayMedia?: import("./display-media").DisplayMedia;
  sourcePhoto?: import("./source-photos").SourcePhoto;
  starterRecommendation?: true;
  officialSources?: { url: string; observedAt: string }[];
  photo?: {
    id: string;
    width: number;
    height: number;
    source: "contributor";
    review: "approved";
  };
  id: string;
  name: string;
  kind: "restaurant" | "cafe" | "attraction" | "culture" | "experience";
  address: string;
  lat: number;
  lng: number;
  tags: string[];
  source: {
    provider: "localroute" | "kakao" | "demo";
    externalId?: string;
    url?: string;
    observedAt: string;
    verification: "canonical" | "provider" | "demo";
  };
  endorsements: { versionId: string; text: string }[];
  hours?: Record<
    string,
    { open: string; close: string; lastEntry?: string; lastOrder?: string }[]
  >;
  dietaryVerified?: string[];
  hoursProvenance?: HoursProvenance;
  externalIds?: PlaceExternalId[];
  possiblyClosed?: boolean;
  accessibilityVerified?: boolean;
};
export const scheduleSchema = z.object({
  title: z.string().min(3).max(120),
  summary: z.string().min(10).max(1200),
  days: z
    .array(
      z.object({
        date: z.iso.date(),
        stops: z
          .array(
            z.object({
              candidateId: z.string().min(1).max(250),
              start: clockSchema,
              end: clockSchema,
              purpose: z.enum(["visit", "lunch", "dinner", "break"]),
              explanation: z.string().min(10).max(700),
            }),
          )
          .min(2)
          .max(8),
      }),
    )
    .min(1)
    .max(5),
});
export type Schedule = z.infer<typeof scheduleSchema>;
export type QualityIssue = { code: string; day?: string; candidateId?: string };
export type Evaluation = {
  valid: boolean;
  errors: QualityIssue[];
  warnings: QualityIssue[];
  checks: {
    stopCount: number;
    localMeals: number;
    preferenceMatches: number;
    verifiedHours: number;
  };
};
export type Itinerary = {
  id: string;
  revision: number;
  input: TripInput;
  schedule: Schedule;
  catalog: Candidate[];
  evaluation: Evaluation;
  createdAt: string;
  model: string;
  provenance: "gemini" | "demo" | "operator_example";
  cost: number;
  transport?: {
    date: string;
    fromId: string;
    toId: string;
    leg: import("./transport").TransportLegResult;
  }[];
};
export function distanceMeters(
  a: Pick<Candidate, "lat" | "lng">,
  b: Pick<Candidate, "lat" | "lng">,
) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const dlat = rad(b.lat - a.lat),
    dlng = rad(b.lng - a.lng);
  const x =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlng / 2) ** 2;
  return Math.round(
    6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x))),
  );
}
function mealWindowOverlap(input: Pick<TripInput, "startTime" | "endTime">) {
  const start = minutes(input.startTime),
    end = minutes(input.endTime);
  const overlap = (open: number, close: number) =>
    Math.max(0, Math.min(end, close) - Math.max(start, open));
  return { lunch: overlap(660, 840), dinner: overlap(1050, 1230) };
}
export function requiredMeals(input: Pick<TripInput, "startTime" | "endTime">) {
  const overlap = mealWindowOverlap(input);
  // A 90-minute overlap leaves 45 minutes for the meal and 45 for flexibility.
  return { lunch: overlap.lunch >= 90, dinner: overlap.dinner >= 90 };
}
function matchesActivity(
  candidate: Candidate,
  activities: TripInput["activities"],
) {
  return activities.some((activity) =>
    activity === "food"
      ? candidate.kind === "restaurant"
      : candidate.tags.includes(activity),
  );
}
function matchesFood(candidate: Candidate, foodTypes: TripInput["foodTypes"]) {
  return (
    candidate.kind === "restaurant" &&
    foodTypes.some((type) => candidate.tags.includes(type))
  );
}
export function isMealCandidate(candidate: Candidate) {
  return (
    candidate.kind === "restaurant" &&
    (candidate.endorsements.length > 0 ||
      (candidate.starterRecommendation === true &&
        candidate.source.provider === "localroute" &&
        candidate.source.verification === "canonical"))
  );
}
export function evaluateSchedule(
  schedule: Schedule,
  input: TripInput,
  catalog: Candidate[],
): Evaluation {
  const format = scheduleSchema.safeParse(schedule),
    inputFormat = tripSchema.safeParse(input);
  if (!format.success || !inputFormat.success)
    return {
      valid: false,
      errors: [{ code: "INVALID_FORMAT" }],
      warnings: [],
      checks: {
        stopCount: 0,
        localMeals: 0,
        preferenceMatches: 0,
        verifiedHours: 0,
      },
    };
  const errors: QualityIssue[] = [],
    warnings: QualityIssue[] = [],
    byId = new Map(catalog.map((c) => [c.id, c])),
    seen = new Set<string>();
  const dates = tripDates(input.startDate, input.endDate);
  const meals = requiredMeals(input);
  let activityMatched = false,
    foodMatched = false;
  const checks = {
    stopCount: 0,
    localMeals: 0,
    preferenceMatches: 0,
    verifiedHours: 0,
  };
  if (
    schedule.days.length !== dates.length ||
    new Set(schedule.days.map((d) => d.date)).size !== dates.length
  )
    errors.push({ code: "DATE_COVERAGE" });
  for (const day of schedule.days) {
    const seenToday = new Set<string>();
    if (!dates.includes(day.date))
      errors.push({ code: "UNKNOWN_DATE", day: day.date });
    let previousEnd = minutes(input.startTime),
      previous: Candidate | undefined;
    let lunch = 0,
      dinner = 0,
      rest = false;
    const maxStops =
      input.pace === "relaxed" ? 4 : input.pace === "balanced" ? 6 : 8;
    if (day.stops.length > maxStops)
      warnings.push({ code: "PACE_OVERLOAD", day: day.date });
    for (const stop of day.stops) {
      checks.stopCount++;
      const c = byId.get(stop.candidateId);
      const issue = { day: day.date, candidateId: stop.candidateId };
      if (!c) {
        errors.push({ code: "UNKNOWN_PLACE", ...issue });
        continue;
      }
      if (seenToday.has(c.id))
        errors.push({ code: "DUPLICATE_STOP", ...issue });
      else if (seen.has(c.id))
        warnings.push({ code: "CROSS_DAY_REVISIT", ...issue });
      seenToday.add(c.id);
      seen.add(c.id);
      const start = minutes(stop.start),
        end = minutes(stop.end),
        duration = end - start,
        gap = start - previousEnd;
      if (
        start < minutes(input.startTime) ||
        end > minutes(input.endTime) ||
        duration < 20 ||
        duration > 240
      )
        errors.push({ code: "TIME_BOUNDS", ...issue });
      if (gap < (previous ? input.transferBufferMinutes : 0))
        errors.push({ code: "TIME_CONFLICT", ...issue });
      if (previous) {
        const distance = distanceMeters(previous, c),
          limit =
            input.mobility === "walking"
              ? 1800
              : input.mobility === "wheelchair"
                ? 1000
                : input.mobility === "transit"
                  ? 7000
                  : 12000;
        if (distance > limit)
          errors.push({ code: "UNREALISTIC_ROUTE", ...issue });
        const speed =
          input.mobility === "walking"
            ? 6000
            : input.mobility === "wheelchair"
              ? 5000
              : input.mobility === "transit"
                ? 60000
                : 100000;
        if ((distance / speed) * 60 > gap)
          errors.push({ code: "INSUFFICIENT_TRANSFER_BUFFER", ...issue });
        warnings.push({ code: "ROUTE_TIME_UNAVAILABLE", ...issue });
      }
      if (c.possiblyClosed)
        errors.push({ code: "STATUS_NEEDS_VERIFICATION", ...issue });
      if (c.starterRecommendation === true)
        warnings.push({ code: "STARTER_RECOMMENDATION", ...issue });
      const hours = c.hours?.[day.date];
      if (hours) {
        checks.verifiedHours++;
        if (
          !hours.some(
            (h) =>
              start >= minutes(h.open) &&
              end <= minutes(h.close) &&
              (!h.lastEntry || start <= minutes(h.lastEntry)) &&
              (!(stop.purpose === "lunch" || stop.purpose === "dinner") ||
                !h.lastOrder ||
                start <= minutes(h.lastOrder)),
          )
        )
          errors.push({ code: "CLOSED_VENUE", ...issue });
      } else warnings.push({ code: "HOURS_UNKNOWN", ...issue });
      if (input.mobility === "wheelchair" && !c.accessibilityVerified)
        warnings.push({ code: "ACCESSIBILITY_UNKNOWN", ...issue });
      if (stop.purpose === "lunch" || stop.purpose === "dinner") {
        if (!isMealCandidate(c))
          errors.push({ code: "LOCAL_MEAL_REQUIRED", ...issue });
        else if (c.endorsements.length) checks.localMeals++;
        if (stop.purpose === "lunch") {
          lunch++;
          if (start < 660 || start > 840 || duration < 45)
            errors.push({ code: "MEAL_WINDOW", ...issue });
        } else {
          dinner++;
          if (start < 1050 || start > 1230 || duration < 45)
            errors.push({ code: "MEAL_WINDOW", ...issue });
        }
        if (
          input.dietary &&
          !c.dietaryVerified?.includes(input.dietary.toLowerCase().trim())
        ) {
          if (!input.allowUnverifiedDietary)
            errors.push({ code: "DIETARY_UNVERIFIED", ...issue });
          else warnings.push({ code: "DIETARY_UNVERIFIED", ...issue });
        }
      }
      if (stop.purpose === "break" || gap >= input.transferBufferMinutes + 30)
        rest = true;
      const activityMatch = matchesActivity(c, input.activities);
      const foodMatch =
        (stop.purpose === "lunch" || stop.purpose === "dinner") &&
        matchesFood(c, input.foodTypes);
      activityMatched ||= activityMatch;
      foodMatched ||= foodMatch;
      if (activityMatch || foodMatch) checks.preferenceMatches++;
      previous = c;
      previousEnd = end;
    }
    const windowStart = minutes(input.startTime),
      windowEnd = minutes(input.endTime);
    if (meals.lunch && lunch !== 1)
      errors.push({ code: "LUNCH_COVERAGE", day: day.date });
    if (meals.dinner && dinner !== 1)
      errors.push({ code: "DINNER_COVERAGE", day: day.date });
    if (lunch > 1 || dinner > 1)
      errors.push({ code: "DUPLICATE_MEAL", day: day.date });
    if (windowEnd - windowStart >= 480 && !rest)
      errors.push({ code: "BREAK_REQUIRED", day: day.date });
    if (
      !day.stops.some((s) => {
        const c = byId.get(s.candidateId);
        return c && ["attraction", "culture", "experience"].includes(c.kind);
      })
    )
      errors.push({ code: "ACTIVITY_REQUIRED", day: day.date });
  }
  if (input.activities.length && !activityMatched) {
    if (
      catalog.some((candidate) => matchesActivity(candidate, input.activities))
    )
      errors.push({ code: "ACTIVITY_PREFERENCES_NOT_MATCHED" });
    else warnings.push({ code: "ACTIVITY_PREFERENCE_UNAVAILABLE" });
  }
  if (input.foodTypes.length && !foodMatched) {
    const mealPossible = Object.values(mealWindowOverlap(input)).some(
      (overlap) => overlap >= 45,
    );
    if (
      mealPossible &&
      catalog.some((candidate) => matchesFood(candidate, input.foodTypes))
    )
      errors.push({ code: "FOOD_PREFERENCES_NOT_MATCHED" });
    else warnings.push({ code: "FOOD_PREFERENCE_UNAVAILABLE" });
  }
  if (input.budget === "value") warnings.push({ code: "PRICES_UNVERIFIED" });
  return { valid: errors.length === 0, errors, warnings, checks };
}
export function stopTimestamp(date: string, time: string) {
  return `${date}T${time}:00+09:00`;
}
