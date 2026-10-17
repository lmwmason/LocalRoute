import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bookmark,
  Check,
  ChevronRight,
  Compass,
  Coffee,
  Footprints,
  Heart,
  MapPin,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { panelPaths, readAppRoute, type Panel } from "./navigation";
import type { Session } from "@supabase/supabase-js";
import { demoPlaces } from "../shared/demo";
import { filterPlaces, moveStop, type Place } from "../shared/domain";
import { config } from "./config";
import { api } from "./api";
import { exchangeAuthCode, supabase } from "./supabase";
import type { AuthRecoveryReason } from "./supabase";
import { readSaved, writeSaved } from "./storage";
import { Modal } from "./components/Modal";
import { ContributionForm } from "./components/ContributionForm";
import { Login } from "./components/Login";
import { readDraft, saveDraft } from "./drafts";
import { Feedback } from "./components/Feedback";
import { CorrectionForm } from "./components/CorrectionForm";
import { Workspace } from "./components/Workspace";
import { Admin } from "./components/Admin";
import { ReportForm } from "./components/ReportForm";
import { BookingProfile } from "./components/BookingProfile";
import { PlacePhoto } from "./components/PlacePhoto";
import { LanguageSwitch, useI18n } from "./i18n";
import { LegalConsentGate } from "./legal";
import { VisitRewardRequestPanel } from "./visit-rewards/VisitRewards";
import { visitRewardsApi } from "./visit-rewards/host-client";
import { BookingButton } from "./booking/BookingButton";
import { bookingApi } from "./booking/client";
import { AccountEntry } from "./components/AccountEntry";

