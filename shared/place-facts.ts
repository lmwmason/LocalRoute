import { z } from "zod";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const hoursIntervalSchema = z
  .object({
    open: clock,
    close: clock,
    lastEntry: clock.optional(),
    lastOrder: clock.optional(),
  })
  .strict()
  .superRefine((interval, context) => {
    if (
      interval.open >= interval.close ||
      [interval.lastEntry, interval.lastOrder].some(
        (cutoff) =>
          cutoff && (cutoff < interval.open || cutoff > interval.close),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid opening interval or cutoff",
      });
    }
  });
const intervalsSchema = z
  .array(hoursIntervalSchema)
  .max(2)
  .superRefine((intervals, context) => {
    if (
      intervals.some(
        (interval, index) =>
          index > 0 && intervals[index - 1].close > interval.open,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Opening intervals overlap or are unordered",
      });
    }
  });
export const hoursFactSchema = z
  .object({
    timezone: z.literal("Asia/Seoul"),
    dates: z.record(z.iso.date(), intervalsSchema).refine((dates) => {
      const count = Object.keys(dates).length;
      return count > 0 && count <= 31;
    }, "Choose one to 31 explicit dates"),
  })
  .strict();
export type HoursInterval = z.infer<typeof hoursIntervalSchema>;
export type DateHours = z.infer<typeof hoursFactSchema>["dates"];
export type HoursProvenance = Record<
  string,
  {
    source: "contributor" | "owner" | "heyyumi";
    factId: string;
    observedAt: string;
  }
>;
export type PlaceExternalId = {
  provider: "heyyumi" | "kakao";
  externalId: string;
  possiblyClosed: boolean;
  observedAt: string | null;
};

const rawFactSchema = z.object({
  id: z.string().min(1).max(200),
  field: z.literal("hours"),
  source: z.enum(["contributor", "owner", "heyyumi"]),
  status: z.literal("approved"),
  observed_at: z.string(),
  value: z.unknown(),
});
const maxAge = 30 * 24 * 60 * 60 * 1000;
function decode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  // Owner corrections are stored as JSON strings. Never interpret prose hours.
  if (value.length > 20_000) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function claimedDates(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("dates" in value)
  )
    return [];
  const dates = value.dates;
  if (!dates || typeof dates !== "object" || Array.isArray(dates)) return [];
  return Object.keys(dates).filter(
    (date) => z.iso.date().safeParse(date).success,
  );
}

export function approvedPlaceHours(
  facts: unknown[],
  now = Date.now(),
): {
  hours?: DateHours;
  hoursProvenance?: HoursProvenance;
} {
  const hours: DateHours = {},
    provenance: HoursProvenance = {};
  const claims = new Map<string, { observed: number; value: string }>();
  const approved = facts
    .flatMap((fact) => {
      const parsed = rawFactSchema.safeParse(fact);
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => {
      // An invalid timestamp has unknown recency; fail closed rather than reviving history.
      const at = Date.parse(a.observed_at),
        bt = Date.parse(b.observed_at);
      return (
        (Number.isFinite(bt) ? bt : Infinity) -
          (Number.isFinite(at) ? at : Infinity) || a.id.localeCompare(b.id)
      );
    });
  for (const fact of approved) {
    const value = decode(fact.value),
      dates = claimedDates(value);
    // An uninterpretable newest correction could supersede any previous date.
    if (!dates.length) break;
    const parsed = hoursFactSchema.safeParse(value),
      observed = Date.parse(fact.observed_at);
    const fresh =
      Number.isFinite(observed) && observed <= now && now - observed <= maxAge;
    for (const date of dates) {
      const serialized = JSON.stringify(value),
        previous = claims.get(date);
      if (previous) {
        if (previous.observed === observed && previous.value !== serialized) {
          delete hours[date];
          delete provenance[date];
        }
        continue;
      }
      claims.set(date, { observed, value: serialized });
      // Claim the date before validation: invalid/stale latest data cannot expose older facts.
      if (!fresh || !parsed.success) continue;
      hours[date] = parsed.data.dates[date];
      provenance[date] = {
        source: fact.source,
        factId: fact.id,
        observedAt: fact.observed_at,
      };
    }
  }
  return Object.keys(hours).length
    ? { hours, hoursProvenance: provenance }
    : {};
}

const externalIdSchema = z.object({
  provider: z.enum(["heyyumi", "kakao"]),
  external_id: z
    .string()
    .min(1)
    .max(200)
    .refine((value) => value.trim() === value),
  possibly_closed: z.boolean(),
  observed_at: z.string().nullable(),
});
export function placeExternalIds(rows: unknown[]): PlaceExternalId[] {
  return rows.flatMap((row) => {
    const parsed = externalIdSchema.safeParse(row);
    if (!parsed.success) return [];
    return [
      {
        provider: parsed.data.provider,
        externalId: parsed.data.external_id,
        possiblyClosed: parsed.data.possibly_closed,
        observedAt: parsed.data.observed_at,
      },
    ];
  });
}
