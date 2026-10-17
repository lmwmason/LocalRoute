import { z } from "zod";

export const kakaoAddressEndpoint =
  "https://dapi.kakao.com/v2/local/search/address.json";
export const destinationQuerySchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .refine((value) =>
    Array.from(value).every(
      (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
    ),
  );
export const destinationPageSchema = z.number().int().min(1).max(45);
const name = z.string().trim().min(1).max(100);
export const destinationSchema = z
  .object({
    // LocalRoute selection key, NOT a Kakao place ID or an administrative code.
    id: z.string().min(1).max(1000),
    label: name,
    country: z.literal("KR"),
    level: z.enum(["city", "county", "district", "town", "township"]),
    region1: name,
    region2: z.string().max(100),
    region3: z.string().max(100),
    lat: z.number().finite().min(32).max(39),
    lng: z.number().finite().min(124).max(132),
    source: z
      .object({
        provider: z.literal("kakao"),
        endpoint: z.literal(kakaoAddressEndpoint),
        addressType: z.literal("REGION"),
        observedAt: z.iso.datetime(),
        verification: z.literal("provider"),
        coordinateMeaning: z.literal("region_representative"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const label = [value.region1, value.region2, value.region3]
      .filter(Boolean)
      .join(" ");
    const leaf = value.region3 || value.region2 || value.region1;
    const suffix = {
      city: "시",
      county: "군",
      district: "구",
      town: "읍",
      township: "면",
    }[value.level];
    // Metropolitan-city abbreviations returned by Kakao are also valid city names.
    const metro = /^(서울|부산|대구|인천|광주|대전|울산|세종)$/;
    if (
      label !== value.label ||
      value.id !== destinationId(label) ||
      !(
        leaf.endsWith(suffix) ||
        (value.level === "city" && !value.region2 && metro.test(leaf))
      ) ||
      (value.region3 &&
        (!value.region2 || !/^[가-힣]+[읍면]$/.test(value.region3)))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent destination identity",
      });
    }
  });
export type Destination = z.infer<typeof destinationSchema>;
export function destinationId(label: string) {
  return `kakao:region:${encodeURIComponent(label)}`;
}
export const destinationSearchResponseSchema = z
  .object({
    destinations: z.array(destinationSchema).max(30),
    page: destinationPageSchema,
    hasMore: z.boolean(),
  })
  .strict();
export type DestinationSearchResponse = z.infer<
  typeof destinationSearchResponseSchema
>;
export type DestinationSearch = (
  query: string,
  page: number,
  signal: AbortSignal,
) => Promise<DestinationSearchResponse>;

export const destinationErrorCodes = [
  "DESTINATIONS_DISABLED",
  "DESTINATIONS_KEY_MISSING",
  "DESTINATIONS_INVALID_QUERY",
  "DESTINATIONS_UNAUTHORIZED",
  "DESTINATIONS_RATE_LIMITED",
  "DESTINATIONS_TIMEOUT",
  "DESTINATIONS_UNAVAILABLE",
  "DESTINATIONS_INVALID_RESPONSE",
  "DESTINATION_SELECTION_INVALID",
] as const;
export type DestinationErrorCode = (typeof destinationErrorCodes)[number];
