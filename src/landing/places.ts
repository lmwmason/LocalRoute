// Factual names/source links from scripts/data/verified-places.json (2026-10-17).
// No imported ratings, recommendations, provider imagery, or assumed open hours.
export const landingPlaces = [
  {
    name: "서울숲",
    en: "Seoul Forest",
    kind: ["산책", "A little nature"],
    time: "10:00",
    source:
      "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=02f56ab2-5e53-470f-8ec3-95cf8fb88aa4",
  },
  {
    name: "대성갈비",
    en: "Daeseong Galbi",
    kind: ["점심", "Time for lunch"],
    time: "12:00",
    source:
      "https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=48a0552a-2b19-4373-8793-0f119c3ff86a",
  },
  {
    name: "성수연방",
    en: "Seongsu Yeonbang",
    kind: ["문화 공간", "A cultural stop"],
    time: "14:00",
    source:
      "https://korean.visitkorea.or.kr/detail/rem_detail.do?cotid=78ac1b66-81f8-45d8-b987-dd4a217db34d",
  },
] as const;
