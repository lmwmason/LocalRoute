import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { displayMediaSchema } from "../shared/display-media";

const initial = JSON.parse(
  await readFile("scripts/data/restaurant-illustrations.json", "utf8"),
);
const examples = JSON.parse(
  await readFile("scripts/data/euljiro-example-images.json", "utf8"),
);
const places = JSON.parse(
  await readFile("scripts/data/euljiro-example-places.json", "utf8"),
);
const observedAt = new Date().toISOString();
const entries: { placeSourceUrl: string; media: unknown }[] =
  initial.places.map((place: { sourceUrl: string; name: string }) => ({
    placeSourceUrl: place.sourceUrl,
    media: {
      assetType: "ai_illustration",
      assetPath: initial.assetPath,
      alt: `${place.name} · AI illustration, not a real venue photo`,
      credit: "LocalRoute · AI illustration",
      licenseLabel: "시연용 일러스트 · 실제 음식·매장 재현 아님",
      sourceUrl: place.sourceUrl,
      observedAt,
      changes:
        "Generic generated illustration; not a photograph or venue evidence.",
    },
  }));
entries.push({
  placeSourceUrl: places[0].sourceUrl,
  media: {
    assetType: "ai_illustration",
    assetPath: "/example-images/lunch-ai.png",
    alt: "우래옥 · AI noodle illustration, not its actual menu or venue",
    credit: "LocalRoute · AI illustration",
    licenseLabel: "시연용 일러스트 · 실제 음식·매장 재현 아님",
    sourceUrl: places[0].sourceUrl,
    observedAt,
    changes: "Generic generated lunch illustration; not a venue photograph.",
  },
});
entries.push({
  placeSourceUrl: places[1].sourceUrl,
  media: {
    assetType: "photo",
    assetPath: "/place-display-media/hidemeplease-euljiro-founder.jpg",
    alt: "하이드미플리즈 을지로점 내부 · 사용자 제공 · 인물 흐림 처리",
    credit: "사용자 제공 / Provided by just_grassy",
    licenseLabel: "제공자의 LocalRoute 게시 허락 · 공개 라이선스 아님",
    sourceUrl: places[1].sourceUrl,
    observedAt,
    changes:
      "Orientation corrected; people blurred for privacy; resized and re-encoded without EXIF/XMP/IPTC. Original preserved privately.",
  },
});
const park = examples.photos.find(
  (photo: { placeKey: string }) => photo.placeKey === "tapgol-park",
);
entries.push({
  placeSourceUrl: places[2].sourceUrl,
  media: {
    assetType: "photo",
    assetPath: park.assetPath,
    alt: "Tapgol Park, Seoul · photographed 2019-07-31",
    credit: `${park.author} · ${park.capturedAt}`,
    licenseLabel: park.license,
    sourceUrl: park.sourcePageUrl,
    observedAt,
    changes: `${park.changes} License: ${park.licenseUrl}`,
  },
});
for (const entry of entries) {
  const media = displayMediaSchema.parse(entry.media);
  await readFile(resolve("public", `.${media.assetPath}`));
  entry.media = media;
}
if (
  new Set(entries.map((entry) => entry.placeSourceUrl)).size !== entries.length
)
  throw new Error("Duplicate place identity.");
await writeFile(
  "scripts/data/place-display-media.json",
  JSON.stringify(entries, null, 2) + "\n",
);
console.log(
  `Validated ${entries.length} canonical media entries. No DB mutation.`,
);
