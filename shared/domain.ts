import { z } from "zod";

export type Endorsement = {
  id: string;
  author: string;
  text: string;
  helpfulCount: number;
};
export type Place = {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  tags: string[];
  endorsements: Endorsement[];
  source: "demo" | "localroute" | "heyyumi";
  rating: number | null;
  reviewCount: number;
  possiblyClosed?: boolean;
  observedAt?: string | null;
  confidence?: number | null;
  candidateToken?: string;
};
export const manualPlaceSchema = z.object({
  name: z.string().trim().min(1, "가게 이름을 입력해 주세요.").max(100),
  address: z.string().trim().min(5, "정확한 주소를 입력해 주세요.").max(250),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const contributionSchema = z
  .object({
    requestId: z.uuid(),
    placeId: z.uuid().optional(),
    manualPlace: manualPlaceSchema.optional(),
    candidateToken: z.string().min(20).max(6000).optional(),
    text: z
      .string()
      .trim()
      .min(5, "직접 경험한 추천 이유를 5자 이상 적어 주세요.")
      .max(200),
    confirmed: z.literal(true, { error: "장소와 추천 내용을 확인해 주세요." }),
  })
  .refine(
    (v) =>
      [v.placeId, v.manualPlace, v.candidateToken].filter(Boolean).length === 1,
    { message: "장소를 하나 선택해 주세요." },
  );
export type Contribution = z.infer<typeof contributionSchema>;
export function parseCoordinate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}
export function filterPlaces(places: Place[], query: string, category: string) {
  const needle = query.trim().toLocaleLowerCase();
  return places.filter(
    (p) =>
      (category === "전체" ||
        p.category === category ||
        p.tags.includes(category)) &&
      `${p.name} ${p.address} ${p.category} ${p.tags.join(" ")}`
        .toLocaleLowerCase()
        .includes(needle),
  );
}
export function moveStop(ids: string[], index: number, direction: -1 | 1) {
  const next = index + direction;
  if (index < 0 || index >= ids.length || next < 0 || next >= ids.length)
    return ids;
  const copy = [...ids];
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return copy;
}
