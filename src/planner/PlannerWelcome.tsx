import { lazy, Suspense, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { demoCatalog, demoSchedule } from "../../shared/planner-demo";
import type { TripInput } from "../../shared/planner";
import type { Place } from "../../shared/domain";
import { config } from "../config";
import { useI18n } from "../i18n";
import { PlacePhoto } from "../components/PlacePhoto";
const PlaceMap = lazy(() => import("../components/Map"));
export function PlannerWelcome({
  input,
  onPurpose,
  onActivity,
  onStart,
}: {
  input: TripInput;
  onPurpose: (value: TripInput["purpose"]) => void;
  onActivity: (value: TripInput["activities"][number]) => void;
  onStart: () => void;
}) {
  const { t, language } = useI18n();
  const [view, setView] = useState<"timeline" | "map">("timeline"),
    [showPreferences, setShowPreferences] = useState(true),
    [selected, setSelected] = useState<string | null>(null);
  const demo = demoSchedule({
    ...input,
    startTime: "09:30",
    endTime: "20:00",
    endDate: input.startDate,
  });
  const candidates = demo.days[0].stops.map((stop) => ({
    stop,
    place: demoCatalog.find((p) => p.id === stop.candidateId)!,
  }));
  const mapPlaces = candidates.map(({ place }): Place => ({
    ...place,
    category: place.kind,
    endorsements: [],
    source: "demo",
    rating: null,
    reviewCount: 0,
  }));
  return (
    <div className="planner-app-home">
      {showPreferences ? (
        <section className="travel-preferences">
          <div className="preference-title">
            <h1>{t("planner.preferencesTitle")}</h1>
            <button
              className="icon-button"
              aria-label={t("planner.hidePreferences")}
              onClick={() => setShowPreferences(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="preference-chips">
            {(["food", "culture", "relax"] as const).map((p) => (
              <button
                key={p}
                aria-pressed={input.purpose === p}
                onClick={() => onPurpose(p)}
              >
                {t(`preference.${p}`)}
              </button>
            ))}
            <button
              aria-pressed={input.activities.includes("shopping")}
              onClick={() => onActivity("shopping")}
            >
              {t("activity.shopping")}
            </button>
            <button
              aria-pressed={input.purpose === "explore"}
              onClick={() => onPurpose("explore")}
            >
              {t("preference.explore")}
            </button>
            <button
              aria-pressed={input.activities.includes("coffee")}
              onClick={() => onActivity("coffee")}
            >
              {t("preference.coffee")}
            </button>
          </div>
        </section>
      ) : (
        <button
          className="text-button"
          onClick={() => setShowPreferences(true)}
        >
          {t("planner.preferencesTitle")}
        </button>
      )}
      <div className="home-itinerary-heading">
        <h2>
          {config.demo
            ? `Day 1 · ${language === "ko" ? "서울 성수동" : "Seongsu, Seoul"}`
            : t("planner.mySchedules")}
        </h2>
        <div
          className="itinerary-view-toggle"
          role="group"
          aria-label={t("planner.view")}
        >
          <button aria-pressed={view === "map"} onClick={() => setView("map")}>
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
      {config.demo ? (
        <>
          <p className="sample-disclosure">{t("planner.sampleLabel")}</p>
          {view === "timeline" ? (
            <div className="reference-timeline">
              {candidates.map(({ stop, place }) => (
                <button
                  className="reference-stop"
                  key={place.id}
                  onClick={onStart}
                >
                  <span className="reference-time">
                    {stop.start}
                    <i />
                  </span>
                  <PlacePhoto name={place.name} className="reference-photo" />
                  <span className="reference-stop-copy">
                    <strong>{place.name.replace(" · 가상", "")}</strong>
                    <small>
                      {t(`stop.${stop.purpose}`)} · {t(`places.${place.kind}`)}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="reference-map">
              <Suspense fallback={<p role="status">{t("common.loading")}</p>}>
                <PlaceMap
                  places={mapPlaces}
                  selected={selected}
                  onSelect={(p) => setSelected(p.id)}
                />
              </Suspense>
              <p className="fine-print">{t("planner.routeUnknown")}</p>
            </div>
          )}
        </>
      ) : (
        <div className="planner-empty">
          <Search size={26} />
          <h2>{t("planner.emptyTitle")}</h2>
          <p>{t("planner.emptyHelp")}</p>
        </div>
      )}
      <button className="primary full start-itinerary" onClick={onStart}>
        {t("planner.start")}
        <ArrowRight size={18} />
      </button>
      <p className="fine-print">{t("planner.noChargeFailure")}</p>
    </div>
  );
}
