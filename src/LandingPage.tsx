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
  Route,
  Utensils,
  Coffee,
  Footprints,
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
        <div className="landing-hero-stage">
          <svg
            className="landing-route-art"
            viewBox="0 0 1400 850"
            fill="none"
            aria-hidden="true"
          >
            <path d="M-100 680C160 300 420 920 720 510S1170 110 1520 380" />
            <path d="M-60 760C200 380 480 990 790 590S1240 180 1590 460" />
            <circle cx="720" cy="510" r="9" />
            <circle cx="1100" cy="265" r="9" />
          </svg>
          <section
            className="landing-hero landing-container"
            aria-labelledby="landing-title"
          >
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">
                <span />{" "}
                {say(
                  "목적지는 같아도, 여행은 나답게",
                  "LOCAL PICKS. YOUR PACE.",
                )}
              </p>
              <h1 id="landing-title">
                {say("검색은 짧게.", "Less searching.")}
                <br />
                <span>{say("여행은 진하게.", "More being there.")}</span>
              </h1>
              <p className="landing-lead">
                {say(
                  "현지인 추천으로 만드는 시간표 있는 여행.",
                  "A timed travel itinerary, inspired by local recommendations.",
                )}
                <br />
                {say(
                  "먹고, 걷고, 쉬는 순간까지. 가고 싶은 곳들을 나의 하루로 연결하세요.",
                  "A good meal. A little wandering. Time to pause. Connect your places into a day worth remembering.",
                )}
              </p>
              <div className="landing-hero-cta">
                <Link
                  className="landing-button landing-primary"
                  to={
                    member
                      ? "/plan"
                      : account === "unconfirmed"
                        ? "/account"
                        : "/login"
                  }
                >
                  {say("여행 계획하기", "Plan a trip")}
                  <ArrowRight size={19} aria-hidden="true" />
                </Link>
                <Link
                  className="landing-button landing-secondary"
                  to="/discover"
                >
                  {say("장소 둘러보기", "Explore places")}
                  <Compass size={18} aria-hidden="true" />
                </Link>
              </div>
              <p className="landing-access-note">
                <Check size={15} aria-hidden="true" />
                {say(
                  "장소는 가입 없이 둘러보기 · 일정 생성은 로그인·이메일 확인 후",
                  "Browse places without signing up. Planning requires sign-in and email verification.",
                )}
              </p>
              <Link className="landing-story-link" to="/examples/euljiro">
                <span className="landing-story-link-icon">
                  <Route size={19} aria-hidden="true" />
                </span>
                <span>
                  <strong>
                    {say(
                      "이런 하루는 어때요?",
                      "What could your day look like?",
                    )}
                  </strong>
                  <small>
                    {say(
                      "을지로, 한 끼와 커피 사이 · 공개 예시",
                      "Euljiro: lunch, coffee & a little history · Public example",
                    )}
                  </small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>

            <div className="landing-preview-wrap">
              <div className="landing-preview-caption">
                <span>
                  {say(
                    "장소의 목록이, 하루의 흐름으로",
                    "FROM SAVED PLACES TO A DAY THAT FLOWS",
                  )}
                </span>
                <ArrowDown size={16} aria-hidden="true" />
              </div>
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
        </div>

        <section
          className="landing-promise-strip landing-container"
          aria-label={say("LocalRoute로 여행하는 방법", "The LocalRoute way")}
        >
          {[
            {
              icon: Compass,
              label: say(
                "현지인의 시선으로 발견",
                "Discover a local perspective",
              ),
            },
            {
              icon: Clock3,
              label: say(
                "시간표와 지도를 한눈에",
                "See your day in time and space",
              ),
            },
            {
              icon: PencilLine,
              label: say("내 속도에 맞게 편집", "Make room for your own pace"),
            },
          ].map(({ icon: Icon, label }) => (
            <div key={label}>
              <Icon size={21} aria-hidden="true" />
              <span>{label}</span>
            </div>
          ))}
        </section>

        <section
          className="landing-day-story landing-container"
          aria-labelledby="landing-day-title"
        >
          <div className="landing-day-story-copy">
            <p className="landing-eyebrow">A LITTLE TASTE OF LOCALROUTE</p>
            <h2 id="landing-day-title">
              {say("맛집 하나로 끝내기엔,", "More than a lunch spot.")}
              <br />
              <span>{say("아까운 하루니까.", "A whole day to discover.")}</span>
            </h2>
            <p>
              {say(
                "한 끼 맛있게 먹고, 커피 한 잔 쉬었다가, 골목 너머의 새로운 장소까지. 여행은 장소 사이에서 더 풍성해져요.",
                "Stay for a good meal. Pause over coffee. Find something around the next corner. Leave room for the moments in between.",
              )}
            </p>
            <Link className="landing-day-story-cta" to="/examples/euljiro">
              {say(
                "을지로의 하루, 먼저 둘러보기",
                "Take a look around Euljiro",
              )}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <small>
              {say(
                "미리 작성한 공개 예시 · 개인화 일정 생성·LP 사용 없음",
                "Prepared public example · no personalized generation or LP use",
              )}
            </small>
          </div>
          <figure className="landing-brand-illustration">
            <img
              src="/landing/brand-journey.webp"
              width="1536"
              height="1024"
              loading="lazy"
              decoding="async"
              alt={say(
                "커피와 종이 지도, 파란 동선으로 여행의 여유를 표현한 AI 브랜드 일러스트",
                "AI brand illustration of coffee, a folded paper map and a flowing blue route",
              )}
            />
            <div className="landing-illustration-tags">
              {[
                { icon: Utensils, label: say("맛있는 한 끼", "A good meal") },
                { icon: Coffee, label: say("잠깐의 여유", "Time to pause") },
                {
                  icon: Footprints,
                  label: say("새로운 발견", "A new discovery"),
                },
              ].map(({ icon: Icon, label }) => (
                <span key={label}>
                  <Icon size={15} aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>
            <figcaption>
              {say(
                "AI로 만든 브랜드 이미지 · 특정 장소나 실제 이동 경로를 묘사하지 않습니다.",
                "AI-generated brand artwork · not a depiction of a real venue or travel route.",
              )}
            </figcaption>
          </figure>
        </section>

        <section
          className="landing-screen-story"
          aria-labelledby="landing-screen-title"
        >
          <div className="landing-container landing-screen-story-inner">
            <div className="landing-screen-phones">
              <figure className="landing-screen-phone landing-screen-discover">
                <img
                  src="/landing/discover-screen.webp"
                  width="780"
                  height="1688"
                  loading="lazy"
                  decoding="async"
                  alt={say(
                    "실제 LocalRoute 장소 목록 화면 캡처. 초기 조사 장소와 사진 출처 표시.",
                    "Actual Korean LocalRoute place-list capture showing researched places and photo credits.",
                  )}
                />
                <figcaption>
                  {say("01 · 장소 둘러보기", "01 · Explore places")}
                </figcaption>
              </figure>
              <figure className="landing-screen-phone landing-screen-login">
                <img
                  src="/landing/login-screen.webp"
                  width="780"
                  height="1688"
                  loading="lazy"
                  decoding="async"
                  alt={say(
                    "실제 LocalRoute 이메일 로그인 화면 캡처",
                    "Actual Korean LocalRoute email sign-in screen capture",
                  )}
                />
                <figcaption>
                  {say("02 · 내 여행의 시작", "02 · Start your own trip")}
                </figcaption>
              </figure>
            </div>
            <div className="landing-screen-story-copy">
              <p className="landing-eyebrow">SEE IT BEFORE YOU START</p>
              <h2 id="landing-screen-title">
                {say("먼저 보고,", "Take a look.")}
                <br />
                <span>
                  {say("마음이 움직이면 시작하세요.", "Then make it yours.")}
                </span>
              </h2>
              <p>
                {say(
                  "가입부터 요구하지 않을게요. 어떤 장소가 있는지 살펴보고, 나의 여행을 만들 준비가 됐을 때 함께해요.",
                  "No sign-up just to look around. Discover the places first, then join when you’re ready to plan a day of your own.",
                )}
              </p>
              <ul>
                <li>
                  <Check size={17} aria-hidden="true" />
                  {say(
                    "장소 둘러보기는 가입 없이",
                    "Browse places without signing up",
                  )}
                </li>
                <li>
                  <Check size={17} aria-hidden="true" />
                  {say(
                    "일정 생성은 로그인·이메일 확인 후",
                    "Create itineraries after sign-in and email verification",
                  )}
                </li>
                <li>
                  <Check size={17} aria-hidden="true" />
                  {say(
                    "생성 전 이용 조건과 LP 확인",
                    "Check the conditions and LP before generation",
                  )}
                </li>
              </ul>
              <Link
                className="landing-button landing-primary"
                to={
                  member
                    ? "/plan"
                    : account === "unconfirmed"
                      ? "/account"
                      : "/login"
                }
              >
                {member
                  ? say("내 일정으로 이어가기", "Continue to my itineraries")
                  : say(
                      "로그인하고 여행 시작하기",
                      "Sign in and start planning",
                    )}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <p className="landing-capture-note">
                {say(
                  "실제 UI의 로컬 캡처 · 초기 장소 조사 자료를 연결한 미리보기이며, 운영 DB 게시 현황이 아닙니다. 가입·일정 생성은 수행하지 않았습니다.",
                  "Local captures of the actual Korean UI, using initial place research rather than production listings. No signup or itinerary generation was performed.",
                )}
              </p>
              <details className="landing-capture-credits">
                <summary>
                  {say("캡처 속 사진 출처", "Photo credits in the capture")}
                </summary>
                <p>
                  서울숲: Christian Bolz ·{" "}
                  <a
                    href="https://creativecommons.org/licenses/by-sa/4.0/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    CC BY-SA 4.0
                  </a>{" "}
                  ·{" "}
                  <a
                    href="https://commons.wikimedia.org/wiki/File:Seoul_Forest_%EC%84%9C%EC%9A%B8%EC%88%B2.jpg"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Wikimedia Commons
                  </a>
                </p>
                <p>
                  중앙탑: 문화재청 ·{" "}
                  <a
                    href="https://www.kogl.or.kr/info/licenseType1.do"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    KOGL Type 1
                  </a>
                </p>
                <p>
                  활옥동굴: Dittwjfsdgkvkdjg ·{" "}
                  <a
                    href="https://creativecommons.org/licenses/by-sa/3.0/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    CC BY-SA 3.0
                  </a>{" "}
                  ·{" "}
                  <a
                    href="https://commons.wikimedia.org/wiki/File:CH-JC0234.jpg"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Wikimedia Commons
                  </a>
                </p>
              </details>
            </div>
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
              {say("내 취향을 담는 여행,", "A day that feels like you,")}
              <br />
              {say("시작은 간단하게.", "with a simple place to start.")}
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
                    "비회원은 등록된 장소를 둘러볼 수 있어요. LP를 사용하는 개인화 일정의 생성·저장·공유는 로그인과 이메일 확인을 마친 회원만 이용할 수 있습니다.",
                    "Guests can browse registered places. Creating, saving and sharing personalized itineraries that use LP require sign-in and email verification.",
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
