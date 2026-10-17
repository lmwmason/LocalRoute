import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibre,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { config } from "../config";
import type { Place } from "../../shared/domain";
import { MapPinned } from "lucide-react";

setWorkerUrl(workerUrl);

export default function Map({
  places,
  selected,
  onSelect,
}: {
  places: Place[];
  selected: string | null;
  onSelect: (place: Place) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    if (!container.current) return;
    let instance: MapLibre | undefined;
    const timeout = window.setTimeout(() => setFailed(true), 15000);
    try {
      instance = new MapLibre({
        container: container.current,
        style: config.mapStyle,
        center: [127.053, 37.5455],
        zoom: 14.6,
        attributionControl: { compact: true },
      });
      map.current = instance;
      instance.addControl(
        new NavigationControl({ showCompass: false }),
        "top-right",
      );
      instance.on("load", () => {
        clearTimeout(timeout);
        setLoaded(true);
        setFailed(false);
      });
      instance.on("error", () => {
        if (!instance?.isStyleLoaded()) setFailed(true);
      });
    } catch {
      setFailed(true);
    }
    return () => {
      clearTimeout(timeout);
      instance?.remove();
      map.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    if (!map.current) return;
    const markers = places.map((p, i) => {
      const button = document.createElement("button");
      button.className = `map-pin ${selected === p.id ? "selected" : ""}`;
      button.textContent = `${i + 1}  ${p.name}`;
      button.setAttribute("aria-label", `${p.name} 상세 보기`);
      button.setAttribute("aria-pressed", String(selected === p.id));
      button.onclick = () => onSelectRef.current(p);
      return new Marker({ element: button, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(map.current!);
    });
    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [places, selected, attempt]);
  useEffect(() => {
    const p = places.find((p) => p.id === selected);
    if (p && map.current)
      map.current.easeTo({
        center: [p.lng, p.lat],
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 450,
      });
  }, [selected, places]);
  return (
    <section className="map-panel" aria-label="장소 지도">
      <div ref={container} className="map-canvas" />
      {!loaded && !failed && (
        <div className="map-loading" role="status">
          동네 지도를 불러오는 중이에요…
        </div>
      )}
      {failed && (
        <div className="map-error">
          <MapPinned size={28} />
          <strong>지도를 불러오지 못했어요</strong>
          <span>장소 목록은 계속 볼 수 있어요.</span>
          <button
            className="small-button"
            onClick={() => {
              setFailed(false);
              setLoaded(false);
              setAttempt((n) => n + 1);
            }}
          >
            지도 다시 불러오기
          </button>
        </div>
      )}
      <div className="map-caption">
        <span className="live-dot" /> 성수의 작은 발견{" "}
        <span>SEOUL, SEONGSU</span>
      </div>
    </section>
  );
}
