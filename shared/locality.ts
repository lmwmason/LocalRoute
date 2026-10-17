import { z } from "zod";
import type { Place } from "./domain";
const label = z
  .string()
  .trim()
  .max(80)
  .refine((v) => [...v].every((char) => char.charCodeAt(0) >= 32));
export const localitySchema = z
  .object({
    homeCity: label.min(2),
    homeArea: label.default(""),
    localityScope: z.enum(["auto", "city", "area"]).default("auto"),
  })
  .refine((v) => v.localityScope !== "area" || v.homeArea.length >= 1, {
    message: "profile.areaRequired",
    path: ["homeArea"],
  });
export type Locality = z.infer<typeof localitySchema>;
const metros = new Set([
  "서울",
  "서울시",
  "서울특별시",
  "부산",
  "부산시",
  "부산광역시",
  "인천",
  "인천시",
  "인천광역시",
  "대구",
  "대구시",
  "대구광역시",
  "대전",
  "대전시",
  "대전광역시",
  "광주",
  "광주시",
  "광주광역시",
  "울산",
  "울산시",
  "울산광역시",
]);
export function suggestedScope(locality: Locality): "city" | "area" {
  if (locality.localityScope !== "auto") return locality.localityScope;
  // Administrative scale only; this is not an assertion about restaurant density.
  return metros.has(locality.homeCity) && /구$/.test(locality.homeArea)
    ? "area"
    : "city";
}
export function localityLabel(
  locality: Locality,
  scope = suggestedScope(locality),
) {
  return [locality.homeCity, scope === "area" ? locality.homeArea : ""]
    .filter(Boolean)
    .join(" ");
}
export function resolveLocalityCoverage(
  locality: Locality,
  counts: { area: number; city: number },
  minimumNeeded: number,
) {
  const initial = suggestedScope(locality);
  const widened =
    locality.localityScope === "auto" &&
    initial === "area" &&
    counts.area < minimumNeeded;
  const scope = widened ? "city" : initial;
  return {
    scope,
    label: localityLabel(locality, scope),
    widened,
    available: scope === "area" ? counts.area : counts.city,
    coverageSource: "localroute_published_places" as const,
  };
}
export function localityRestaurantCounts(locality: Locality, places: Place[]) {
  const normalize = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase()
      .replace(/(?:특별시|광역시|시)$/, "");
  const city = normalize(locality.homeCity),
    area = locality.homeArea.trim().toLocaleLowerCase();
  const inCity = places.filter(
    (p) =>
      p.source !== "demo" &&
      (p.kind === "restaurant" || (!p.kind && p.category !== "카페")) &&
      p.address
        .toLocaleLowerCase()
        .split(/\s+/)
        .some((part) => normalize(part) === city),
  );
  return {
    city: inCity.length,
    area: area
      ? inCity.filter((p) =>
          p.address.toLocaleLowerCase().split(/\s+/).includes(area),
        ).length
      : 0,
  };
}
