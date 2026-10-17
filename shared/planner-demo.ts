import { demoPlaces } from "./demo";
import type { Candidate, Schedule, TripInput } from "./planner";
import { clock, minutes, tripDates } from "./planner";
export const demoCatalog: Candidate[] = [
  ...demoPlaces.map((p): Candidate => ({
    id: p.id,
    name: p.name,
    kind: p.category === "카페" ? "cafe" : "restaurant",
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    tags: [
      p.category === "한식"
        ? "korean"
        : p.category === "일식"
          ? "japanese"
          : p.category === "양식"
            ? "western"
            : "coffee",
    ],
    source: {
      provider: "demo",
      observedAt: "2026-10-17",
      verification: "demo",
    },
    endorsements: p.endorsements.map((e, i) => ({
      versionId: `demo-version-${p.id}-${i}`,
      text: e.text,
    })),
  })),
  ...[
    {
      id: "demo-culture-1",
      name: "골목의 작은 전시관 · 가상",
      en: "Little Alley Gallery · fictional",
      lat: 37.5467,
      lng: 127.0515,
      tags: ["art", "culture"],
    },
    {
      id: "demo-park-1",
      name: "느린 정원 산책길 · 가상",
      en: "Slow Garden Walk · fictional",
      lat: 37.544,
      lng: 127.054,
      tags: ["nature"],
    },
    {
      id: "demo-market-1",
      name: "로컬 메이커 골목 · 가상",
      en: "Local Makers Lane · fictional",
      lat: 37.548,
      lng: 127.0548,
      tags: ["shopping", "history"],
    },
  ].map((p): Candidate => ({
    id: p.id,
    name: p.name,
    kind: p.tags.includes("art") ? "culture" : "attraction",
    address: "서울 성수 · 가상 체험 장소",
    lat: p.lat,
    lng: p.lng,
    tags: p.tags,
    source: {
      provider: "demo",
      externalId: p.en,
      observedAt: "2026-10-17",
      verification: "demo",
    },
    endorsements: [],
  })),
];
export function demoSchedule(input: TripInput): Schedule {
  const en = input.language === "en",
    date = tripDates(input.startDate, input.endDate)[0];
  const start = minutes(input.startTime),
    end = minutes(input.endTime),
    buffer = input.transferBufferMinutes;
  const stops: Schedule["days"][number]["stops"] = [];
  let cursor = start;
  const add = (
    id: string,
    at: number,
    duration: number,
    purpose: "visit" | "lunch" | "dinner" | "break",
    ko: string,
    english: string,
  ) => {
    if (at + duration <= end) {
      stops.push({
        candidateId: id,
        start: clock(at),
        end: clock(at + duration),
        purpose,
        explanation: en ? english : ko,
      });
      cursor = at + duration + buffer;
    }
  };
  if (start <= 720) {
    add(
      "demo-culture-1",
      start,
      60,
      "visit",
      "골목의 전시를 먼저 둘러보며 오늘의 여행을 시작해요.",
      "Begin with a small neighborhood exhibition at an easy pace.",
    );
    add(
      demoPlaces[0].id,
      Math.max(cursor, 720),
      60,
      "lunch",
      "현지인의 한마디가 담긴 따뜻한 한 끼로 점심을 즐겨요.",
      "Enjoy lunch at a place recommended by a local contributor.",
    );
  }
  add(
    "demo-park-1",
    Math.max(cursor, Math.min(840, start)),
    60,
    "visit",
    "식사 후에는 가까운 정원에서 서두르지 않고 걸어요.",
    "Take an unhurried walk in the nearby garden after lunch.",
  );
  add(
    demoPlaces[1].id,
    cursor,
    45,
    "break",
    "잠깐 쉬며 남은 일정을 여유롭게 이어 가요.",
    "Pause for coffee and leave room to enjoy the rest of the day.",
  );
  if (end >= 1200)
    add(
      demoPlaces[2].id,
      Math.max(cursor, 1080),
      60,
      "dinner",
      "하루의 끝에는 다른 현지인 추천 식당에서 저녁을 먹어요.",
      "Finish at another locally recommended restaurant for dinner.",
    );
  return {
    title: en
      ? "A little food, a little discovery"
      : "맛있는 한 끼와 작은 발견",
    summary: en
      ? "A fictional one-day preview showing how local food and neighborhood experiences become a timed schedule. No AI call or credit charge."
      : "현지인 맛집과 동네의 즐길 거리를 시간에 맞게 엮은 가상 하루 일정입니다. AI 호출과 실제 LP 차감은 없습니다.",
    days: [{ date, stops }],
  };
}
