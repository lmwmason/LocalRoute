import { describe, expect, it } from "vitest";
import {
  regionSearchAliases,
  regionSearchTerm,
  bilingualRegionName,
  destinationSearchTerm,
} from "../shared/region-search-aliases";
describe("region search vocabulary", () => {
  it("covers all 17 province/metropolitan names with case/space/hyphen normalization", () => {
    for (const alias of regionSearchAliases.slice(0, 17)) {
      expect(
        regionSearchTerm(alias.english.toUpperCase().replaceAll("-", " ")),
      ).toBe(alias.names[0]);
      expect(bilingualRegionName(alias.names[0])).toContain(alias.english);
    }
  });
  it("does not translate unknown strings or fabricate regional identities", () => {
    expect(regionSearchTerm("unknown city")).toBe("unknown city");
    expect(destinationSearchTerm("서울 중구")).toBe("서울 중구");
    expect(regionSearchTerm("Seongsu-dong")).toBe("성수");
    expect(bilingualRegionName("미등록면")).toBe("미등록면");
  });
});
