import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Place } from "../../shared/domain";
import { useI18n } from "../i18n";

export default function RasterMap({
  places,
  selected,
  onSelect,
  center,
}: {
  places: Place[];
  selected: string | null;
  onSelect: (place: Place) => void;
  center: [number, number];
}) {
  const { language, t } = useI18n();
  const element = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null);
  const [failed, setFailed] = useState(false);
  const [longitude, latitude] = center;
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { zoomControl: true }).setView(
      [center[1], center[0]],
      14,
    );
    map.current = instance;
    const layer = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      },
    ).addTo(instance);
    layer.on("tileerror", () => setFailed(true));
    layer.on("load", () => {
      if (element.current?.querySelector(".leaflet-tile-loaded"))
        setFailed(false);
    });
    const observer = new ResizeObserver(() => {
      if (element.current?.clientWidth) instance.invalidateSize();
    });
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
    // The map instance persists; center changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    map.current?.setView([latitude, longitude], map.current.getZoom(), {
      animate: false,
    });
  }, [longitude, latitude]);
  useEffect(() => {
    if (!map.current) return;
    const markers = places.map((place, index) => {
      const button = document.createElement("button");
      button.className = `map-pin ${selected === place.id ? "selected" : ""}`;
      button.textContent = `${index + 1} ${place.name}`;
      button.setAttribute(
        "aria-label",
        `${place.name} ${language === "ko" ? "상세 보기" : "details"}`,
      );
      button.setAttribute("aria-pressed", String(selected === place.id));
      button.onclick = () => onSelect(place);
      return L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          html: button,
          className: "raster-pin",
          iconSize: undefined,
        }),
      }).addTo(map.current!);
    });
    const chosen = places.find((place) => place.id === selected);
    if (chosen) map.current.panTo([chosen.lat, chosen.lng], { animate: false });
    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [places, selected, onSelect, language]);
  return (
    <>
      <div ref={element} className="map-canvas raster-map" />
      {failed && (
        <div className="raster-warning" role="status">
          {t("장소 목록은 계속 볼 수 있어요.")}
        </div>
      )}
    </>
  );
}
