import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { AttributionControl, type Map as MapLibre } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "../src/styles.css";
import { I18nProvider } from "../src/i18n";
import { Feedback } from "../src/components/Feedback";
import { PlaceOrigin } from "../src/components/PlaceOrigin";
import type { Place } from "../shared/domain";

const place: Place = {
  id: "00000000-0000-4000-8000-000000000099",
  name: "Fixture park",
  kind: "attraction",
  address: "Fixture location",
  category: "park",
  lat: 37.5,
  lng: 127,
  source: "localroute",
  tags: [],
  rating: null,
  reviewCount: 0,
  endorsements: [
    {
      id: "e1",
      versionId: "00000000-0000-4000-8000-000000000098",
      author: "Local curator",
      text: "Fixture recommendation",
      helpfulCount: 0,
    },
  ],
  sourcePhoto: {
    assetPath: "/place-source-photos/fixture.jpg",
    sourcePageUrl: "https://example.test/photo",
    author: "Photographer",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    title: "Park",
    caption: "Actual park photo fixture",
    capturedAt: null,
    changes: "Resized",
    priorChanges: null,
    verifiedAt: new Date().toISOString(),
    sha256: "a".repeat(64),
  },
};
function NativeAttribution() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const control = new AttributionControl({
      compact: true,
      customAttribution:
        '<a href="https://maplibre.org/">MapLibre</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    const map = {
      style: { stylesheet: {}, tileManagers: {} },
      on() {},
      off() {},
      _getUIString: () => "Toggle attribution",
      getCanvasContainer: () => container.current,
    } as unknown as MapLibre;
    container.current!.append(control.onAdd(map));
    return () => control.onRemove();
  }, []);
  return (
    <section
      className="map-panel"
      style={{ height: 280, width: "100%", position: "relative" }}
    >
      <div className="maplibregl-map" style={{ height: "100%" }}>
        <div className="maplibregl-ctrl-top-right">
          <div className="maplibregl-ctrl maplibregl-ctrl-group">
            <button aria-label="Zoom in">+</button>
            <button aria-label="Zoom out">−</button>
          </div>
        </div>
        <div className="maplibregl-ctrl-bottom-right" ref={container} />
      </div>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <main style={{ padding: 16 }}>
      <PlaceOrigin place={place} linked />
      <NativeAttribution />
      <Feedback place={place} userId="fixture-user" onLogin={() => {}} />
    </main>
  </I18nProvider>,
);
