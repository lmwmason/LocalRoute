/** Search/display vocabulary only. Never a source of coordinates or administrative IDs.
 * English names follow Korea Tourism Organization destination names:
 * https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/locIntrdnList.do
 */
export const regionSearchAliases = [
  { english: "Seoul", names: ["서울", "서울특별시"], aliases: ["Seoul-si"] },
  { english: "Busan", names: ["부산", "부산광역시"], aliases: ["Busan-si"] },
  { english: "Daegu", names: ["대구", "대구광역시"], aliases: [] },
  { english: "Incheon", names: ["인천", "인천광역시"], aliases: [] },
  { english: "Gwangju", names: ["광주", "광주광역시"], aliases: [] },
  { english: "Daejeon", names: ["대전", "대전광역시"], aliases: [] },
  { english: "Ulsan", names: ["울산", "울산광역시"], aliases: [] },
  { english: "Sejong", names: ["세종", "세종특별자치시"], aliases: [] },
  { english: "Gyeonggi-do", names: ["경기", "경기도"], aliases: ["Gyeonggi"] },
  {
    english: "Gangwon-do",
    names: ["강원", "강원도", "강원특별자치도"],
    aliases: ["Gangwon"],
  },
  {
    english: "Chungcheongbuk-do",
    names: ["충북", "충청북도"],
    aliases: ["Chungbuk", "North Chungcheong"],
  },
  {
    english: "Chungcheongnam-do",
    names: ["충남", "충청남도"],
    aliases: ["Chungnam", "South Chungcheong"],
  },
  {
    english: "Jeonbuk",
    names: ["전북", "전라북도", "전북특별자치도"],
    aliases: ["Jeollabuk-do", "North Jeolla"],
  },
  {
    english: "Jeollanam-do",
    names: ["전남", "전라남도"],
    aliases: ["Jeonnam", "South Jeolla"],
  },
  {
    english: "Gyeongsangbuk-do",
    names: ["경북", "경상북도"],
    aliases: ["Gyeongbuk", "North Gyeongsang"],
  },
  {
    english: "Gyeongsangnam-do",
    names: ["경남", "경상남도"],
    aliases: ["Gyeongnam", "South Gyeongsang"],
  },
  {
    english: "Jeju",
    names: ["제주", "제주도", "제주특별자치도"],
    aliases: ["Jeju-do", "Jeju Island"],
    destinationQuery: "제주시",
  },
  { english: "Chungju", names: ["충주시"], aliases: ["Chungju-si"] },
  { english: "Jeju-si", names: ["제주시"], aliases: ["Jeju City"] },
  { english: "Seongdong-gu", names: ["성동구"], aliases: [] },
  { english: "Jung-gu", names: ["중구"], aliases: [] },
  {
    english: "Seongsu",
    names: ["성수"],
    aliases: ["Seongsu-dong"],
    destinationQuery: "서울 성동구",
  },
  {
    english: "Euljiro",
    names: ["을지로"],
    aliases: ["Eulji-ro"],
    destinationQuery: "서울 중구",
  },
] as const;
export function normalizeRegionAlias(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s-]+/g, "");
}
export function findRegionAlias(value: string) {
  const key = normalizeRegionAlias(value);
  return regionSearchAliases.find((entry) =>
    [entry.english, ...entry.aliases].some(
      (name) => normalizeRegionAlias(name) === key,
    ),
  );
}
export function regionSearchTerm(value: string) {
  return findRegionAlias(value)?.names[0] ?? value;
}
export function destinationSearchTerm(value: string) {
  const alias = findRegionAlias(value);
  return alias && "destinationQuery" in alias
    ? alias.destinationQuery
    : regionSearchTerm(value);
}
export function bilingualRegionName(name: string) {
  const english = regionSearchAliases.find((entry) =>
    (entry.names as readonly string[]).includes(name),
  )?.english;
  return english ? `${english} · ${name}` : name;
}
export function bilingualDestinationLabel(value: {
  label: string;
  region1: string;
  region2: string;
  region3: string;
}) {
  const english = [value.region1, value.region2, value.region3]
    .filter(Boolean)
    .map(
      (name) =>
        regionSearchAliases.find((entry) =>
          (entry.names as readonly string[]).includes(name),
        )?.english ?? name,
    )
    .join(" ");
  return english === value.label ? value.label : `${english} · ${value.label}`;
}