const Map = lazy(() => import("./components/Map"));
const Planner = lazy(() =>
  import("./planner/Planner").then((module) => ({ default: module.Planner })),
);
const categories = ["전체", "한식", "일식", "양식", "카페", "혼밥"];
const authRecoveryMessages: Record<AuthRecoveryReason, [string, string]> = {
  expired: [
    "만료되었거나 이미 사용한 로그인 링크예요. 새 링크를 요청해 주세요.",
    "This sign-in link has expired or has already been used. Request a new link.",
  ],
  verifier: [
    "인증을 시작한 브라우저 정보가 없거나 일치하지 않아요. 링크를 요청했던 브라우저에서 열거나, 이 브라우저에서 새 로그인 링크를 요청해 주세요.",
    "The browser verification information is missing or does not match. Open the link in the browser where you requested it, or request a new sign-in link in this browser.",
  ],
  network: [
    "연결 문제로 이메일 인증을 마치지 못했어요. 네트워크를 확인한 뒤 새 로그인 링크를 요청해 주세요.",
    "A connection problem interrupted email verification. Check your network, then request a new sign-in link.",
  ],
  exchange: [
    "로그인 링크를 확인하지 못했어요. 이 브라우저에서 새 링크를 요청해 주세요.",
    "We could not verify this sign-in link. Request a new link in this browser.",
  ],
  unavailable: [
    "로그인 연결을 사용할 수 없어요. 잠시 후 다시 시도해 주세요. 작성 중인 내용은 유지돼요.",
    "Sign-in is unavailable. Try again later. Your draft is preserved.",
  ],
};
function MemberConsent({
  userId,
  children,
}: {
  userId?: string;
  children: ReactNode;
}) {
  return !config.demo && userId ? (
    <LegalConsentGate userId={userId}>{children}</LegalConsentGate>
  ) : (
    <>{children}</>
  );
}
export default function App() {
  const { t, language } = useI18n();
  const browserLocation = useLocation(),
    navigate = useNavigate();
  const route = readAppRoute(
    browserLocation.pathname,
    browserLocation.search,
    browserLocation.state,
  );
  const routeRef = useRef(route);
  routeRef.current = route;
  const routeStateRef = useRef(browserLocation.state);
  routeStateRef.current = browserLocation.state;
  const { tab, panel, loginOverlay } = route;
  const [places, setPlaces] = useState<Place[]>(config.demo ? demoPlaces : []);
  const placesRef = useRef(places);
  placesRef.current = places;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체");
  const [saved, setSaved] = useState(readSaved);
  const selected = route.placeId
    ? places.find((place) => place.id === route.placeId) || null
    : null;
  const [rememberedPlace, setContributePlace] = useState<Place>();
  const contributePlace = route.targetId
    ? places.find((place) => place.id === route.targetId)
    : rememberedPlace;
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState("");
  const [authRecovery, setAuthRecovery] = useState<AuthRecoveryReason | null>(
    null,
  );
  const [callbackUserId, setCallbackUserId] = useState<string | null>(null);
  const [loginFocusRequest, setLoginFocusRequest] = useState(0);
  const callbackAccountRef = useRef<string | null>(null);
  const authCallbackRef = useRef<{
    promise: NonNullable<ReturnType<typeof exchangeAuthCode>>;
    path: string;
    handled: boolean;
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(!config.demo);
  const [reload, setReload] = useState(0);
  const [placeLookup, setPlaceLookup] = useState<{
    id: string;
    loading: boolean;
    error: string;
  } | null>(null);
  const [placeRetry, setPlaceRetry] = useState(0);
  useEffect(() => {
    const id = route.placeId || route.targetId;
    if (
      config.demo ||
      !id ||
      placesRef.current.some((place) => place.id === id)
    )
      return;
    let active = true;
    setPlaceLookup({ id, loading: true, error: "" });
    api
      .place(id)
      .then((place) => {
        if (active) {
          setPlaces((old) =>
            old.some((item) => item.id === place.id) ? old : [...old, place],
          );
          setPlaceLookup({ id, loading: false, error: "" });
        }
      })
      .catch((error: Error) => {
        if (active)
          setPlaceLookup({ id, loading: false, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [route.placeId, route.targetId, placeRetry]);
  const closeOverlay = useCallback(() => {
    const current = routeRef.current;
    if (current.overlay) navigate(-1);
    else navigate(current.background, { replace: true });
  }, [navigate]);
  function setTab(next: "plan" | "explore" | "trip") {
    navigate(
      next === "plan" ? "/plan" : next === "trip" ? "/saved" : "/discover",
    );
  }
  function setSelected(place: Place | null) {
    if (!place) {
      if (routeRef.current.placeId) closeOverlay();
      return;
    }
    navigate(`/places/${encodeURIComponent(place.id)}`, {
      state: {
        overlay: true,
        backgroundPath: routeRef.current.path + routeRef.current.search,
      },
    });
  }
  const setPanel = useCallback(
    (value: Panel | ((current: Panel) => Panel)) => {
      const current = routeRef.current,
        next = typeof value === "function" ? value(current.panel) : value;
      if (next === current.panel) return;
      if (!next) {
        if (current.panel) closeOverlay();
        return;
      }
      const id = current.placeId || current.targetId || rememberedPlace?.id;
      navigate(
        panelPaths[next] +
          (id &&
          ["contribute", "feedback", "correction", "report"].includes(next)
            ? `?place=${encodeURIComponent(id)}`
            : ""),
        {
          state: {
            overlay: true,
            backgroundPath: current.path + current.search,
          },
        },
      );
    },
    [navigate, rememberedPlace?.id, closeOverlay],
  );
  const setLoginOverlay = useCallback(
    (open: boolean) => {
      if (open) {
        navigate("/login", {
          state: {
            overlay: true,
            backgroundPath: routeRef.current.path + routeRef.current.search,
          },
        });
      } else if (routeRef.current.path === "/login") closeOverlay();
    },
    [navigate, closeOverlay],
  );
  useEffect(() => {
    if (
      config.demo ||
      !session?.user.email_confirmed_at ||
      readDraft() ||
      Date.now() - Date.parse(session.user.created_at) > 30 * 60_000
    )
      return;
    let active = true;
    api
      .bookingProfile()
      .then((data) => {
        if (active && !data.onboardingSeen)
          setPanel((current) =>
            current === "contribute" ? current : "bookingSetup",
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session, setPanel]);

  useEffect(() => {
    if (config.demo) return;
    const controller = new AbortController();
    api
      .places(controller.signal)
      .then((data) => {
        setPlaces((previous) => {
          const id = routeRef.current.placeId || routeRef.current.targetId;
          const directPlace = previous.find((place) => place.id === id);
          return directPlace && !data.places.some((place) => place.id === id)
            ? [...data.places, directPlace]
            : data.places;
        });
        setLoadError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const hasCallback = [
      "code",
      "error",
      "error_code",
      "error_description",
      "access_token",
      "refresh_token",
      "provider_token",
      "provider_refresh_token",
    ].some((key) => query.has(key) || hash.has(key));
    if (!authCallbackRef.current && hasCallback) {
      const promise = exchangeAuthCode(
        query.get("code") || hash.get("code") || "",
      );
      if (promise)
        authCallbackRef.current = {
          promise,
          handled: false,
          path:
            window.location.pathname +
            window.location.search +
            window.location.hash,
        };
      // The helper scrubs secrets synchronously; also synchronize React Router
      // while preserving its existing contribution-overlay/back-stack state.
      navigate(
        window.location.pathname +
          window.location.search +
          window.location.hash,
        { replace: true, state: routeStateRef.current },
      );
    }
    const callback = authCallbackRef.current;
    function recover(reason: AuthRecoveryReason) {
      if (!active) return;
      setAuthRecovery(reason);
      setCallbackUserId(null);
      callbackAccountRef.current = null;
      const current = routeRef.current;
      if (current.path === "/login") return;
      navigate("/login", {
        replace: true,
        state: {
          overlay: false,
          backgroundPath: readDraft()
            ? "/contribute"
            : callback?.path.split("#")[0] || current.path,
        },
      });
    }
    if (!supabase) {
      if (callback)
        void callback.promise
          .then(({ error }) => {
            if (
              !active ||
              callback.handled ||
              authCallbackRef.current !== callback
            )
              return;
            callback.handled = true;
            recover(error?.recoveryReason ?? "unavailable");
          })
          .catch(() => {
            if (active && !callback.handled) {
              callback.handled = true;
              recover("network");
            }
          });
      return () => {
        active = false;
      };
    }
    const client = supabase;
    let authRevision = 0;
    let authEventSeen = false;
    let latestChange: { userId: string | null } | null = null;
    async function verifySession(next: Session | null, revision: number) {
      if (!active || revision !== authRevision) return;
      if (!next) {
        if (active) setSession(null);
        return;
      }
      try {
        // A locally cached session can outlive an account deleted in Supabase.
        const { data, error } = await client.auth.getUser(next.access_token);
        if (!active || revision !== authRevision) return;
        if (error || !data.user || data.user.id !== next.user.id) {
          setSession(null);
          if (callbackAccountRef.current === next.user.id) recover("exchange");
          await client.auth.signOut({ scope: "local" });
          return;
        }
        setSession({ ...next, user: data.user });
        if (!authCallbackRef.current) setLoginOverlay(false);
      } catch {
        if (!active || revision !== authRevision) return;
        setSession(null);
        if (callbackAccountRef.current === next.user.id) recover("network");
        await client.auth.signOut({ scope: "local" }).catch(() => {});
      }
    }
    void client.auth
      .getSession()
      .then(({ data }) => {
        if (active && !authEventSeen)
          void verifySession(data.session, ++authRevision);
      })
      .catch(() => {
        if (active && !authEventSeen) setSession(null);
      });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      authEventSeen = true;
      if (_event !== "INITIAL_SESSION")
        latestChange = { userId: next?.user.id ?? null };
      const revision = ++authRevision;
      setSession((current) =>
        current?.user.id === next?.user.id ? current : null,
      );
      // Auth callbacks run under Supabase's lock; verify after it is released.
      setTimeout(() => {
        if (active) void verifySession(next, revision);
      }, 0);
    });
    if (callback)
      void callback.promise
        .then(({ error, data }) => {
          if (
            !active ||
            callback.handled ||
            authCallbackRef.current !== callback
          )
            return;
          callback.handled = true;
          if (
            window.location.pathname + window.location.search !==
            callback.path.split("#")[0]
          ) {
            authCallbackRef.current = null;
            return;
          }
          // A callback from an earlier account must not replace a newer sign-in or
          // undo sign-out. INITIAL_SESSION is not a user account transition.
          if (
            latestChange &&
            (error || latestChange.userId !== data?.session?.user.id)
          ) {
            authCallbackRef.current = null;
            callbackAccountRef.current = null;
            return;
          }
          if (error) {
            recover(error.recoveryReason);
            return;
          }
          if (!data?.session) {
            recover("exchange");
            return;
          }
          callbackAccountRef.current = data.session.user.id;
          setCallbackUserId(data.session.user.id);
          // Also handle clients that don't emit SIGNED_IN to this subscriber.
          void verifySession(data.session, authRevision);
        })
        .catch(() => {
          if (
            active &&
            !callback.handled &&
            authCallbackRef.current === callback &&
            !latestChange
          ) {
            callback.handled = true;
            recover("network");
          }
        });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [navigate, setLoginOverlay]);
  useEffect(() => {
    // Only getUser-verified state can finish callback navigation. The existing
    // revision/active guards above still exclude deleted and superseded users.
    if (!callbackUserId || session?.user.id !== callbackUserId) return;
    const callback = authCallbackRef.current;
    authCallbackRef.current = null;
    callbackAccountRef.current = null;
    setCallbackUserId(null);
    setAuthRecovery(null);
    if (
      callback &&
      window.location.pathname + window.location.search ===
        callback.path.split("#")[0]
    )
      navigate(readDraft() ? "/contribute" : "/plan", { replace: true });
  }, [session, callbackUserId, navigate]);
  useEffect(() => {
    if (loginFocusRequest)
      document
        .querySelector<HTMLInputElement>('.login-form input[type="email"]')
        ?.focus();
  }, [loginFocusRequest]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  function updateSaved(next: string[]) {
    setSaved(next);
    const persisted = writeSaved(next);
    if (!persisted)
      setNotice(
        t("브라우저 저장 공간을 사용할 수 없어 이번 화면에서만 보관해요."),
      );
    return persisted;
  }
  function toggleSave(place: Place) {
    const exists = saved.includes(place.id);
    const persisted = updateSaved(
      exists ? saved.filter((id) => id !== place.id) : [...saved, place.id],
    );
    if (persisted)
      setNotice(
        exists ? t("여행 목록에서 뺐어요.") : t("나의 여행에 담았어요."),
      );
  }
  const filtered = filterPlaces(places, query, category);
  const tripPlaces = saved
    .map((id) => places.find((p) => p.id === id))
    .filter((p): p is Place => Boolean(p));
  const missingPlaceId =
    route.placeId && !selected
      ? route.placeId
      : route.targetId &&
          !contributePlace &&
          ["feedback", "report", "contribute"].includes(panel || "")
        ? route.targetId
        : null;
  const missingPlacePanel =
    Boolean(missingPlaceId) ||
    (["feedback", "report"].includes(panel || "") && !contributePlace);
  const placeLoading =
    !config.demo &&
    Boolean(missingPlaceId) &&
    (placeLookup?.id !== missingPlaceId || placeLookup.loading);
  function openContribution(place?: Place) {
    setContributePlace(place);
    setPanel("contribute");
  }
  if (window.location.pathname.startsWith("/admin")) return <Admin />;

  return (
    <>
      <a className="skip-link" href="#main">
        {t("본문으로 바로 가기")}
      </a>
      <div className="app-shell main-app-shell">
        <header className="topbar">
          <button
            className="brand"
            aria-label={t("LocalRoute 홈")}
            onClick={() => {
              navigate("/");
              setQuery("");
              setCategory("전체");
            }}
          >
            <img src="/localroute-logo.png" alt="LocalRoute" />
            <span className="brand-word">
              Local<span>Route</span>
              <small>{t("동네의 발견, 여행의 시작")}</small>
            </span>
          </button>
          <nav className="desktop-tabs" aria-label={t("메인 메뉴")}>
            <button
              className={tab === "plan" ? "active" : ""}
              onClick={() => setTab("plan")}
            >
              {t("common.plan")}
            </button>
            <button
              className={tab === "explore" ? "active" : ""}
              onClick={() => setTab("explore")}
            >
              {t("동네 발견")}
            </button>
            <button
              className={tab === "trip" ? "active" : ""}
              onClick={() => setTab("trip")}
            >
              {t("나의 여행")}
              {saved.length > 0 && <span>{saved.length}</span>}
            </button>
          </nav>
          <div className="top-actions">
            <LanguageSwitch />
            <button
              className="text-button desktop-only"
              onClick={() => openContribution()}
            >
              <Plus size={17} /> {t("맛집 추천하기")}
            </button>
            <AccountEntry
              member={Boolean(session)}
              onClick={() => setPanel(session ? "profile" : "login")}
            />
          </div>
        </header>

        <main id="main">
          {config.demo && (
            <div className="demo-banner">
              <span className="badge">DEMO</span>
              <span>
                {t(
                  "지금은 체험 모드예요. 장소·추천·평점은 모두 가상 데이터입니다.",
                )}
              </span>
            </div>
          )}
          {!route.known ? (
            <section className="empty-state">
              <h1>
                {language === "ko"
                  ? "페이지를 찾을 수 없어요"
                  : "Page not found"}
              </h1>
              <p>
                {language === "ko"
                  ? "주소를 확인하거나 여행 계획 화면으로 이동해 주세요."
                  : "Check the address or return to the trip planner."}
              </p>
              <button
                className="primary"
                onClick={() => navigate("/plan", { replace: true })}
              >
                {t("common.plan")}
              </button>
            </section>
          ) : tab === "plan" ? (
            <Suspense fallback={<p role="status">{t("planner.checking")}</p>}>
              <MemberConsent userId={session?.user.id}>
                <Planner
                  key={session?.user.id || "guest"}
                  signedIn={Boolean(session)}
                  userId={session?.user.id}
                  onLogin={() => setLoginOverlay(true)}
                />
              </MemberConsent>
            </Suspense>
          ) : tab === "explore" ? (
            <>
              <section className="intro">
                <div>
                  <p className="eyebrow">
                    <span /> LOCALS KNOW BETTER
                  </p>
                  <h1>
                    {t("좋은 여행은,")}
                    <br className="mobile-break" /> {t("동네의 한마디에서.")}
                  </h1>
                  <p className="intro-copy">
                    {t(
                      "현지인이 아끼는 곳을 발견하고, 나만의 여행으로 이어 보세요.",
                    )}
                  </p>
                </div>
                <div className="intro-note">
                  <div className="tiny-avatars">
                    <span>{t("수")}</span>
                    <span>{t("윤")}</span>
                    <span>{t("민")}</span>
                  </div>
                  <span>
                    {t("광고보다 가까운,")}
                    <br />
                    <strong>{t("사람의 추천")}</strong>
                  </span>
                </div>
              </section>
              <div className="discovery-toolbar">
                <label className="search-field main-search">
                  <Search size={21} />
                  <input
                    aria-label={t("장소 검색")}
                    placeholder={t("어떤 동네, 어떤 맛이 궁금한가요?")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      aria-label={t("검색어 지우기")}
                      className="icon-button"
                      onClick={() => setQuery("")}
                    >
                      <X size={17} />
                    </button>
                  )}
                  <kbd>{t("검색")}</kbd>
                </label>
                <div className="neighborhood">
                  <MapPin size={16} />
                  <span>{config.demo ? t("서울 성수") : t("장소 지도")}</span>
                  <span className="neighborhood-dot" />
                </div>
              </div>
              <div
                className="category-bar"
                role="group"
                aria-label={t("장소 분류")}
              >
                {categories.map((c, i) => (
                  <button
                    key={c}
                    className={category === c ? "category active" : "category"}
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                  >
                    {i === 0 ? (
                      <Compass size={16} />
                    ) : c === "카페" ? (
                      <Coffee size={16} />
                    ) : c === "혼밥" ? (
                      <Heart size={15} />
                    ) : null}
                    {t(c)}
                  </button>
                ))}
                <span className="free-note">{t("발견은 언제나 무료")}</span>
              </div>

              <div className="discovery-layout">
                <section className="places-panel" aria-label={t("장소 목록")}>
                  <div className="section-heading">
                    <div>
                      <h2>{t("골목에서 찾은 좋은 곳")}</h2>
                      <p>
                        {loading
                          ? t("장소를 불러오는 중이에요")
                          : `${filtered.length}곳의 발견 · ${config.demo ? t("성수 데모 컬렉션") : t("LocalRoute 추천")}`}
                      </p>
                    </div>
                    <span className="list-label">
                      {t("둘러보기")}
                      <ArrowDown size={14} />
                    </span>
                  </div>
                  {loading && (
                    <div className="loading-cards" role="status">
                      {t("장소를 불러오는 중이에요…")}
                    </div>
                  )}
                  {loadError && (
                    <div className="empty-state">
                      <MapPin />
                      <h3>{t("장소를 불러오지 못했어요")}</h3>
                      <p>{loadError}</p>
                      <button
                        className="secondary"
                        onClick={() => {
                          setLoading(true);
                          setReload((n) => n + 1);
                        }}
                      >
                        {t("다시 시도")}
                      </button>
                    </div>
                  )}
                  {!loading && !loadError && filtered.length === 0 && (
                    <div className="empty-state">
                      <Search />
                      <h3>{t("아직 발견하지 못한 곳이에요")}</h3>
                      <p>
                        {t("다른 검색어를 입력하거나 첫 추천을 남겨 주세요.")}
                      </p>
                      <button
                        className="secondary"
                        onClick={() => {
                          setQuery("");
                          setCategory("전체");
                        }}
                      >
                        {t("전체 장소 보기")}
                      </button>
                      <button
                        className="text-button"
                        onClick={() => openContribution()}
                      >
                        {t("새 장소 추천하기")}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                  <div className="place-list">
                    {filtered.map((p) => (
                      <article
                        key={p.id}
                        className={`place-card ${selected?.id === p.id ? "is-selected" : ""}`}
                      >
                        <button
                          className="place-card-main"
                          onClick={() => setSelected(p)}
                          aria-label={
                            language === "ko"
                              ? `${p.name} 자세히 보기`
                              : `View details for ${p.name}`
                          }
                        >
                          <PlacePhoto
                            id={p.photo?.id}
                            name={p.name}
                            className="place-art actual-place-photo"
                          />
                          <div className="place-info">
                            <div className="place-meta">
                              <span>{p.category}</span>
                              <span>{t("성수동")}</span>
                            </div>
                            <h3>{p.name}</h3>
                            <div className="rating">
                              <Star size={13} fill="currentColor" />
                              <strong>{p.rating?.toFixed(1) || "—"}</strong>
                              <span>
                                {t("식당 만족도 ·")}
                                {p.reviewCount}
                                {t("개")}
                              </span>
                            </div>
                            <p className="place-quote">
                              “
                              {p.endorsements[0]?.text ||
                                "이곳의 첫 추천을 기다려요."}
                              ”
                            </p>
                            <div className="place-tags">
                              {p.tags.slice(0, 2).map((t) => (
                                <span key={t}>{t}</span>
                              ))}
                            </div>
                          </div>
                        </button>
                        <button
                          className={`save-button ${saved.includes(p.id) ? "saved" : ""}`}
                          aria-label={`${p.name} ${saved.includes(p.id) ? t("저장 해제") : t("저장")}`}
                          aria-pressed={saved.includes(p.id)}
                          onClick={() => toggleSave(p)}
                        >
                          <Bookmark
                            size={19}
                            fill={
                              saved.includes(p.id) ? "currentColor" : "none"
                            }
                          />
                        </button>
                      </article>
                    ))}
                  </div>
                  <button
                    className="contribute-banner"
                    onClick={() => openContribution()}
                  >
                    <span className="contribute-symbol">
                      <Plus size={22} />
                    </span>
                    <span>
                      <strong>{t("당신만 아는 좋은 곳이 있나요?")}</strong>
                      <small>
                        {t("한마디면 충분해요. 동네의 발견을 나눠요.")}
                      </small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                </section>
                <div className="map-wrapper">
                  <Suspense
                    fallback={
                      <div className="map-placeholder">
                        {t("지도를 준비하고 있어요…")}
                      </div>
                    }
                  >
                    <Map
                      places={filtered}
                      selected={selected?.id || null}
                      onSelect={setSelected}
                      center={
                        filtered[0]
                          ? [filtered[0].lng, filtered[0].lat]
                          : undefined
                      }
                      caption={config.demo ? undefined : t("장소 지도")}
                    />
                  </Suspense>
                  <div className="map-bottom-note">
                    <span>
                      <Footprints size={16} /> {t("골목을 따라, 나의 속도로")}
                    </span>
                    <span>{t("지도 위 장소를 눌러 보세요")}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <section className="trip-page">
              <p className="eyebrow">YOUR LITTLE JOURNEY</p>
              <h1>
                {t("좋은 곳을 모아,")}
                <br />
                {t("나만의 하루로.")}
              </h1>
              <p className="intro-copy">
                {t("가고 싶은 순서로 정리해 보세요. 이 브라우저에 저장돼요.")}
              </p>
              {tripPlaces.length === 0 ? (
                <div className="empty-state trip-empty">
                  <Bookmark size={32} />
                  <h3>{t("첫 번째 발견을 담아 보세요")}</h3>
                  <p>{t("장소의 북마크를 누르면 여기에 모아 드릴게요.")}</p>
                  <button className="primary" onClick={() => setTab("explore")}>
                    {t("동네 둘러보기")}
                    <ArrowRight size={17} />
                  </button>
                </div>
              ) : (
                <div className="trip-layout">
                  <div className="trip-list">
                    {tripPlaces.map((p, i) => (
                      <article className="trip-stop" key={p.id}>
                        <span className="stop-number">{i + 1}</span>
                        <button
                          className="trip-stop-info"
                          onClick={() => setSelected(p)}
                        >
                          <span className="muted">{p.category}</span>
                          <h3>{p.name}</h3>
                          <p>{p.address}</p>
                        </button>
                        <div className="stop-actions">
                          <button
                            className="icon-button"
                            aria-label={`${p.name} 위로 이동`}
                            disabled={i === 0}
                            onClick={() =>
                              updateSaved(
                                moveStop(saved, saved.indexOf(p.id), -1),
                              )
                            }
                          >
                            <ArrowUp size={17} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`${p.name} 아래로 이동`}
                            disabled={i === tripPlaces.length - 1}
                            onClick={() =>
                              updateSaved(
                                moveStop(saved, saved.indexOf(p.id), 1),
                              )
                            }
                          >
                            <ArrowDown size={17} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`${p.name} 여행에서 삭제`}
                            onClick={() => toggleSave(p)}
                          >
                            <X size={17} />
                          </button>
                        </div>
                      </article>
                    ))}
                    <button
                      className="secondary full"
                      onClick={() => setTab("explore")}
                    >
                      <Plus size={17} /> {t("다른 장소 더 담기")}
                    </button>
                  </div>
                  <aside className="trip-summary">
                    <Compass size={30} />
                    <h3>{t("서두르지 않는 여행")}</h3>
                    <p>
                      {tripPlaces.length}
                      {t(
                        "곳을 담았어요. 영업시간과 이동 경로는 방문 전 확인해 주세요.",
                      )}
                    </p>
                    <div className="notice-box">
                      {t(
                        "현재 목록의 순서만 저장해요. 실제 이동 시간·거리·영업 여부는 계산하지 않았어요.",
                      )}
                    </div>
                    <span className="badge">{t("무료 여행 목록")}</span>
                  </aside>
                </div>
              )}
            </section>
          )}
        </main>
        <footer className="site-footer">
          <span>
            LocalRoute <span>© {new Date().getFullYear()}</span>
          </span>
          <p>{t("누군가의 동네가, 당신의 좋은 여행이 되도록.")}</p>
          <div className="legal-page-links">
            <a href="/checkout/test">
              {language === "ko"
                ? "LP 충전 체험 · 실제 결제 없음"
                : "Try LP checkout · no charge"}
            </a>
            <a href="/legal/privacy">
              {language === "ko" ? "개인정보 처리방침" : "Privacy"}
            </a>
            <a href="/legal/terms">
              {language === "ko" ? "이용약관" : "Terms"}
            </a>
            <a href="/legal/transfers">
              {language === "ko" ? "국외 이전 안내" : "Overseas processing"}
            </a>
            <a href="/legal/location">
              {language === "ko" ? "위치정보 안내" : "Location"}
            </a>
          </div>
          <button
            className="text-button"
            onClick={() => {
              setContributePlace(undefined);
              setPanel("correction");
            }}
          >
            {t("장소 정보 수정 요청")}
          </button>
          {config.demo && (
            <a href="/admin" className="text-button">
              {t("운영 화면 체험")}
            </a>
          )}
        </footer>
      </div>
      <nav className="bottom-nav" aria-label={t("모바일 메뉴")}>
        <button
          aria-current={tab === "plan" ? "page" : undefined}
          className={tab === "plan" ? "active" : ""}
          onClick={() => setTab("plan")}
        >
          <Compass size={22} />
          <span>{t("common.plan")}</span>
        </button>
        <button
          aria-current={tab === "explore" ? "page" : undefined}
          className={tab === "explore" ? "active" : ""}
          onClick={() => setTab("explore")}
        >
          <Compass size={22} />
          <span>{t("발견")}</span>
        </button>
        <button onClick={() => openContribution()}>
          <Plus size={22} />
          <span>{t("추천하기")}</span>
        </button>
        <button
          aria-current={tab === "trip" ? "page" : undefined}
          className={tab === "trip" ? "active" : ""}
          onClick={() => setTab("trip")}
        >
          <span className="nav-icon">
            <Bookmark size={22} />
            {saved.length > 0 && <i>{saved.length}</i>}
          </span>
          <span>{t("나의 여행")}</span>
        </button>
        <button onClick={() => setPanel(session ? "profile" : "login")}>
          <span className="nav-profile">
            {session ? <Check size={18} /> : <Heart size={20} />}
          </span>
          <span>{t("마이")}</span>
        </button>
      </nav>

      {selected && (
        <Modal title={t("동네의 발견")} onClose={() => setSelected(null)}>
          <div className="place-detail">
            <PlacePhoto
              id={selected.photo?.id}
              name={selected.name}
              className="place-art actual-place-photo"
            />
            {selected.photo && (
              <p className="fine-print">{t("photos.source")}</p>
            )}
            <div className="detail-heading">
              <span className="eyebrow">
                {selected.category} ·{" "}
                {selected.source === "demo" ? t("가상 장소") : "LocalRoute"}
              </span>
              <h2>{selected.name}</h2>
              <p>
                <MapPin size={15} />
                {selected.address}
              </p>
            </div>
            <div className="rating-summary">
              <div>
                <Star size={20} />
                <strong>{selected.rating?.toFixed(1) || "—"}</strong>
                <span>
                  {t("식당 만족도")}
                  <small>
                    {selected.reviewCount}
                    {t("개 후기")}
                  </small>
                </span>
              </div>
              <div>
                <Heart size={20} />
                <span>
                  {t("추천 도움 평가")}
                  <small>{t("각 추천별로 확인해요")}</small>
                </span>
              </div>
            </div>
            <h3>
              {t("현지인의 한마디")}{" "}
              <span className="count">{selected.endorsements.length}</span>
            </h3>
            {selected.endorsements.length ? (
              selected.endorsements.map((e) => (
                <article className="endorsement" key={e.id}>
                  <div className="curator">
                    <span>{e.author[0]}</span>
                    <strong>{e.author}</strong>
                    <small>
                      {selected.source === "demo"
                        ? t("데모 큐레이터")
                        : t("큐레이터")}
                    </small>
                  </div>
                  <p>“{e.text}”</p>
                  {e.localArea && (
                    <p className="fine-print">
                      {e.localArea} · {t("profile.selfDeclared")}
                    </p>
                  )}
                  <span className="helpful">
                    {t("추천 도움 평가 ·")}
                    {e.helpfulCount}
                    {t("개")}
                    {selected.source === "demo" ? t(" (가상)") : ""}
                  </span>
                </article>
              ))
            ) : (
              <p className="muted">
                {t("아직 공개된 추천이 없어요. 첫 경험을 나눠 주세요.")}
              </p>
            )}
            <div className="notice-box">
              {t(
                "영업시간·메뉴 가격·예약 가능 여부는 아직 확인되지 않았어요. 방문 전 가게에 확인해 주세요.",
              )}
            </div>
            <div className="detail-actions">
              <button
                className="secondary"
                onClick={() => toggleSave(selected)}
              >
                <Bookmark size={18} />
                {saved.includes(selected.id) ? t("담았어요") : t("여행에 담기")}
              </button>
              <button
                className="primary"
                onClick={() => openContribution(selected)}
              >
                <Plus size={18} /> {t("나도 추천하기")}
              </button>
            </div>
            {!config.demo && session && (
              <BookingButton
                api={bookingApi}
                placeId={selected.id}
                language={language}
              />
            )}
            <button
              className="secondary full"
              onClick={() => {
                setContributePlace(selected);
                setPanel("feedback");
              }}
            >
              {t("방문 후기와 추천 도움 평가 남기기")}
            </button>
            <div className="detail-links">
              <button
                className="text-button"
                onClick={() => {
                  setContributePlace(selected);
                  setPanel("correction");
                }}
              >
                {t("장소 정보 수정 요청")}
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setContributePlace(selected);
                  setPanel("report");
                }}
              >
                {t("신고/검토 요청")}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {missingPlacePanel && (
        <Modal
          title={language === "ko" ? "장소 확인" : "Find a place"}
          onClose={closeOverlay}
        >
          <div className="empty-state">
            {placeLoading ? (
              <p role="status">{t("장소를 불러오는 중이에요…")}</p>
            ) : (
              <>
                <h2>
                  {language === "ko"
                    ? "장소를 확인할 수 없어요"
                    : "This place is unavailable"}
                </h2>
                <p role="alert">
                  {language === "ko"
                    ? "삭제되었거나 아직 공개되지 않은 장소일 수 있어요. 목록에서 장소를 다시 선택해 주세요."
                    : "The place may be removed or unpublished. Choose a place from discovery to continue."}
                </p>
                {!config.demo && missingPlaceId && (
                  <button
                    className="secondary"
                    onClick={() => setPlaceRetry((value) => value + 1)}
                  >
                    {t("다시 시도")}
                  </button>
                )}
                <button
                  className="primary"
                  onClick={() => navigate("/discover", { replace: true })}
                >
                  {t("동네 발견")}
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
      {panel === "contribute" && !missingPlacePanel && (
        <Modal title={t("맛집 추천하기")} onClose={() => setPanel(null)}>
          <MemberConsent userId={session?.user.id}>
            <ContributionForm
              places={places}
              initial={contributePlace}
              loggedIn={Boolean(session)}
              onLogin={() => setLoginOverlay(true)}
            />
          </MemberConsent>
        </Modal>
      )}
      {(panel === "login" ||
        loginOverlay ||
        (["profile", "bookingSetup"].includes(panel || "") && !session)) && (
        <Modal
          title={t("LocalRoute 로그인")}
          onClose={() => {
            setAuthRecovery(null);
            setCallbackUserId(null);
            callbackAccountRef.current = null;
            authCallbackRef.current = null;
            if (panel === "profile" || panel === "bookingSetup") setPanel(null);
            else setLoginOverlay(false);
          }}
        >
          {authRecovery && (
            <section
              className="notice-box"
              role="alert"
              aria-label={
                language === "ko"
                  ? "이메일 인증 복구"
                  : "Email verification recovery"
              }
            >
              <h3>
                {language === "ko"
                  ? "이메일 인증을 완료하지 못했어요"
                  : "Email verification could not be completed"}
              </h3>
              <p>
                {authRecoveryMessages[authRecovery][language === "ko" ? 0 : 1]}
              </p>
              <button
                type="button"
                className="primary full"
                onClick={() => {
                  setAuthRecovery(null);
                  authCallbackRef.current = null;
                  setLoginFocusRequest((value) => value + 1);
                }}
              >
                {language === "ko"
                  ? "로그인 링크 다시 요청"
                  : "Request a new sign-in link"}
              </button>
            </section>
          )}
          <Login />
        </Modal>
      )}
      {panel === "profile" && session && (
        <Modal title={t("나의 LocalRoute")} onClose={() => setPanel(null)}>
          <div className="profile-panel">
            <h3>{t("반가워요, 동네 탐험가님")}</h3>
            <p>{session?.user.email}</p>
            {!config.demo && (
              <LegalConsentGate userId={session?.user.id || ""}>
                <Workspace />
                <details className="consent-settings">
                  <summary>
                    {language === "ko"
                      ? "방문 검토 신청과 처리 상태"
                      : "Visit review requests and status"}
                  </summary>
                  <VisitRewardRequestPanel
                    api={visitRewardsApi}
                    language={language}
                  />
                </details>
                <BookingProfile />
                <details className="consent-settings" id="consent-settings">
                  <summary>
                    {language === "ko"
                      ? "동의 설정 · 지역 공개 변경"
                      : "Consent settings · home area publication"}
                  </summary>
                  <LegalConsentGate userId={session?.user.id || ""} settings>
                    {null}
                  </LegalConsentGate>
                </details>
              </LegalConsentGate>
            )}
            <div className="notice-box">
              {t(
                "LP 적립·유료 추천은 정책 검증 후 제공됩니다. 현재 보상이나 차감은 발생하지 않아요.",
              )}
            </div>
            <button
              className="secondary full"
              onClick={async () => {
                const result = await supabase?.auth.signOut();
                if (result?.error)
                  setNotice(t("로그아웃하지 못했어요. 다시 시도해 주세요."));
                else {
                  saveDraft(null);
                  setPanel(null);
                  setNotice(t("로그아웃했어요."));
                }
              }}
            >
              {t("로그아웃")}
            </button>
          </div>
        </Modal>
      )}
      {panel === "bookingSetup" && session && (
        <Modal
          title={t("booking.profileTitle")}
          onClose={() => {
            void api.skipBookingProfile().catch(() => {});
            setPanel(null);
          }}
        >
          <MemberConsent userId={session.user.id}>
            <BookingProfile onFinished={() => setPanel(null)} />
          </MemberConsent>
        </Modal>
      )}
      {panel === "feedback" && contributePlace && (
        <Modal
          title={t("방문 후기")}
          onClose={() => {
            setPanel(null);
            setReload((n) => n + 1);
          }}
        >
          <MemberConsent userId={session?.user.id}>
            <Feedback
              place={contributePlace}
              userId={session?.user.id}
              onLogin={() => setLoginOverlay(true)}
            />
          </MemberConsent>
        </Modal>
      )}
      {panel === "correction" && (
        <Modal title={t("장소 정보 수정 요청")} onClose={() => setPanel(null)}>
          <CorrectionForm places={places} initial={contributePlace} />
        </Modal>
      )}
      {panel === "report" && contributePlace && (
        <Modal title={t("신고/검토 요청")} onClose={() => setPanel(null)}>
          <ReportForm id={contributePlace.id} kind="place" />
        </Modal>
      )}
      {notice && (
        <div role="status" className="toast">
          <Check size={17} />
          {notice}
        </div>
      )}
    </>
  );
}
