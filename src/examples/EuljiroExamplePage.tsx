import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Coffee, Copy, MapPin } from "lucide-react";
import { BrandLink } from "../components/BrandLink";
import { LanguageSwitch, useI18n } from "../i18n";
import type { Place } from "../../shared/domain";
import {
  euljiroExample,
  euljiroExamplePath,
  type EuljiroPlaceKey,
} from "../../shared/euljiro-example";
import "./euljiro-example.css";
import { api } from "../api";

const Map = lazy(() => import("../components/Map"));
const mapPlaces: Place[] = euljiroExample.stops.map((stop) => ({
  id: `example:${stop.key}`,
  name: stop.name,
  kind: stop.kind,
  category: stop.kind,
  address: stop.address,
  lat: stop.lat,
  lng: stop.lng,
  tags: [],
  endorsements: [],
  source: "localroute",
  rating: null,
  reviewCount: 0,
}));
const copy = {
  ko: {
    eyebrow: "실제 장소로 보는 시연 일정",
    title: "을지로, 한 끼와 커피 사이",
    intro:
      "우래옥에서 점심을 먹고, 하이드미플리즈 을지로점에서 쉬었다가 탑골공원으로 이어지는 공개 예시예요.",
    notice: "0 LP · 사전 작성한 공개 예시 · 이용자 개인정보 없음",
    timing:
      "아래 시각은 날짜가 정해지지 않은 계획 시간이에요. 해당 날짜의 영업·개방 여부와 대기·예약은 확인되지 않았어요.",
    map: "장소를 누르면 지도에서 함께 확인할 수 있어요",
    planTime: "계획 시간 · 한국 시간",
    sourceListing: "출처를 확인한 운영자 예시 · 현지인 후기와 별도",
    hours: "당일 영업·개방 미확인",
    photos: "실제 사진 미등록",
    source: "정보 출처",
    checked: "자료 확인",
    details: "LocalRoute 장소 보기",
    directions: "지도에서 길찾기",
    buffer: "이동·대기 여유 구간",
    bufferNote: "예약된 여유 시간이며, 조회한 교통 소요시간이 아니에요.",
    booking: "하이드미플리즈 예약은 확인 중이에요",
    bookingBody:
      "HeyYumi 매장 ID·파트너 예약 지원과 연동 계정 권한이 확인되지 않았어요. 이 화면에서는 예약 요청을 보내지 않아요.",
    bookingDisabled: "자동 예약 지원 미확인",
    external: "카페 대관 안내 보기 · 외부",
    externalNote:
      "Spacecloud는 대관 안내예요. 일반 좌석 예약이나 특정 시각의 빈자리를 보장하지 않아요.",
    back: "여행 계획으로",
    share: "공개 예시 링크 복사",
    copied: "링크를 복사했어요.",
    copyFallback: "이 주소를 직접 복사해 주세요.",
    own: "내 여행 계획하기",
    unknownTravel: "실제 교통 소요시간 미조회 · 지도에서 경로를 확인해 주세요.",
    summaries: [
      "공식 관광정보에서 이름과 위치를 확인한 식당을 점심 구간에 배치했어요. 현지인의 방문 후기를 수집한 추천은 아니에요.",
      "운영사와 공간 소개 자료에서 주소를 확인한 실제 카페예요. 커피를 마시며 쉬는 구간으로 배치했어요.",
      "공식 서울 관광정보에서 확인한 공원이에요. 카페 이후 역사 공간을 둘러보는 흐름으로 구성했어요.",
    ],
  },
  en: {
    eyebrow: "A sample itinerary with real places",
    title: "Euljiro: lunch, coffee and a little history",
    intro:
      "Lunch at Wooraeok, a break at Hide Me Please Euljiro, then a visit to Tapgol Park. A public example you can explore.",
    notice: "0 LP · Prepared public example · No traveler personal information",
    timing:
      "These are planned times without a travel date. Opening on your date, queues and reservations have not been verified.",
    map: "Select a stop to find it on the map",
    planTime: "Planned time · Korea Standard Time",
    sourceListing:
      "Source-based operator example · separate from local feedback",
    hours: "Opening on your date unverified",
    photos: "Real photo not registered",
    source: "Information source",
    checked: "Sources checked",
    details: "View LocalRoute place",
    directions: "Open directions in map",
    buffer: "Reserved travel and waiting buffer",
    bufferNote: "This is reserved time, not a retrieved travel-time estimate.",
    booking: "Booking support for Hide Me Please is unverified",
    bookingBody:
      "Its HeyYumi place ID, partner booking support and our integration account permissions are unverified. This page does not submit reservation requests.",
    bookingDisabled: "Automatic booking unverified",
    external: "View venue-hire listing · external",
    externalNote:
      "Spacecloud lists venue hire. It does not guarantee an individual table booking or availability at a particular time.",
    back: "Back to travel planning",
    share: "Copy public example link",
    copied: "Link copied.",
    copyFallback: "Copy this address manually.",
    own: "Plan my own trip",
    unknownTravel:
      "Travel times have not been retrieved. Check the route in your map app.",
    summaries: [
      "A real restaurant checked against official tourism information, placed in the lunch window. This is not a recommendation based on a local contributor's visit.",
      "A real cafe whose address is supported by its operator and venue listing. A planned stop to pause for coffee.",
      "A park listed by Seoul's official tourism service. A history stop after the cafe break.",
    ],
  },
};
export default function EuljiroExamplePage({
  canonicalPlaceIds = {},
}: {
  canonicalPlaceIds?: Partial<Record<EuljiroPlaceKey, string>>;
}) {
  const { language } = useI18n(),
    text = copy[language];
  const [selected, setSelected] = useState(mapPlaces[1].id);
  const [sharing, setSharing] = useState<"copied" | "manual" | null>(null);
  const [catalog, setCatalog] = useState<Place[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    api
      .places(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && Array.isArray(data.places))
          setCatalog(data.places);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const selectedPlace = mapPlaces.find((place) => place.id === selected)!;
  const shareUrl = new URL(euljiroExamplePath, window.location.origin).href;
  return (
    <div className="euljiro-example">
      <header className="example-header">
        <BrandLink />
        <LanguageSwitch />
      </header>
      <main>
        <Link className="example-back" to="/plan">
          <ArrowLeft size={18} />
          {text.back}
        </Link>
        <section className="example-intro">
          <p className="example-eyebrow">{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p>{text.intro}</p>
          <div className="example-meta">
            <span>11:30–15:30</span>
            <span>서울 중구 · 종로구</span>
            <span>0 LP</span>
          </div>
          <p className="example-public-note">{text.notice}</p>
          <p className="example-timing-note">{text.timing}</p>
        </section>
        <div className="example-layout">
          <section className="example-stops" aria-label={text.planTime}>
            {euljiroExample.stops.map((stop, index) => {
              const id = `example:${stop.key}`;
              const matching = catalog.filter(
                (place) =>
                  place.name === stop.name &&
                  place.address === stop.address &&
                  place.officialSources?.some((source) =>
                    stop.sources.some((known) => known.url === source.url),
                  ),
              );
              const supplied = canonicalPlaceIds[stop.key];
              const canonicalId =
                supplied &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  supplied,
                )
                  ? supplied
                  : matching.length === 1
                    ? matching[0].id
                    : undefined;
              const verifiedId =
                canonicalId &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  canonicalId,
                )
                  ? canonicalId
                  : null;
              return (
                <div key={stop.key}>
                  {index > 0 && (
                    <div className="example-buffer">
                      <span>
                        {euljiroExample.stops[index - 1].end}–{stop.start} ·{" "}
                        {text.buffer}
                      </span>
                      <small>{text.bufferNote}</small>
                    </div>
                  )}
                  <article
                    className={`example-stop ${selected === id ? "selected" : ""}`}
                  >
                    <button
                      className="example-stop-select"
                      onClick={() => setSelected(id)}
                      aria-pressed={selected === id}
                    >
                      <span className="example-stop-number">{index + 1}</span>
                      <span>
                        <small>
                          {stop.start}–{stop.end} · {text.planTime}
                        </small>
                        <strong>
                          {language === "ko" ? stop.name : stop.englishName}
                        </strong>
                      </span>
                      <MapPin size={20} />
                    </button>
                    <div className="example-stop-body">
                      <p>{stop.address}</p>
                      <p>{text.summaries[index]}</p>
                      <p className="example-source-label">
                        {text.sourceListing}
                      </p>
                      <span className="example-unknown">{text.hours}</span>
                      <div className="example-photo-empty">
                        <Coffee size={20} aria-hidden="true" />
                        <span>{text.photos}</span>
                      </div>
                      <div className="example-place-actions">
                        <a
                          href={`https://map.kakao.com/link/to/${encodeURIComponent(stop.name)},${stop.lat},${stop.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {text.directions}
                          <ArrowUpRight size={16} />
                        </a>
                        {verifiedId && (
                          <Link to={`/places/${verifiedId}`}>
                            {text.details}
                          </Link>
                        )}
                      </div>
                      <details>
                        <summary>
                          {text.source} · {text.checked} 2026-10-17
                        </summary>
                        <ul>
                          {stop.sources.map((source) => (
                            <li key={source.url}>
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {source.label}
                                <ArrowUpRight size={14} />
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  </article>
                </div>
              );
            })}
          </section>
          <aside className="example-map-column">
            <div className="example-map">
              <Suspense fallback={<p role="status">{text.map}</p>}>
                <Map
                  places={mapPlaces}
                  selected={selected}
                  onSelect={(place) => setSelected(place.id)}
                  center={[selectedPlace.lng, selectedPlace.lat]}
                  caption={text.map}
                />
              </Suspense>
            </div>
            <p className="example-route-note">{text.unknownTravel}</p>
          </aside>
        </div>
        <section
          className="example-booking"
          aria-labelledby="example-booking-title"
        >
          <Coffee size={24} />
          <h2 id="example-booking-title">{text.booking}</h2>
          <p id="example-booking-note">{text.bookingBody}</p>
          <button disabled aria-describedby="example-booking-note">
            {text.bookingDisabled}
          </button>
          <a
            href="https://www.spacecloud.kr/space/59739"
            target="_blank"
            rel="noopener noreferrer"
          >
            {text.external}
            <ArrowUpRight size={16} />
          </a>
          <small>{text.externalNote}</small>
        </section>
        <footer className="example-actions">
          <Link className="primary" to="/plan/new/1">
            {text.own}
          </Link>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareUrl);
                setSharing("copied");
              } catch {
                setSharing("manual");
              }
            }}
          >
            <Copy size={18} />
            {text.share}
          </button>
          {sharing && (
            <p role="status">
              {sharing === "copied" ? text.copied : text.copyFallback}
            </p>
          )}
          {sharing === "manual" && (
            <input
              aria-label={text.share}
              readOnly
              value={shareUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
        </footer>
      </main>
    </div>
  );
}
