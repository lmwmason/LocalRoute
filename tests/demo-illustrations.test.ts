import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  placeIllustration,
  type IllustrationPlace,
} from "../shared/demo-illustrations";

const manifest = JSON.parse(
  readFileSync("scripts/data/restaurant-illustrations.json", "utf8"),
) as {
  assetPath: string;
  assetType: string;
  sha256: string;
  disclosure: { ko: string; en: string };
  places: { sourceUrl: string; name: string }[];
};
const first = manifest.places[0];
const exampleManifest = JSON.parse(
  readFileSync("scripts/data/euljiro-example-images.json", "utf8"),
) as {
  illustrations: { placeKey: string; assetPath: string; sha256: string }[];
};
const place: IllustrationPlace = {
  kind: "restaurant",
  source: "localroute",
  officialSources: [{ url: first.sourceUrl }],
};

describe("bounded demo restaurant illustrations", () => {
  it("maps exactly the eleven manifest source identities with explicit bilingual disclosure", () => {
    expect(manifest.places).toHaveLength(11);
    expect(new Set(manifest.places.map((entry) => entry.sourceUrl)).size).toBe(
      11,
    );
    for (const entry of manifest.places) {
      const result = placeIllustration({
        kind: "restaurant",
        officialSources: [{ url: entry.sourceUrl }],
      });
      expect(result).toEqual({
        name: entry.name,
        url: entry.sourceUrl,
        asset: manifest.assetPath,
        assetType: manifest.assetType,
        label: { ko: manifest.disclosure.ko, en: manifest.disclosure.en },
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result?.label)).toBe(true);
    }
    expect(
      createHash("sha256")
        .update(readFileSync(`public${manifest.assetPath}`))
        .digest("hex"),
    ).toBe(manifest.sha256);
  });

  it("accepts itinerary candidate provenance without modifying its facts", () => {
    const candidate = {
      kind: "restaurant",
      source: { url: first.sourceUrl, provider: "localroute" },
      endorsements: [],
    };
    const before = JSON.stringify(candidate);
    expect(placeIllustration(candidate)).toEqual(placeIllustration(place));
    expect(JSON.stringify(candidate)).toBe(before);
    expect(placeIllustration(place)).toBe(placeIllustration(place));
  });

  it("uses the two approved example assets for their exact canonical identities", () => {
    const examples = [
      {
        placeKey: "wooraeok",
        kind: "restaurant",
        url: "https://korean.visitseoul.net/citycenter/%EC%9A%B0%EB%9E%98%EC%98%A5-Wooraeok/KOP003207",
      },
      {
        placeKey: "hidemeplease-euljiro",
        kind: "cafe",
        url: "https://www.spacecloud.kr/space/59739",
      },
    ];
    for (const entry of examples) {
      const image = exampleManifest.illustrations.find(
        (image) => image.placeKey === entry.placeKey,
      )!;
      const official = {
        kind: entry.kind,
        officialSources: [{ url: entry.url }],
      };
      const result = placeIllustration(official);
      expect(result?.asset).toBe(image.assetPath);
      expect(result?.assetType).toBe("ai_generated_generic_illustration");
      expect(result?.label).toEqual({
        ko: manifest.disclosure.ko,
        en: manifest.disclosure.en,
      });
      expect(
        placeIllustration({ kind: entry.kind, source: { url: entry.url } }),
      ).toEqual(result);
      expect(
        placeIllustration(official, { privatePreview: true }),
      ).toBeUndefined();
      expect(
        placeIllustration({ ...official, photo: { id: "actual" } }),
      ).toBeUndefined();
      expect(
        placeIllustration({ ...official, sourcePhoto: {} }),
      ).toBeUndefined();
      expect(
        createHash("sha256")
          .update(readFileSync(`public${image.assetPath}`))
          .digest("hex"),
      ).toBe(image.sha256);
      expect(
        placeIllustration({
          kind: entry.kind,
          officialSources: [{ url: `${entry.url}#not-exact` }],
        }),
      ).toBeUndefined();
      expect(
        placeIllustration({
          ...official,
          kind: entry.kind === "cafe" ? "restaurant" : "cafe",
        }),
      ).toBeUndefined();
    }
    expect(placeIllustration({ ...place, kind: "cafe" })).toBeUndefined();
  });

  it("never replaces contributor/source photos or private contribution previews", () => {
    for (const patch of [{ photo: { id: "approved" } }, { sourcePhoto: {} }])
      expect(placeIllustration({ ...place, ...patch })).toBeUndefined();
    expect(placeIllustration(place, { privatePreview: true })).toBeUndefined();
    expect(placeIllustration({ ...place, kind: "attraction" })).toBeUndefined();
  });

  it("rejects names, other restaurants, partial URLs and altered source identities", () => {
    expect(placeIllustration({})).toBeUndefined();
    expect(placeIllustration({ source: first.name })).toBeUndefined();
    for (const url of [
      "https://place.map.kakao.com/12345678",
      `${first.sourceUrl}#same-name`,
      `${first.sourceUrl}&extra=1`,
      first.sourceUrl.replace("https://", "http://"),
      `https://attacker.test/?source=${first.sourceUrl}`,
      `${first.sourceUrl} `,
    ])
      expect(placeIllustration({ officialSources: [{ url }] })).toBeUndefined();
    expect(
      placeIllustration({
        officialSources: [{ url: "https://source.example.test/" }],
        source: { url: first.sourceUrl },
      }),
    ).toEqual(placeIllustration(place));
  });
});
