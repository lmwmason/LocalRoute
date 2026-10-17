import { useI18n } from "../i18n";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
const RasterMap = lazy(() => import("./RasterMap"));

export default function Map({
  places,
  selected,
  onSelect,
  center,
  caption,
}: {
  places: Place[];
  selected: string | null;
  onSelect: (place: Place) => void;
  center?: [number, number];
  caption?: string;
}) {
  const { t, language } = useI18n();

  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const onSelectRef = useRef(onSelect);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const initialCenter = useRef(center || [127.053, 37.5455]);
  const longitude = center?.[0],
    latitude = center?.[1];
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    if (!container.current || failed) return;
    let instance: MapLibre | undefined;
    const timeout = window.setTimeout(() => setFailed(true), 15000);
    try {
      instance = new MapLibre({
        container: container.current,
        style: config.mapStyle,
        center: initialCenter.current as [number, number],
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
    const observer = new ResizeObserver(() => {
      if (container.current?.clientWidth && container.current?.clientHeight)
        instance?.resize();
    });
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      clearTimeout(timeout);
      instance?.remove();
      map.current = null;
    };
  }, [attempt, failed]);
  useEffect(() => {
    if (longitude !== undefined && latitude !== undefined)
      map.current?.jumpTo({ center: [longitude, latitude] });
  }, [longitude, latitude]);
  useEffect(() => {
    if (!map.current) return;
    const markers = places.map((p, i) => {
      const button = document.createElement("button");
      button.className = `map-pin ${selected === p.id ? "selected" : ""}`;
      button.textContent = `${i + 1}  ${p.name}`;
      button.setAttribute(
        "aria-label",
        `${p.name} ${language === "ko" ? "상세 보기" : "details"}`,
      );
      button.setAttribute("aria-pressed", String(selected === p.id));
      button.onclick = () => onSelectRef.current(p);
      return new Marker({ element: button, anchor: "bottom" })
        .setLngLat([p.lng, p.lat])
        .addTo(map.current!);
    });
    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [places, selected, attempt, failed, language, loaded]);
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
    <section className="map-panel" aria-label={t("장소 지도")}>
      {failed ? (
        <Suspense
          fallback={
            <div className="map-loading" role="status">
              {t("동네 지도를 불러오는 중이에요…")}
            </div>
          }
        >
          <RasterMap
            places={places}
            selected={selected}
            onSelect={onSelect}
            center={center || (initialCenter.current as [number, number])}
          />
        </Suspense>
      ) : (
        <div ref={container} className="map-canvas" />
      )}
      {!loaded && !failed && (
        <div className="map-loading" role="status">
          {t("동네 지도를 불러오는 중이에요…")}
        </div>
      )}
      {failed && (
        <details className="map-fallback-info">
          <summary>
            {language === "ko"
              ? "기본 지도로 전환했어요"
              : "Using the basic map"}
          </summary>
          <MapPinned size={28} />
          <strong>{t("지도를 불러오지 못했어요")}</strong>
          <span>{t("장소 목록은 계속 볼 수 있어요.")}</span>
          <button
            className="small-button"
            onClick={() => {
              setFailed(false);
              setLoaded(false);
              setAttempt((n) => n + 1);
            }}
          >
            {t("지도 다시 불러오기")}
          </button>
        </details>
      )}
      <div className="map-caption">
        <span className="live-dot" /> {caption || "성수의 작은 발견"}{" "}
        {!caption && <span>SEOUL, SEONGSU</span>}
      </div>
    </section>
  );
}
