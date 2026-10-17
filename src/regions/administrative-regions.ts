import type { Locality } from "../../shared/locality";

export type RegionRow = readonly [
  code: string,
  province: string,
  district: string,
  town: string,
];
export type RegionData = { referenceDate: string; rows: RegionRow[] };
export type RegionSelection = {
  province: string;
  district: string;
  townCode: string;
};
export const emptyRegion: RegionSelection = {
  province: "",
  district: "",
  townCode: "",
};
export const regionSource = "https://www.data.go.kr/data/3033254/fileData.do";

// Load only a bundled, public snapshot. No query, account data or network geocoder.
export async function loadRegions(): Promise<RegionData> {
  const { default: data } = await import("./administrative-regions.json");
  return validateRegions(data);
}

export function validateRegions(input: unknown): RegionData {
  const data = input as RegionData;
  if (
    !data ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.referenceDate) ||
    !Array.isArray(data.rows) ||
    !data.rows.length
  )
    throw new Error("Invalid region snapshot");
  const codes = new Set<string>();
  const provinceCodes = new Map<string, string>();
  const districtCodes = new Map<string, string>();
  for (const row of data.rows) {
    if (
      !Array.isArray(row) ||
      row.length !== 4 ||
      row.some((x) => typeof x !== "string") ||
      !/^\d{10}$/.test(row[0]) ||
      !row[1] ||
      !row[3] ||
      codes.has(row[0])
    )
      throw new Error("Invalid administrative region");
    codes.add(row[0]);
    for (const [parents, code, name] of [
      [provinceCodes, row[0].slice(0, 2), row[1]],
      [districtCodes, row[0].slice(0, 5), `${row[1]} ${row[2]}`],
    ] as const) {
      if (parents.has(code) && parents.get(code) !== name)
        throw new Error("Inconsistent region parent");
      parents.set(code, name);
    }
  }
  return data;
}

const indexes = new WeakMap<
  RegionData,
  Map<string, Map<string, RegionRow[]>>
>();
function index(data: RegionData) {
  let grouped = indexes.get(data);
  if (!grouped) {
    grouped = new Map();
    for (const row of data.rows) {
      let parent = grouped.get(row[1]);
      if (!parent) {
        parent = new Map();
        grouped.set(row[1], parent);
      }
      const children = parent.get(row[2]) ?? [];
      children.push(row);
      parent.set(row[2], children);
    }
    indexes.set(data, grouped);
  }
  return grouped;
}
export function provinces(data: RegionData): string[] {
  return [...index(data).keys()];
}
export function districts(data: RegionData, province: string): string[] {
  return [...(index(data).get(province)?.keys() ?? [])].filter(Boolean);
}
export function towns(
  data: RegionData,
  selection: RegionSelection,
): RegionRow[] {
  return index(data).get(selection.province)?.get(selection.district) ?? [];
}
export function allowsCityOnly(data: RegionData, province: string): boolean {
  return (
    province.endsWith("시") &&
    !districts(data, province).some((name) => /^\S+시(?: |$)/.test(name))
  );
}
export function searchRegions<T>(
  items: T[],
  query: string,
  label: (item: T) => string,
): T[] {
  const normalize = (text: string) =>
    text
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[\s.·ㆍ]/g, "");
  const key = normalize(query.trim().slice(0, 80));
  return items.filter((item) => normalize(label(item)).includes(key));
}

export function selectRegion(
  data: RegionData,
  value: RegionSelection,
  level: keyof RegionSelection,
  id: string,
): RegionSelection {
  const next =
    level === "province"
      ? { province: id, district: "", townCode: "" }
      : level === "district"
        ? { ...value, district: id, townCode: "" }
        : { ...value, townCode: id };
  if (next.province && !provinces(data).includes(next.province))
    throw new Error("Unknown province");
  if (next.district && !districts(data, next.province).includes(next.district))
    throw new Error("Invalid district parent");
  if (
    next.townCode &&
    !towns(data, next).some((row) => row[0] === next.townCode)
  )
    throw new Error("Invalid town parent");
  return next;
}

/** Keep the existing city/area/scope wire contract; no new profile columns. */
export function regionLocality(
  data: RegionData,
  selection: RegionSelection,
  scope: Locality["localityScope"],
): Locality | null {
  if (!provinces(data).includes(selection.province)) return null;
  if (
    selection.district &&
    !districts(data, selection.province).includes(selection.district)
  )
    return null;
  // Provinces need a municipality; special/metropolitan cities can use city-wide coverage.
  if (!selection.district && !allowsCityOnly(data, selection.province))
    return null;
  const town = selection.townCode
    ? towns(data, selection).find((row) => row[0] === selection.townCode)
    : undefined;
  if (selection.townCode && !town) return null;
  const [city, ...subdistrict] = selection.district.split(" ");
  const metropolitan =
    selection.province.endsWith("시") && !/[시군]$/.test(city);
  const homeArea = [
    ...(metropolitan ? [selection.district] : subdistrict),
    town?.[3],
  ]
    .filter(Boolean)
    .join(" ");
  if (scope === "area" && !homeArea) return null;
  return {
    homeCity: metropolitan ? selection.province : city,
    homeArea,
    localityScope: scope,
  };
}

/** Ambiguous homonyms and old spellings require explicit user confirmation. */
export function recoverRegions(
  data: RegionData,
  locality: Locality,
): RegionSelection[] {
  const exact: RegionSelection[] = [],
    aliases: RegionSelection[] = [];
  const seen = new Set<string>();
  const normalizeCity = (name: string) =>
    name.trim().replace(/(?:특별자치시|특별시|광역시|시)$/, "");
  for (const row of data.rows) {
    const candidates: RegionSelection[] = [
      { province: row[1], district: "", townCode: "" },
      { province: row[1], district: row[2], townCode: "" },
      { province: row[1], district: row[2], townCode: row[0] },
    ];
    for (const candidate of candidates) {
      const key = JSON.stringify(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      const mapped = regionLocality(data, candidate, locality.localityScope);
      if (!mapped || mapped.homeArea !== locality.homeArea.trim()) continue;
      if (mapped.homeCity === locality.homeCity.trim()) exact.push(candidate);
      else if (
        normalizeCity(mapped.homeCity) === normalizeCity(locality.homeCity)
      )
        aliases.push(candidate);
    }
  }
  return exact.length ? exact : aliases;
}
