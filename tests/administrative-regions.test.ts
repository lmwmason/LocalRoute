import { describe, expect, it } from "vitest";
import snapshot from "../src/regions/administrative-regions.json";
import {
  districts,
  emptyRegion,
  loadRegions,
  provinces,
  recoverRegions,
  regionLocality,
  searchRegions,
  selectRegion,
  towns,
  validateRegions,
} from "../src/regions/administrative-regions";
import {
  localityLabel,
  localityRestaurantCounts,
  localitySchema,
  suggestedScope,
} from "../shared/locality";
import type { Place } from "../shared/domain";
const data = validateRegions(snapshot);
const rural = {
  province: "충청북도",
  district: "충주시",
  townCode: data.rows.find(
    (row) => row[2] === "충주시" && row[3] === "살미면",
  )![0],
};

describe("official national administrative-region snapshot", () => {
  it("loads all 3,620 published rows without narrowing to a few sample regions", async () => {
    expect(await loadRegions()).toEqual(data);
    expect(data.referenceDate).toBe("2026-09-30");
    expect(data.rows).toHaveLength(3620);
    expect(provinces(data)).toHaveLength(16);
    expect(new Set(data.rows.map((row) => `${row[1]}|${row[2]}`)).size).toBe(
      256,
    );
    expect(data.rows.every((row) => /^\d{10}$/.test(row[0]))).toBe(true);
    // Snapshot names, including reorganizations, come from the source, not a hardcoded 17-province list.
    expect(provinces(data)).toContain("전남광주통합특별시");
    expect(provinces(data)).toContain("제주특별자치도");
    expect(districts(data, "경기도")).toContain("수원시 장안구");
  });
  it("rejects malformed, duplicate and inconsistent parent data", () => {
    for (const bad of [
      null,
      {},
      { referenceDate: "2026-09-30", rows: [] },
      { ...data, rows: [data.rows[0], data.rows[0]] },
      {
        ...data,
        rows: [data.rows[0], ["1111053000", "다른 시도", "종로구", "사직동"]],
      },
    ])
      expect(() => validateRegions(bad)).toThrow();
  });
  it("validates every source row against its real parent chain and serializes optional detail", () => {
    for (const row of data.rows) {
      const selection = {
        province: row[1],
        district: row[2],
        townCode: row[0],
      };
      expect(selectRegion(data, selection, "townCode", row[0])).toEqual(
        selection,
      );
      expect(
        localitySchema.safeParse(regionLocality(data, selection, "auto"))
          .success,
      ).toBe(true);
    }
  });
  it("resets descendants when a parent changes and rejects cross-parent or unknown values", () => {
    expect(selectRegion(data, rural, "province", "서울특별시")).toEqual({
      province: "서울특별시",
      district: "",
      townCode: "",
    });
    expect(
      selectRegion(data, rural, "district", "청주시 상당구").townCode,
    ).toBe("");
    expect(() => selectRegion(data, rural, "district", "성동구")).toThrow();
    expect(() =>
      selectRegion(data, emptyRegion, "province", "가상도"),
    ).toThrow();
    expect(
      regionLocality(data, { ...rural, province: "경상남도" }, "auto"),
    ).toBeNull();
    expect(
      regionLocality(data, { ...rural, townCode: "1111051500" }, "auto"),
    ).toBeNull();
    expect(
      regionLocality(data, { ...emptyRegion, province: "경기도" }, "auto"),
    ).toBeNull();
    expect(regionLocality(data, emptyRegion, "auto")).toBeNull();
  });
  it("allows blank neighborhood and Sejong's absent municipality without inventing a district", () => {
    expect(districts(data, "세종특별자치시")).toEqual([]);
    const sejong = { province: "세종특별자치시", district: "", townCode: "" };
    expect(regionLocality(data, sejong, "auto")).toEqual({
      homeCity: "세종특별자치시",
      homeArea: "",
      localityScope: "auto",
    });
    expect(towns(data, sejong).length).toBeGreaterThan(0);
    expect(
      regionLocality(data, { ...rural, townCode: "" }, "auto")?.homeArea,
    ).toBe("");
    expect(regionLocality(data, { ...rural, townCode: "" }, "area")).toBeNull();
  });
  it("keeps rural whole-city defaults, explicit scope and existing metropolitan gu defaults", () => {
    const mapped = regionLocality(data, rural, "auto")!;
    expect(mapped).toEqual({
      homeCity: "충주시",
      homeArea: "살미면",
      localityScope: "auto",
    });
    expect(localityLabel(mapped)).toBe("충주시");
    expect(suggestedScope(mapped)).toBe("city");
    expect(localityLabel({ ...mapped, localityScope: "area" })).toBe(
      "충주시 살미면",
    );
    const seoul = regionLocality(
      data,
      { province: "서울특별시", district: "성동구", townCode: "" },
      "auto",
    )!;
    expect(localityLabel(seoul)).toBe("서울특별시 성동구");
    expect(suggestedScope(seoul)).toBe("area");
  });
  it("keeps county/municipal scope inside a metropolitan or integrated province", () => {
    for (const [province, district, town] of [
      ["전남광주통합특별시", "담양군", "담양읍"],
      ["부산광역시", "기장군", "기장읍"],
    ]) {
      const row = data.rows.find(
        (item) =>
          item[1] === province && item[2] === district && item[3] === town,
      )!;
      const locality = regionLocality(
        data,
        { province, district, townCode: row[0] },
        "auto",
      )!;
      expect(locality.homeCity).toBe(district);
      expect(locality.homeArea).toBe(town);
      expect(localityLabel(locality)).toBe(district);
    }
    expect(
      regionLocality(
        data,
        { province: "전남광주통합특별시", district: "", townCode: "" },
        "auto",
      ),
    ).toBeNull();
  });
  it("searches locally with normalized whitespace/punctuation and returns empty results", () => {
    const items = ["종로1.2.3.4가동", "서울특별시", "충청북도"];
    expect(searchRegions(items, "종로 1.2.3.4", (x) => x)).toEqual([items[0]]);
    expect(searchRegions(items, "존재하지 않음", (x) => x)).toEqual([]);
  });
  it("restores exact existing values, offers old city aliases and exposes ambiguous homonyms", () => {
    expect(
      recoverRegions(data, {
        homeCity: "충주시",
        homeArea: "살미면",
        localityScope: "auto",
      }),
    ).toEqual([rural]);
    expect(
      recoverRegions(data, {
        homeCity: "서울",
        homeArea: "성동구",
        localityScope: "auto",
      }),
    ).toEqual([{ province: "서울특별시", district: "성동구", townCode: "" }]);
    expect(
      recoverRegions(data, {
        homeCity: "고성군",
        homeArea: "",
        localityScope: "auto",
      }),
    ).toHaveLength(2);
    expect(
      recoverRegions(data, {
        homeCity: "London",
        homeArea: "Camden",
        localityScope: "area",
      }),
    ).toEqual([]);
  });
  it("matches multi-part areas consistently with the existing SQL word-boundary contract", () => {
    const places = [
      {
        address: "서울특별시 성동구 성수1가제1동 10",
        source: "manual",
        kind: "restaurant",
      },
      {
        address: "서울특별시 성동구 성수1가제2동 10",
        source: "manual",
        kind: "restaurant",
      },
      {
        address: "서울특별시 성동구 성수1가제1동 10",
        source: "demo",
        kind: "restaurant",
      },
    ] as Place[];
    expect(
      localityRestaurantCounts(
        {
          homeCity: "서울특별시",
          homeArea: "성동구 성수1가제1동",
          localityScope: "area",
        },
        places,
      ),
    ).toEqual({ city: 2, area: 1 });
    expect(
      localityRestaurantCounts(
        { homeCity: "서울특별시", homeArea: "성수1가", localityScope: "area" },
        places,
      ).area,
    ).toBe(0);
  });
});
