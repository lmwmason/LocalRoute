import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Clock3,
  Compass,
  ImageOff,
  ListOrdered,
  Map,
  MapPin,
  PencilLine,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { LanguageSwitch, useI18n } from "./i18n";
import { AccountEntry } from "./components/AccountEntry";
import { useLandingAccount } from "./landing/useLandingAccount";
import { landingPlaces } from "./landing/places";
import "./landing.css";

export default function LandingPage() {
  const { language } = useI18n();
  const ko = language === "ko",
    index = ko ? 0 : 1;
  const navigate = useNavigate();
  const account = useLandingAccount(),
    member = account === "member";
  const [view, setView] = useState<"timeline" | "map">("timeline");
  const say = (korean: string, english: string) => (ko ? korean : english);
  return (
    <div className="landing" lang={language}>
      <a className="landing-skip" href="#landing-main">
        {say("본문으로 바로 가기", "Skip to content")}
      </a>
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link
            to="/"
            className="landing-brand"
            aria-label={say("LocalRoute 홈", "LocalRoute home")}
          >
            <img src="/localroute-logo.png" alt="" width="44" height="48" />
            <span>
              Local<span>Route</span>
            </span>
          </Link>
          <nav
            className="landing-desktop-nav"
            aria-label={say("주요 메뉴", "Main navigation")}
          >
            <a href="#how-it-works">
              {say("여행을 만드는 방법", "How it works")}
            </a>
            <Link to="/discover">{say("장소 둘러보기", "Explore places")}</Link>
          </nav>
          <div className="landing-header-actions">
            <LanguageSwitch />
            <AccountEntry
              member={member || account === "unconfirmed"}
              onClick={() =>
                navigate(
                  member || account === "unconfirmed" ? "/account" : "/login",
                )
              }
            />
          </div>
        </div>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section
          className="landing-hero landing-container"
          aria-labelledby="landing-title"
        >
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">
              <span /> LOCAL PICKS. YOUR PACE.
            </p>
            <h1 id="landing-title">
              {say("현지인의 발견이,", "Local discoveries.")}
              <br />
              <span>{say("나만의 여행 시간표로.", "Your kind of day.")}</span>
            </h1>
            <p className="landing-lead">
              {say(
                "현지인 추천으로 만드는 시간표 있는 여행.",
                "A timed travel itinerary, inspired by local recommendations.",
              )}
              <br />
              {say(
                "가고 싶은 곳과 하고 싶은 일을, 내 하루의 속도에 맞춰 연결하세요.",
                "Connect the places you want to go and the things you love, at your own pace.",
              )}
            </p>
            <div className="landing-hero-cta">
              <Link className="landing-button landing-primary" to="/plan">
                {say("여행 계획하기", "Plan a trip")}
                <ArrowRight size={19} aria-hidden="true" />
              </Link>
              <Link className="landing-button landing-secondary" to="/discover">
                {say("장소 둘러보기", "Explore places")}
                <Compass size={18} aria-hidden="true" />
              </Link>
            </div>
            <p className="landing-access-note">
              <Check size={15} aria-hidden="true" />
              {say(
                "가입 없이 둘러보고, 준비되면 시작하세요.",
                "Look around without signing up. Start when you’re ready.",
              )}
            </p>
            <a className="landing-scroll-link" href="#how-it-works">
              {say(
                "어떻게 만드는지 볼까요?",
                "See how your day comes together",
              )}
              <ArrowDown size={15} aria-hidden="true" />
            </a>
          </div>

          <div className="landing-preview-wrap">
            <div
              className="landing-preview"
              aria-label={say(
                "시간표와 지도 흐름 예시",
                "Timetable and map flow example",
              )}
            >
              <div className="landing-preview-top">
                <span>
                  <span className="landing-blue-dot" />
                  {say("나의 여행 시간표", "Your travel timetable")}
                </span>
                <span className="landing-example-label">
                  {say("미리보기", "PREVIEW")}
                </span>
              </div>
              <div className="landing-preview-title">
                <div>
                  <p>SEOUL · SEONGSU</p>
                  <h2>
                    {say("느긋하게, 성수의 하루", "A slower day in Seongsu")}
                  </h2>
                </div>
                <span className="landing-day">
                  DAY
                  <br />
                  <b>01</b>
                </span>
              </div>
              <div className="landing-preview-tags">
                <span>
                  <Clock3 size={14} aria-hidden="true" />
                  {say("내 속도대로", "At your pace")}
                </span>
                <span>
                  {say("산책 · 미식 · 문화", "Nature · Food · Culture")}
                </span>
              </div>
              <div
                className="landing-view-switch"
                role="group"
                aria-label={say("예시 보기 방식", "Example view")}
              >
                <button
                  aria-pressed={view === "timeline"}
                  onClick={() => setView("timeline")}
                >
                  <ListOrdered size={16} aria-hidden="true" />
                  {say("시간표", "Timetable")}
                </button>
                <button
                  aria-pressed={view === "map"}
                  onClick={() => setView("map")}
                >
                  <Map size={16} aria-hidden="true" />
                  {say("지도 흐름", "Map flow")}
                </button>
              </div>
              {view === "timeline" ? (
                <ol className="landing-timeline">
                  {landingPlaces.map((place, i) => (
                    <li key={place.name}>
                      <time>{place.time}</time>
                      <span className="landing-stop-number">{i + 1}</span>
                      <div className="landing-stop">
                        <span
                          className="landing-photo-empty"
                          aria-label={say(
                            "장소 사진 없음",
                            "Place photo unavailable",
                          )}
                        >
                          <ImageOff size={20} aria-hidden="true" />
                        </span>
                        <div>
                          <span>{place.kind[index]}</span>
                          <h3>{ko ? place.name : place.en}</h3>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="landing-map-flow">
                  <svg viewBox="0 0 400 255" aria-hidden="true">
                    <path
                      className="landing-flow-line"
                      d="M75 55 C240 15 300 65 285 115 S60 130 105 215"
                    />
                    <path
                      className="landing-flow-back"
                      d="M10 100 H390 M10 180 H390 M180 10 V245 M345 10 V245"
                    />
                  </svg>
                  {landingPlaces.map((place, i) => (
                    <div
                      className={`landing-map-stop landing-map-stop-${i}`}
                      key={place.name}
                    >
                      <b>{i + 1}</b>
                      <span>{ko ? place.name : place.en}</span>
                    </div>
                  ))}
                  <p>
                    {say(
                      "순서만 보여주는 도식 · 실제 지도·이동 경로 아님",
                      "Sequence diagram · not a geographic map or travel route",
                    )}
                  </p>
                </div>
              )}
              <div className="landing-preview-bottom">
                <PencilLine size={16} aria-hidden="true" />
                <span>
                  {say(
                    "시간표로 보고, 지도로 살피고, 내게 맞게 편집",
                    "See the times. Explore the map. Make it yours.",
                  )}
                </span>
              </div>
            </div>
            <p className="landing-example-note">
              {say(
                "실제 장소 자료로 구성한 화면 예시입니다. 시간은 임의 예시이며, 현지인 추천·영업·예약·교통 확인 결과가 아닙니다.",
                "An interface example using researched real places. Times are illustrative; local endorsements, opening hours, bookings and transport are not verified.",
              )}
            </p>
          </div>
        </section>

        <section
          id="how-it-works"
          className="landing-how"
          aria-labelledby="landing-how-title"
        >
          <div className="landing-container">
            <p className="landing-eyebrow">A DAY THAT FITS YOU</p>
            <h2 id="landing-how-title">
              {say("취향에서 시작해,", "From what you love,")}
              <br />
              {say("하루의 흐름까지.", "to a day that flows.")}
            </h2>
            <div className="landing-steps">
              {[
                {
                  icon: SlidersHorizontal,
                  title: say(
                    "어떤 여행을 원하나요?",
                    "Start with your kind of trip",
                  ),
                  text: say(
                    "목적과 취향, 쓸 수 있는 시간과 이동 수단을 골라요.",
                    "Choose your purpose, interests, available time and travel mode.",
                  ),
                  detail: say(
                    "산책 · 맛집 · 문화 · 나의 속도",
                    "Nature · Food · Culture · Your pace",
                  ),
                },
                {
                  icon: MapPin,
                  title: say(
                    "장소에 이유를 더해요",
                    "Give every stop a reason",
                  ),
                  text: say(
                    "지역의 실제 장소와 현지인의 추천을 살펴보고, 가고 싶은 곳을 연결해요.",
                    "Explore real regional places and local recommendations, then connect the stops that speak to you.",
                  ),
                  detail: say(
                    "장소의 출처와 추천을 구분해서",
                    "Place sources and local voices, kept distinct",
                  ),
                },
                {
                  icon: PencilLine,
                  title: say(
                    "내 하루에 맞춰 다듬어요",
                    "Make the day your own",
                  ),
                  text: say(
                    "시간표와 지도를 함께 보며 순서와 머무는 시간을 조정해요.",
                    "Use the timetable and map to adjust the order and time at each stop.",
                  ),
                  detail: say(
                    "확인되지 않은 정보는 따로 안내",
                    "Unverified details stay clearly marked",
                  ),
                },
              ].map(({ icon: Icon, title, text, detail }, i) => (
                <article key={title}>
                  <div className="landing-step-head">
                    <span>0{i + 1}</span>
                    <Icon size={23} aria-hidden="true" />
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <span className="landing-step-detail">{detail}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="landing-sources landing-container"
          aria-labelledby="landing-sources-title"
        >
          <div className="landing-section-intro">
            <p className="landing-eyebrow">REAL PLACES, CLEAR SOURCES</p>
            <h2 id="landing-sources-title">
              {say(
                "좋은 여행의 시작은, 실제 장소.",
                "Real places. A grounded start.",
              )}
            </h2>
            <p>
              {say(
                "서울 성수동과 충주시의 초기 장소 자료부터 준비하고 있어요. 기관 자료와 현지인의 추천은 다르게 표시합니다.",
                "We’re starting with researched places in Seongsu, Seoul and Chungju. Official information and local endorsements are shown separately.",
              )}
            </p>
          </div>
          <div className="landing-source-grid">
            {landingPlaces.map((place, i) => (
              <article key={place.name}>
                <span className="landing-source-index">0{i + 1} / SEONGSU</span>
                <h3>{ko ? place.name : place.en}</h3>
                <p>
                  {say(
                    "공식 관광 자료 기반 · 현지인 추천 미수집",
                    "Official tourism source · no local endorsement collected",
                  )}
                </p>
                <a
                  href={place.source}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {say(
                    "한국관광공사 출처 보기 (새 창)",
                    "View Korea Tourism Organization source (new tab)",
                  )}
                  <ArrowRight size={16} aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
          <p className="landing-source-note">
            {say(
              "자료 확인: 2026.10.17 · 현재 영업·개방, 이동 경로, 사진 이용권은 미확인입니다. 장소 사진과 후기는 임의로 채우지 않습니다.",
              "Sources checked: 17 Oct 2026. Current opening, access, travel routes and photo rights are unverified. We do not fill gaps with invented photos or reviews.",
            )}
          </p>
        </section>

        <section
          className="landing-account-section landing-container"
          aria-labelledby="landing-account-title"
        >
          <div>
            <p className="landing-eyebrow">
              <ShieldCheck size={16} aria-hidden="true" />
              {member
                ? say("회원으로 이용 중", "SIGNED IN")
                : account === "checking"
                  ? say("계정 확인 중", "CHECKING ACCOUNT")
                  : account === "unconfirmed"
                    ? say("이메일 확인 필요", "EMAIL VERIFICATION NEEDED")
                    : say("지금은 비회원이에요", "YOU’RE BROWSING AS A GUEST")}
            </p>
            <h2 id="landing-account-title">
              {member
                ? say("다음 여행도, 이어서.", "Pick up your next adventure.")
                : say(
                    "먼저 둘러보세요. 가입은 그다음에.",
                    "Explore first. Join when you’re ready.",
                  )}
            </h2>
            <p>
              {member
                ? say(
                    "내 일정에서 여행을 이어가고, 계정에서 내 정보를 확인하세요.",
                    "Continue from your itineraries or visit your account.",
                  )
                : say(
                    "장소 둘러보기는 로그인 없이 가능해요. 이 브라우저의 장소 담기와 회원의 일정 저장은 달라요. 계정에 일정 저장·공유는 로그인과 이메일 확인이 필요합니다.",
                    "Explore without signing in. Places kept in this browser are separate from account itineraries. Saving and sharing account itineraries require sign-in and email verification.",
                  )}
            </p>
          </div>
          <div className="landing-account-cta">
            {member ? (
              <>
                <Link className="landing-button landing-primary" to="/plan">
                  {say("내 일정", "My itineraries")}
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <Link
                  className="landing-button landing-secondary"
                  to="/account"
                >
                  {say("내 계정", "My account")}
                </Link>
              </>
            ) : (
              <>
                <Link
                  className="landing-button landing-primary"
                  to={account === "unconfirmed" ? "/account" : "/login"}
                >
                  {account === "unconfirmed"
                    ? say("이메일 확인 안내", "Verify your email")
                    : say("로그인 / 회원가입", "Sign in / Sign up")}
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <Link
                  className="landing-button landing-secondary"
                  to="/discover"
                >
                  {say("가입 없이 둘러보기", "Browse without signing up")}
                </Link>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="landing-footer landing-container">
        <div>
          <span className="landing-footer-brand">
            Local<span>Route</span>
          </span>
          <p>
            {say(
              "동네의 발견이 여행이 되는 곳",
              "Where local discoveries become your journey",
            )}
          </p>
          <small>© LocalRoute · just_grassy</small>
        </div>
        <nav aria-label={say("법적 안내", "Legal information")}>
          {(
            [
              ["privacy", "개인정보 처리방침", "Privacy"],
              ["terms", "이용약관", "Terms"],
              ["transfers", "국외 이전·처리위탁", "Overseas processing"],
              ["location", "위치정보 안내", "Location information"],
            ] as const
          ).map(([path, korean, english]) => (
            <Link key={path} to={`/legal/${path}`}>
              {say(korean, english)}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
