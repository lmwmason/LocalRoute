export const euljiroExamplePath = "/examples/euljiro";
export type EuljiroPlaceKey =
  "wooraeok" | "hidemeplease-euljiro" | "tapgol-park";
export const euljiroExample = {
  id: "public-euljiro-example-v1",
  kind: "public_curated_example",
  cost: 0,
  date: null,
  timezone: "Asia/Seoul",
  checkedAt: "2026-10-17T05:15:37Z",
  // Public-source representative pins, not verified accessible entrances.
  stops: [
    {
      key: "wooraeok" as EuljiroPlaceKey,
      sourceId: "visitseoul:KOP003207",
      name: "우래옥",
      englishName: "Wooraeok",
      kind: "restaurant" as const,
      address: "서울 중구 창경궁로 62-29",
      lat: 37.5681902336,
      lng: 126.9987367702,
      start: "11:30",
      end: "12:30",
      purpose: "lunch" as const,
      openingHours: null,
      bookingAvailability: null,
      canonicalPlaceId: null,
      heyyumiPlaceId: null,
      sources: [
        {
          label: "Visit Seoul",
          url: "https://korean.visitseoul.net/citycenter/%EC%9A%B0%EB%9E%98%EC%98%A5-Wooraeok/KOP003207",
        },
      ],
    },
    {
      key: "hidemeplease-euljiro" as EuljiroPlaceKey,
      sourceId: "spacecloud:59739",
      name: "하이드미플리즈 을지로점",
      englishName: "Hide Me Please Euljiro",
      kind: "cafe" as const,
      address: "서울 중구 을지로11길 33 2층",
      lat: 37.5679039,
      lng: 126.99073307,
      start: "13:15",
      end: "14:15",
      purpose: "break" as const,
      openingHours: null,
      bookingAvailability: null,
      canonicalPlaceId: null,
      heyyumiPlaceId: null,
      sources: [
        { label: "HideMePlease", url: "https://hidemeplease.xyz/" },
        {
          label: "Spacecloud · venue listing",
          url: "https://www.spacecloud.kr/space/59739",
        },
      ],
    },
    {
      key: "tapgol-park" as EuljiroPlaceKey,
      sourceId: "visitseoul:KOP001577",
      name: "탑골공원",
      englishName: "Tapgol Park",
      kind: "attraction" as const,
      address: "서울 종로구 종로 99",
      lat: 37.571236,
      lng: 126.988331,
      start: "14:45",
      end: "15:30",
      purpose: "visit" as const,
      openingHours: null,
      bookingAvailability: null,
      canonicalPlaceId: null,
      heyyumiPlaceId: null,
      sources: [
        {
          label: "Visit Seoul",
          url: "https://korean.visitseoul.net/area/%ED%83%91%EA%B3%A8%EA%B3%B5%EC%9B%90/KOP001577",
        },
      ],
    },
  ],
} as const;
