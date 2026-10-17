import { lazy, Suspense, useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { regionForDestination } from "../../shared/planner";
import {
  sharedItinerarySchema,
  type SharedItinerary,
} from "../../shared/sharing";
import type { Place } from "../../shared/domain";
import "./sharing.css";
import { LanguageSwitch, useI18n } from "../i18n";
import { PlacePhoto } from "../components/PlacePhoto";
import { BrandLink } from "../components/BrandLink";
const PlaceMap = lazy(() => import("../components/Map"));
export default function SharedItineraryPage() {
  const { t, language } = useI18n();
  const [data, setData] = useState<SharedItinerary | null>(null),
    [error, setError] = useState(""),
    [dayIndex, setDayIndex] = useState(0),
    [view, setView] = useState<"timeline" | "map">("timeline"),
    [selected, setSelected] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex,nofollow,noarchive";
    const referrer = document.createElement("meta");
    referrer.name = "referrer";
    referrer.content = "no-referrer";
    document.head.append(robots, referrer);
    let active = true;
    const token = location.pathname.split("/")[2] || "";
    const controller = new AbortController();
    void fetch(`/api/shared-itineraries/${encodeURIComponent(token)}`, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            [404, 410].includes(response.status)
              ? "sharing.unavailable"
              : "sharing.failed",
          );
        const result = sharedItinerarySchema.parse(await response.json());
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((value) => {
        if (active)
          setError(
            value instanceof Error && value.message === "sharing.unavailable"
              ? "sharing.unavailable"
              : "sharing.failed",
          );
      });
    return () => {
      active = false;
      controller.abort();
      robots.remove();
      referrer.remove();
    };
  }, [attempt]);
  const day = data?.days[dayIndex];
  const places: Place[] =
    day?.stops.map((stop) => ({
      id: stop.place.id,
      name: stop.place.name,
      category: stop.place.kind,
      address: stop.place.address,
      lat: stop.place.lat,
      lng: stop.place.lng,
      tags: [],
      endorsements: [],
      rating: null,
      reviewCount: 0,
      source: stop.place.source.provider === "demo" ? "demo" : "localroute",
    })) || [];
  return (
    <div className="app-shell shared-itinerary-page">
      <header className="topbar">
        <BrandLink />
        <LanguageSwitch />
      </header>
      <main>
        {error ? (
          <div className="empty-state shared-state-card" role="alert">
            <h1>{t(error)}</h1>
            <p>
              {error === "sharing.unavailable"
                ? language === "ko"
                  ? "만료되거나 철회된 링크는 다시 열 수 없어요. 공유한 사람에게 새 링크를 요청해 주세요."
                  : "Expired or revoked links cannot be reopened. Ask the owner for a new link."
                : language === "ko"
                  ? "연결을 확인하고 다시 시도해 주세요. 일정을 변경하지는 않았어요."
                  : "Check your connection and try again. The itinerary has not been changed."}
            </p>
            {error === "sharing.failed" && (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setError("");
                  setAttempt(attempt + 1);
                }}
              >
                {language === "ko" ? "다시 불러오기" : "Try loading again"}
              </button>
            )}
            <a className="primary" href="/">
              {t("sharing.makeOwn")}
            </a>
          </div>
        ) : !data ? (
          <p className="shared-state-card" role="status">
            {language === "ko"
              ? "공유 일정을 불러오고 있어요…"
              : "Loading the shared itinerary…"}
          </p>
        ) : (
          <>
            <span className="badge">
              {t("sharing.readOnly")} · v{data.revision}
            </span>
            <h1>{data.title}</h1>
            <p className="notice-box">{t("sharing.visitWarning")}</p>
            {data.provenance === "demo" && (
              <p className="demo-banner">{t("sharing.demo")}</p>
            )}
            <div className="shared-view-controls">
              <div
                className="day-tabs"
                role="group"
                aria-label={t("planner.dates")}
              >
                {data.days.map((day, index) => (
                  <button
                    key={day.date}
                    aria-pressed={index === dayIndex}
                    onClick={() => setDayIndex(index)}
                  >
                    {t("planner.day", { n: index + 1 })}
                    <small>{day.date}</small>
                  </button>
                ))}
              </div>
              <div
                className="itinerary-view-toggle"
                role="group"
                aria-label={t("planner.view")}
              >
                <button
                  aria-pressed={view === "map"}
                  onClick={() => setView("map")}
                >
                  {t("planner.mapView")}
                </button>
                <button
                  aria-pressed={view === "timeline"}
                  onClick={() => setView("timeline")}
                >
                  {t("planner.timelineView")}
                </button>
              </div>
            </div>
            {view === "timeline" ? (
              <div className="reference-timeline">
                {day?.stops.map((stop) => (
                  <article key={stop.id} className="reference-stop">
                    <span className="reference-time">
                      <time dateTime={stop.startAt}>{stop.start}</time>
                      <i />
                    </span>
                    <PlacePhoto
                      id={stop.place.photoId}
                      name={stop.place.name}
                      className="reference-photo"
                    />
                    <div className="reference-stop-copy">
                      <strong>{stop.place.name}</strong>
                      <small>
                        {stop.start}–{stop.end} · {t(`stop.${stop.purpose}`)}
                      </small>
                      <p>{stop.place.address}</p>
                      <small>
                        {stop.place.source.provider} ·{" "}
                        {stop.place.source.observedAt.slice(0, 10)}
                      </small>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelected(stop.place.id);
                          setView("map");
                        }}
                      >
                        <MapPin size={14} />
                        {t("planner.openMap")}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="reference-map">
                <Suspense fallback={<p role="status">{t("common.loading")}</p>}>
                  <PlaceMap
                    places={places}
                    selected={selected}
                    onSelect={(place) => setSelected(place.id)}
                    center={[
                      regionForDestination(data.destination).lng,
                      regionForDestination(data.destination).lat,
                    ]}
                    caption={regionForDestination(data.destination)[language]}
                  />
                </Suspense>
              </div>
            )}
            <p className="fine-print">
              {t("sharing.sharedAt", {
                date: new Date(data.sharedAt).toLocaleDateString(
                  language === "ko" ? "ko-KR" : "en-US",
                ),
              })}
            </p>
            <a className="primary full" href="/">
              {t("sharing.makeOwn")}
            </a>
          </>
        )}
      </main>
    </div>
  );
}
