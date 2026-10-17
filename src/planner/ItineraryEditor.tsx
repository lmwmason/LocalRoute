import { lazy, Suspense, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  MapPin,
  Pin,
  Printer,
  RefreshCw,
  Share2,
  Utensils,
} from "lucide-react";
import type { Itinerary, Schedule } from "../../shared/planner";
import {
  distanceMeters,
  evaluateSchedule,
  regionForDestination,
  stopTimestamp,
  minutes,
} from "../../shared/planner";
import type { Place } from "../../shared/domain";
import { useI18n } from "../i18n";
import { api } from "../api";
import { PlacePhoto } from "../components/PlacePhoto";
import { PlaceOrigin } from "../components/PlaceOrigin";
import { ShareItinerary } from "./ShareItinerary";
import { TransportLeg } from "./TransportLeg";
import { BookingButton } from "../booking/BookingButton";
import { bookingApi } from "../booking/client";
const PlaceMap = lazy(() => import("../components/Map"));
export function ItineraryEditor({
  itinerary,
  onSaved,
  onRegenerate,
}: {
  itinerary: Itinerary;
  onSaved: (itinerary: Itinerary) => void;
  onRegenerate: (pins: string[]) => void;
}) {
  const { t, language } = useI18n();
  const [sharing, setSharing] = useState(false);
  const [view, setView] = useState<"timeline" | "map">("timeline");
  const [schedule, setSchedule] = useState<Schedule>(() =>
      structuredClone(itinerary.schedule),
    ),
    [dayIndex, setDayIndex] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pins, setPins] = useState<string[]>([]);
  const evaluation = useMemo(
    () => evaluateSchedule(schedule, itinerary.input, itinerary.catalog),
    [schedule, itinerary],
  );
  const byId = new Map(itinerary.catalog.map((c) => [c.id, c])),
    day = schedule.days[dayIndex];
  const mapPlaces = day.stops
    .map((s) => byId.get(s.candidateId))
    .filter((c) => Boolean(c))
    .map((c): Place => ({
      id: c!.id,
      name: c!.name,
      photo: c!.photo,
      category: c!.kind,
      address: c!.address,
      lat: c!.lat,
      lng: c!.lng,
      tags: c!.tags,
      rating: null,
      reviewCount: 0,
      endorsements: [],
      source: c!.source.provider === "demo" ? "demo" : "localroute",
    }));
  function change(
    index: number,
    patch: Partial<Schedule["days"][number]["stops"][number]>,
  ) {
    setSchedule((old) => ({
      ...old,
      days: old.days.map((d, i) =>
        i === dayIndex
          ? {
              ...d,
              stops: d.stops.map((s, j) =>
                j === index ? { ...s, ...patch } : s,
              ),
            }
          : d,
      ),
    }));
    setDirty(true);
    setError("");
  }
  function reorder(index: number, direction: -1 | 1) {
    const stops = [...day.stops],
      next = index + direction;
    if (next < 0 || next >= stops.length) return;
    [stops[index], stops[next]] = [stops[next], stops[index]];
    // Keep the time slots; reassign exact places, not invented route durations. Validation decides whether this edit is usable.
    const changed = stops.map((s, i) => ({
      ...s,
      start: day.stops[i].start,
      end: day.stops[i].end,
    }));
    setSchedule((old) => ({
      ...old,
      days: old.days.map((d, i) =>
        i === dayIndex ? { ...d, stops: changed } : d,
      ),
    }));
    setDirty(true);
  }
  async function save() {
    if (busy || !evaluation.valid) return;
    setBusy(true);
    setError("");
    try {
      const updated =
        itinerary.provenance === "demo"
          ? {
              ...itinerary,
              schedule,
              evaluation,
              revision: itinerary.revision + 1,
            }
          : await api.savePlan(itinerary.id, itinerary.revision, schedule);
      onSaved(updated);
      setDirty(false);
      setError(t("planner.saved"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="itinerary-editor">
      <div className="result-topline">
        <div>
          <span className="eyebrow">{t("planner.result")}</span>
          <h1>{schedule.title}</h1>
          <p className="intro-copy">{schedule.summary}</p>
        </div>
        <div className="result-tools">
          <button
            className="icon-button"
            aria-label={t("sharing.title")}
            disabled={dirty || busy}
            onClick={() => setSharing(true)}
          >
            <Share2 size={20} />
          </button>
          <button
            className="icon-button print-button"
            aria-label={t("planner.print")}
            onClick={() => window.print()}
          >
            <Printer size={20} />
          </button>
        </div>
      </div>
      {itinerary.provenance === "demo" && (
        <p className="demo-banner">{t("planner.demoNotice")}</p>
      )}
      {itinerary.provenance === "operator_example" && (
        <p className="demo-banner" role="note">
          {language === "ko"
            ? "운영자 예약 시연 일정 · 0 LP · 예약 확정 아님. 날짜별 영업시간과 예약 가능 시간은 미확인입니다. 지원 매장은 별도 정보 확인·동의 후 직접 예약 요청해야 해요."
            : "Operator reservation example · 0 LP · No booking confirmed. Opening hours and booking availability for these dates are unverified. Supported venues require a separate review, consent and reservation submission."}
        </p>
      )}
      <div className="quality-strip">
        <span>
          <Check size={15} />
          {t("planner.localMeals", { n: evaluation.checks.localMeals })}
        </span>
        <span>
          <Check size={15} />
          {t("planner.preferenceMatches", {
            n: evaluation.checks.preferenceMatches,
          })}
        </span>
        <span>
          <Clock size={15} />
          {t("planner.routeUnknown")}
        </span>
      </div>
      <div className="day-tabs" role="group" aria-label={t("planner.dates")}>
        {schedule.days.map((d, i) => (
          <button
            key={d.date}
            className={i === dayIndex ? "active" : ""}
            onClick={() => setDayIndex(i)}
          >
            {t("planner.day", { n: i + 1 })}
            <small>{d.date}</small>
          </button>
        ))}
      </div>
      <div
        className="itinerary-view-toggle result-view-toggle"
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
      <div className="schedule-layout" data-view={view}>
        <div className="timeline">
          {day.stops.map((stop, index) => {
            const candidate = byId.get(stop.candidateId)!;
            if (!candidate) return null;
            const previous = index
              ? byId.get(day.stops[index - 1].candidateId)
              : undefined;
            const transport =
              !dirty && previous
                ? itinerary.transport?.find(
                    (leg) =>
                      leg.date === day.date &&
                      leg.fromId === previous.id &&
                      leg.toId === candidate.id,
                  )
                : undefined;
            return (
              <div className="timeline-entry" key={`${day.date}:${index}`}>
                {index > 0 && transport ? (
                  <TransportLeg
                    leg={transport.leg}
                    availableSeconds={
                      (minutes(stop.start) -
                        minutes(day.stops[index - 1].end)) *
                      60
                    }
                    bufferSeconds={itinerary.input.transferBufferMinutes * 60}
                  />
                ) : (
                  index > 0 && (
                    <div className="transfer-note">
                      <span className="transfer-line" />
                      <span>
                        {t("planner.transfer", {
                          n: itinerary.input.transferBufferMinutes,
                        })}
                        <small>
                          {t("planner.routeUnknown")}
                          {previous
                            ? ` · ${t("planner.straightDistance", { n: (distanceMeters(previous, candidate) / 1000).toFixed(1) })}`
                            : ""}
                        </small>
                      </span>
                    </div>
                  )
                )}
                <article
                  className={`schedule-stop ${selected === candidate.id ? "is-selected" : ""}`}
                >
                  <div className="timeline-time">
                    <time dateTime={stopTimestamp(day.date, stop.start)}>
                      {stop.start}
                    </time>
                    <span>{t(`stop.${stop.purpose}`)}</span>
                  </div>
                  <div className="stop-content">
                    <PlacePhoto
                      id={candidate.photo?.id}
                      sourcePhoto={candidate.sourcePhoto}
                      displayMedia={candidate.displayMedia}
                      name={candidate.name}
                      className="stop-photo"
                    />
                    {!candidate.photo && (
                      <PlaceOrigin
                        sourcePhoto={candidate.sourcePhoto}
                        displayMedia={candidate.displayMedia}
                      />
                    )}
                    <div className="stop-title">
                      <button
                        onClick={() => {
                          setSelected(candidate.id);
                          setView("map");
                        }}
                      >
                        <h3>{candidate.name}</h3>
                      </button>
                      <button
                        className={`icon-button pin-button ${pins.includes(candidate.id) ? "pinned" : ""}`}
                        aria-label={`${t("planner.pin")} ${candidate.name}`}
                        aria-pressed={pins.includes(candidate.id)}
                        onClick={() =>
                          setPins((old) =>
                            old.includes(candidate.id)
                              ? old.filter((id) => id !== candidate.id)
                              : [...old, candidate.id],
                          )
                        }
                      >
                        <Pin size={17} />
                      </button>
                    </div>
                    <p className="stop-explanation">{stop.explanation}</p>
                    {candidate.externalIds?.some(
                      (external) => external.provider === "heyyumi" && !external.possiblyClosed,
                    ) && (
                      <BookingButton api={bookingApi} placeId={candidate.id} language={language} />
                    )}
                    <details className="stop-edit-details">
                      <summary>{t("planner.editStop")}</summary>
                      <p>{stop.explanation}</p>
                      {candidate.endorsements.length > 0 && (
                        <blockquote className="local-tip">
                          <Utensils size={14} />
                          <span>{candidate.endorsements[0].text}</span>
                        </blockquote>
                      )}
                      <div className="stop-meta">
                        <span>
                          {t("planner.source")}: {candidate.source.provider}
                        </span>
                        <span>
                          {candidate.hours?.[day.date]
                            ? "Hours from recorded source"
                            : t("planner.hoursUnknown")}
                        </span>
                      </div>
                      <div className="stop-editor-fields">
                        <label>
                          {t("planner.startTime")}
                          <input
                            type="time"
                            aria-label={`${t("planner.startTime")} ${index + 1}`}
                            value={stop.start}
                            onChange={(e) =>
                              change(index, { start: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          {t("planner.endTime")}
                          <input
                            type="time"
                            aria-label={`${t("planner.endTime")} ${index + 1}`}
                            value={stop.end}
                            onChange={(e) =>
                              change(index, { end: e.target.value })
                            }
                          />
                        </label>
                      </div>
                      <details className="replace-options">
                        <summary>{t("planner.replace")}</summary>
                        <label>
                          {t("planner.replaceWith")}
                          <select
                            value={stop.candidateId}
                            onChange={(e) => {
                              const next = byId.get(e.target.value)!;
                              change(index, {
                                candidateId: next.id,
                                explanation:
                                  language === "en"
                                    ? "You selected this alternative. Check the visit time, hours and travel buffer."
                                    : "직접 선택한 대체 장소예요. 방문 시간·영업시간·이동 여유를 다시 확인해 주세요.",
                              });
                            }}
                          >
                            {itinerary.catalog
                              .filter((c) =>
                                ["lunch", "dinner"].includes(stop.purpose)
                                  ? c.kind === "restaurant" &&
                                    c.endorsements.length
                                  : !["restaurant"].includes(c.kind),
                              )
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      </details>
                      <div className="stop-actions-row">
                        <button
                          className="icon-button"
                          aria-label={`${t("planner.moveUp")} ${index + 1}`}
                          disabled={index === 0}
                          onClick={() => reorder(index, -1)}
                        >
                          <ArrowUp size={17} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`${t("planner.moveDown")} ${index + 1}`}
                          disabled={index === day.stops.length - 1}
                          onClick={() => reorder(index, 1)}
                        >
                          <ArrowDown size={17} />
                        </button>
                        <button
                          className="text-button"
                          onClick={() => {
                            setSelected(candidate.id);
                            setView("map");
                          }}
                        >
                          <MapPin size={15} />
                          {t("planner.openMap")}
                        </button>
                        {candidate.source.provider !== "demo" && (
                          <a
                            className="text-button"
                            href={`https://map.kakao.com/link/to/${encodeURIComponent(candidate.name)},${candidate.lat},${candidate.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("planner.nav")}
                          </a>
                        )}
                      </div>
                    </details>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
        <aside className="schedule-map">
          <Suspense fallback={<div className="map-placeholder" />}>
            <PlaceMap
              places={mapPlaces}
              selected={selected}
              onSelect={(p) => setSelected(p.id)}
              center={[
                regionForDestination(itinerary.input.destination).lng,
                regionForDestination(itinerary.input.destination).lat,
              ]}
              caption={
                regionForDestination(itinerary.input.destination)[language]
              }
            />
          </Suspense>
          <p className="fine-print">{t("planner.provenance")}</p>
          <div className="quality-notices">
            <h3>{t("planner.quality")}</h3>
            {[...new Set(evaluation.warnings.map((w) => w.code))].map(
              (code) => (
                <p key={code}>{t(`quality.${code}`)}</p>
              ),
            )}
          </div>
        </aside>
      </div>
      {!evaluation.valid && (
        <div role="alert" className="error-message">
          <strong>{t("planner.invalid")}</strong>
          {[...new Set(evaluation.errors.map((e) => e.code))].map((code) => (
            <p key={code}>{t(`quality.${code}`)}</p>
          ))}
        </div>
      )}
      {error && (
        <p className="notice-box" role="status">
          {error}
        </p>
      )}
      <div className="itinerary-controls">
        {dirty && <span>{t("planner.unsaved")}</span>}
        <button
          className="secondary"
          onClick={() => {
            setSchedule(structuredClone(itinerary.schedule));
            setDirty(false);
            setError("");
          }}
        >
          {t("common.cancel")}
        </button>
        <button
          className="primary"
          onClick={save}
          disabled={!dirty || !evaluation.valid || busy}
        >
          {t("planner.saveChanges")}
        </button>
      </div>
      {pins.length > 0 && (
        <div className="regen-panel">
          <p>{t("planner.pinsNotice")}</p>
          <button
            className="secondary"
            disabled={dirty}
            onClick={() => onRegenerate(pins)}
          >
            <RefreshCw size={17} />
            {t("planner.regenerate")}
          </button>
        </div>
      )}
      {sharing && (
        <ShareItinerary
          itinerary={itinerary}
          onClose={() => setSharing(false)}
        />
      )}
    </section>
  );
}
