import { describe, expect, it } from "vitest";
import {
  localityLabel,
  resolveLocalityCoverage,
  suggestedScope,
} from "../shared/locality";
describe("city-sensitive, self-declared local recommendation areas", () => {
  it("uses the whole city for a rural township and a district for a metropolitan gu", () => {
    const rural = {
      homeCity: "충주시",
      homeArea: "살미면",
      localityScope: "auto" as const,
    };
    expect(suggestedScope(rural)).toBe("city");
    expect(localityLabel(rural)).toBe("충주시");
    expect(
      localityLabel({
        homeCity: "서울특별시",
        homeArea: "성동구",
        localityScope: "auto",
      }),
    ).toBe("서울특별시 성동구");
  });
  it("allows explicit city/area coverage and international profiles", () => {
    expect(
      localityLabel({
        homeCity: "서울특별시",
        homeArea: "성동구",
        localityScope: "city",
      }),
    ).toBe("서울특별시");
    expect(
      localityLabel({
        homeCity: "London",
        homeArea: "Camden",
        localityScope: "area",
      }),
    ).toBe("London Camden");
  });
  it("widens an automatic district scope only against actual registered candidate counts and the requested pool size", () => {
    const locality = {
      homeCity: "서울특별시",
      homeArea: "성동구",
      localityScope: "auto" as const,
    };
    expect(
      resolveLocalityCoverage(locality, { area: 1, city: 20 }, 6),
    ).toMatchObject({
      widened: true,
      scope: "city",
      label: "서울특별시",
      available: 20,
      coverageSource: "localroute_published_places",
    });
    expect(
      resolveLocalityCoverage(
        { ...locality, localityScope: "area" },
        { area: 1, city: 20 },
        6,
      ).widened,
    ).toBe(false);
    expect(
      resolveLocalityCoverage(locality, { area: 6, city: 20 }, 6).widened,
    ).toBe(false);
  });
});
