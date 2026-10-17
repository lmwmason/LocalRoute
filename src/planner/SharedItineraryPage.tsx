import { lazy, Suspense, useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { regionForDestination } from "../../shared/planner";
import type { SharedItinerary } from "../../shared/sharing";
import type { Place } from "../../shared/domain";
import { api } from "../api";
import { LanguageSwitch, useI18n } from "../i18n";
import { PlacePhoto } from "../components/PlacePhoto";
const PlaceMap = lazy(() => import("../components/Map"));
export default function SharedItineraryPage() {
  const { t, language } = useI18n();
  const [data, setData] = useState<SharedItinerary | null>(null),
    [error, setError] = useState(""),
    [dayIndex, setDayIndex] = useState(0),
    [view, setView] = useState<"timeline" | "map">("timeline"),
    [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex,nofollow,noarchive";
    document.head.append(robots);
    let active = true;
    const token = location.pathname.split("/")[2] || "";
    api
      .shared(token)
      .then((data) => {
        if (active) setData(data);
      })
      .catch(() => {
        if (active) setError("sharing.unavailable");
      });
    return () => {
      active = false;
      robots.remove();
    };
  }, []);
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
        <a className="brand" href="/">
          <img src="/localroute-logo.png" alt="LocalRoute" />
          <span className="brand-word">
            Local<span>Route</span>
          </span>
        </a>
        <LanguageSwitch />
      </header>
      <main>
        {error ? (
          <div className="empty-state">
            <h1>{t(error)}</h1>
            <a className="primary" href="/">
              {t("sharing.makeOwn")}
            </a>
          </div>
        ) : !data ? (
          <p role="status">{t("common.loading")}</p>
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
