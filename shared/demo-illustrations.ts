/** A bounded presentation-only exception for the founder-approved demo catalog.
 * These assets are not venue photos, menu evidence, or contribution uploads.
 * Keep full provenance/prompt research in the manifest, outside the client bundle.
 */
export type DemoIllustration = Readonly<{
  name: string;
  url: string;
  asset:
    | "/restaurant-illustrations/korean-table-ai.png"
    | "/example-images/lunch-ai.png"
    | "/example-images/coffee-ai.png";
  assetType: "ai_generated_generic_illustration";
  label: Readonly<{ ko: string; en: string }>;
}>;

export type IllustrationPlace = {
  kind?: string;
  photo?: unknown;
  sourcePhoto?: unknown;
  officialSources?: readonly { url: string }[];
  source?: string | { url?: string };
};

const approvedDemoRestaurants = [
  [
    "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=48a0552a-2b19-4373-8793-0f119c3ff86a",
    "대성갈비",
  ],
  [
    "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=bc0fe900-cf60-4ff5-8acc-418025c625ea",
    "성수족발",
  ],
  [
    "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=5b34b854-c575-44d5-8df3-ec8676274390",
    "성수부두",
  ],
  [
    "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=9d34d695-3e4a-4555-885a-c328c9baa851",
    "메밀마당 충주 중앙탑본점",
  ],
  [
    "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=ff7fb6b9-f8e4-47b1-9f6b-f1d92c838e82",
    "운정식당",
  ],
  ["https://place.map.kakao.com/11891870", "대장군"],
  ["https://place.map.kakao.com/12800097", "상록수식당"],
  [
    "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=3a074b6f-56e3-4bf3-a504-ac65b9230f1f",
    "영화식당",
  ],
  [
    "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=bc4ad83e-e9a2-4b56-b1e8-d9b03feaabbe",
    "숲속장수촌",
  ],
  ["https://place.map.kakao.com/61123582", "메밀면묵밥리 앙성온천점"],
  [
    "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=c7199f1f-e721-4d2e-a84c-e040efe0471b",
    "복서울해장국",
  ],
] as const;

const approvedExamplePlaces = [
  {
    url: "https://korean.visitseoul.net/citycenter/%EC%9A%B0%EB%9E%98%EC%98%A5-Wooraeok/KOP003207",
    name: "우래옥",
    kind: "restaurant",
    asset: "/example-images/lunch-ai.png",
  },
  {
    url: "https://www.spacecloud.kr/space/59739",
    name: "하이드미플리즈 을지로",
    kind: "cafe",
    asset: "/example-images/coffee-ai.png",
  },
] as const;

const illustrations = new Map<
  string,
  { kind: "restaurant" | "cafe"; illustration: DemoIllustration }
>(
  [
    ...approvedDemoRestaurants.map(([url, name]) => ({
      url,
      name,
      kind: "restaurant" as const,
      asset: "/restaurant-illustrations/korean-table-ai.png" as const,
    })),
    ...approvedExamplePlaces,
  ].map(({ url, name, kind, asset }) => [
    url,
    {
      kind,
      illustration: Object.freeze({
        name,
        url,
        asset,
        assetType: "ai_generated_generic_illustration" as const,
        label: Object.freeze({
          ko: "AI 일러스트 · 실제 매장 사진 아님",
          en: "AI illustration · Not a venue photo",
        }),
      }),
    },
  ]),
);

/** Match exact approved source identity; names and approximate URLs never match.
 * A photo that exists but fails loading must remain unavailable instead of
 * silently switching to an illustration. Private uploads never use this fallback.
 */
export function placeIllustration(
  place: IllustrationPlace,
  options: { privatePreview?: boolean } = {},
): DemoIllustration | undefined {
  if (
    options.privatePreview ||
    place.photo ||
    place.sourcePhoto ||
    (place.kind !== undefined &&
      place.kind !== "restaurant" &&
      place.kind !== "cafe")
  )
    return undefined;
  const urls = (place.officialSources ?? []).map((source) => source.url);
  if (typeof place.source === "object" && place.source.url)
    urls.push(place.source.url);
  for (const url of urls) {
    const match = illustrations.get(url);
    if (match && (place.kind === undefined || place.kind === match.kind))
      return match.illustration;
  }
  return undefined;
}
