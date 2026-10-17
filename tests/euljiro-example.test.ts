import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { euljiroExample, euljiroExamplePath } from "../shared/euljiro-example";
import { distanceMeters, minutes } from "../shared/planner";
import { operatorPlaceBatchSchema } from "../shared/catalog-import";

describe("real-place public Euljiro example", () => {
  it("includes the exact requested branch, source-checked address and listing pin", () => {
    const cafe = euljiroExample.stops.find(
      (stop) => stop.key === "hidemeplease-euljiro",
    )!;
    expect(cafe).toMatchObject({
      name: "하이드미플리즈 을지로점",
      address: "서울 중구 을지로11길 33 2층",
      lat: 37.5679039,
      lng: 126.99073307,
      kind: "cafe",
    });
    expect(cafe.sources.map((source) => source.url)).toContain(
      "https://hidemeplease.xyz/",
    );
    expect(cafe.sources.map((source) => source.url)).toContain(
      "https://www.spacecloud.kr/space/59739",
    );
  });
  it("keeps unverified facts unknown instead of inventing booking IDs, hours or a reserved date", () => {
    expect(euljiroExample.cost).toBe(0);
    expect(euljiroExample.date).toBeNull();
    expect(euljiroExample.kind).toBe("public_curated_example");
    expect(euljiroExamplePath).toBe("/examples/euljiro");
    for (const stop of euljiroExample.stops) {
      expect(stop.heyyumiPlaceId).toBeNull();
      expect(stop.canonicalPlaceId).toBeNull();
      expect(stop.openingHours).toBeNull();
      expect(stop.bookingAvailability).toBeNull();
    }
    expect(JSON.stringify(euljiroExample)).not.toMatch(
      /guestPhone|userId|access_token|confirmed|endorsementVersion/,
    );
  });
  it("plans a realistic meal and nearby stops without describing buffers as travel estimates", () => {
    const stops = euljiroExample.stops;
    expect(stops[0].purpose).toBe("lunch");
    expect(
      minutes(stops[0].end) - minutes(stops[0].start),
    ).toBeGreaterThanOrEqual(45);
    for (const [index, stop] of stops.entries()) {
      expect(minutes(stop.end)).toBeGreaterThan(minutes(stop.start));
      if (index) {
        expect(
          minutes(stop.start) - minutes(stops[index - 1].end),
        ).toBeGreaterThanOrEqual(30);
        expect(distanceMeters(stops[index - 1], stop)).toBeLessThan(1800);
      }
    }
    expect(new Set(stops.map((stop) => stop.sourceId)).size).toBe(stops.length);
  });
  it("provides a valid import batch with the same identities and no fabricated contributions", () => {
    const records = operatorPlaceBatchSchema.parse(
      JSON.parse(
        readFileSync(
          new URL(
            "../scripts/data/euljiro-example-places.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    expect(records).toHaveLength(3);
    for (const [index, record] of records.entries()) {
      const stop = euljiroExample.stops[index];
      expect(record).toMatchObject({
        name: stop.name,
        address: stop.address,
        lat: stop.lat,
        lng: stop.lng,
        kind: stop.kind,
      });
      expect(stop.sources.map((source) => source.url)).toContain(
        record.sourceUrl,
      );
      expect(record).not.toHaveProperty("endorsements");
      expect(record).not.toHaveProperty("photos");
    }
  });
});
