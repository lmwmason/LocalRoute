import { describe, expect, it } from "vitest";
import {
  contributionSchema,
  filterPlaces,
  moveStop,
  parseCoordinate,
} from "../shared/domain";
import { isHttpUrl } from "../shared/config";
import { demoPlaces } from "../shared/demo";
import { readConfig } from "../server/config";
describe("contribution validation", () => {
  const valid = {
    requestId: "00000000-0000-4000-8000-000000000001",
    placeId: demoPlaces[0].id,
    text: "직접 먹어 본 들깨 메뉴가 맛있어요.",
    confirmed: true,
  };
  it("requires one exact internal place and an explicit preview confirmation", () => {
    expect(contributionSchema.safeParse(valid).success).toBe(true);
    expect(
      contributionSchema.safeParse({ ...valid, confirmed: false }).success,
    ).toBe(false);
    expect(
      contributionSchema.safeParse({ ...valid, placeId: "heyyumi:123" })
        .success,
    ).toBe(false);
    expect(
      contributionSchema.safeParse({
        ...valid,
        manualPlace: {
          name: "식당",
          address: "서울 성동구 성수동",
          lat: 37,
          lng: 127,
        },
      }).success,
    ).toBe(false);
  });
  it("rejects whitespace, invalid and non-finite coordinate inputs; permits real zero coordinates", () => {
    for (const value of ["", "   ", "Infinity", "NaN", "0x10", "abc"])
      expect(parseCoordinate(value)).toBeNull();
    expect(parseCoordinate(" 0 ")).toBe(0);
    expect(parseCoordinate("37.54")).toBe(37.54);
    const manual = {
      ...valid,
      placeId: undefined,
      manualPlace: {
        name: "식당",
        address: "서울 성동구 성수동",
        lat: parseCoordinate(" "),
        lng: parseCoordinate(" "),
      },
    };
    expect(contributionSchema.safeParse(manual).success).toBe(false);
  });
});
describe("discovery and itinerary", () => {
  it("combines free-text and category without altering the source", () => {
    expect(filterPlaces(demoPlaces, "오후", "카페")).toHaveLength(1);
    expect(filterPlaces(demoPlaces, "오후", "한식")).toHaveLength(0);
    expect(filterPlaces(demoPlaces, " ", "전체")).toHaveLength(5);
  });
  it("reorders immutably and refuses out-of-bounds moves", () => {
    const ids = ["a", "b", "c"];
    expect(moveStop(ids, 1, -1)).toEqual(["b", "a", "c"]);
    expect(ids).toEqual(["a", "b", "c"]);
    expect(moveStop(ids, 0, -1)).toEqual(ids);
    expect(moveStop(ids, 2, 1)).toEqual(ids);
  });
});
describe("configuration safeguards", () => {
  it("rejects malformed URLs without starting a client", () => {
    for (const v of [
      "https://",
      "",
      "javascript:alert(1)",
      "https://user:pass@example.com",
    ])
      expect(isHttpUrl(v)).toBe(false);
    expect(isHttpUrl("https://example.supabase.co")).toBe(true);
  });
  it("starts without secrets and disables optional integrations", () => {
    const config = readConfig({});
    expect(config.live).toBe(false);
    expect(config.database).toBe(false);
    expect(config.heyyumi).toBe(false);
    expect(readConfig({ VITE_DATA_MODE: "live" }).warnings).not.toHaveLength(0);
    expect(
      readConfig({
        FEATURE_HEYYUMI_SEARCH: "true",
        HEY_YUMI_API_KEY: "placeholder",
      }).heyyumi,
    ).toBe(false);
  });
});
