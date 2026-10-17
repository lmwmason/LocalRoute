import { useEffect, useId, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Link, useLocation } from "react-router-dom";
import type { BookingVenue } from "../../shared/reservations";
import { BookingButton } from "../booking/BookingButton";
import { bookingApi } from "../booking/client";
import { useI18n } from "../i18n";
import { LegalConsentGate } from "../legal";
import { supabase } from "../supabase";

const copy = {
  ko: {
    title: "하이드미플리즈 을지로 예약 요청",
    notice:
      "실제 예약 요청이에요. 내용을 확인하고 개인정보 제공에 별도로 동의한 뒤 직접 제출해야 요청을 보냅니다. 자동으로 제출하지 않아요.",
    pending: "요청됨은 확정이 아니에요. 매장의 확정 응답을 기다려 주세요.",
    missing:
      "LocalRoute 장소 연결을 확인 중이에요. 연결 전에는 예약 정보를 요청하지 않아요.",
    loading: "예약 이용 조건을 확인하고 있어요.",
    guest: "예약하려면 로그인해 주세요.",
    login: "로그인",
    email:
      "예약하려면 이메일 확인이 필요해요. 받은 인증 링크를 열어 주세요. 링크가 만료되었다면 로그인 화면에서 새 링크를 요청해 주세요.",
    account: "로그인·인증 안내",
    authError:
      "로그인 상태를 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
    disabled:
      "현재 예약 기능이 꺼져 있어요. 시연 일정을 보는 것만으로 예약되지 않아요.",
    unsupported:
      "현재 이 장소는 앱 내 예약을 지원하지 않아요. 대관 안내는 일반 좌석 예약과 달라요.",
    error:
      "예약 제공자 정보를 확인하지 못했어요. 장애가 해결된 뒤 다시 확인해 주세요.",
    retry: "다시 확인",
    hire: "대관 안내 · Spacecloud",
    hireNote:
      "외부 대관 안내예요. 일반 좌석 예약이나 해당 시간의 빈자리를 보장하지 않아요.",
  },
  en: {
    title: "Request a booking at Hide Me Please Euljiro",
    notice:
      "This sends a real reservation request. Review your details, separately agree to sharing personal information, then submit yourself. Nothing is submitted automatically.",
    pending:
      "Requested does not mean confirmed. Wait for confirmation from the venue.",
    missing:
      "Checking the LocalRoute place link. No booking information is requested until it is linked.",
    loading: "Checking booking requirements…",
    guest: "Sign in to request a booking.",
    login: "Sign in",
    email:
      "Verify your email before booking. Open your verification link. If it has expired, request a new link on the sign-in screen.",
    account: "Sign-in and verification help",
    authError:
      "Unable to verify your sign-in. Check your connection and retry.",
    disabled:
      "Bookings are currently disabled. Viewing this sample itinerary does not make a reservation.",
    unsupported:
      "This venue currently does not support in-app bookings. Venue hire is separate from table bookings.",
    error:
      "Unable to check booking provider information. Please retry after the service recovers.",
    retry: "Retry",
    hire: "Venue-hire information · Spacecloud",
    hireNote:
      "External venue-hire information. It does not guarantee a table booking or availability at your requested time.",
  },
};

/** Supply the canonical LocalRoute UUID, never the HeyYumi external ID. */
export function EuljiroBookingPanel({
  placeId,
}: {
  placeId: string | undefined;
}) {
  const { language } = useI18n();
  const t = copy[language];
  const titleId = useId();
  return (
    <section className="euljiro-booking-panel" aria-labelledby={titleId}>
      <style>{`
        .euljiro-booking-panel { box-sizing:border-box; min-width:0; width:100%; padding:16px; border:1px solid #dfe5ec; border-radius:16px; background:#fff; color:#172638; overflow-wrap:anywhere; line-height:1.65; }
        .euljiro-booking-panel * { box-sizing:border-box; }
        .euljiro-booking-panel h2 { font-size:1.2rem; }
        .euljiro-booking-panel a, .euljiro-booking-panel button { display:inline-flex; align-items:center; justify-content:center; min-width:44px; min-height:44px; max-width:100%; padding:10px 12px; font:inherit; white-space:normal; }
        .euljiro-booking-panel a { color:#1758b6; }
        .euljiro-booking-panel :focus-visible { outline:3px solid #1758b6; outline-offset:3px; }
        .euljiro-booking-panel .legal-choice input[type=checkbox] { flex-basis:44px; width:44px; height:44px; }
      `}</style>
      <h2 id={titleId}>{t.title}</h2>
      <p>{t.notice}</p>
      <p>{t.pending}</p>
      {placeId ? (
        <MemberBooking key={placeId} placeId={placeId} />
      ) : (
        <p role="status">{t.missing}</p>
      )}
      <a
        href="https://www.spacecloud.kr/space/59739"
        target="_blank"
        rel="noopener noreferrer"
      >
        {t.hire}
      </a>
      <p>
        <small>{t.hireNote}</small>
      </p>
    </section>
  );
}

function MemberBooking({ placeId }: { placeId: string }) {
  const { language } = useI18n();
  const t = copy[language];
  const location = useLocation();
  const [auth, setAuth] = useState<{
    state: "loading" | "guest" | "email" | "error" | "member";
    userId?: string;
  }>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    let revision = 0;
    async function verify(session: Session | null, current: number) {
      if (!active || current !== revision) return;
      setAuth({ state: "loading" });
      try {
        if (!session) {
          setAuth({ state: "guest" });
          return;
        }
        const { data, error } = await client!.auth.getUser(
          session.access_token,
        );
        if (!active || current !== revision) return;
        if (error || !data.user || data.user.id !== session.user.id)
          throw new Error("auth");
        setAuth(
          data.user.is_anonymous
            ? { state: "guest" }
            : !data.user.email_confirmed_at
              ? { state: "email" }
              : { state: "member", userId: data.user.id },
        );
      } catch {
        if (active && current === revision) setAuth({ state: "error" });
      }
    }
    const initialRevision = revision;
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        return verify(data.session, initialRevision);
      })
      .catch(() => {
        if (active && revision === initialRevision) setAuth({ state: "error" });
      });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      const current = ++revision;
      // Leave the Auth callback before invoking another Auth SDK method.
      setAuth({ state: "loading" });
      window.setTimeout(() => void verify(session, current), 0);
    });
    return () => {
      active = false;
      revision++;
      subscription.unsubscribe();
    };
  }, [attempt]);
  if (!supabase) return <p role="status">{t.disabled}</p>;
  if (auth.state === "loading") return <p role="status">{t.loading}</p>;
  if (auth.state === "error")
    return (
      <>
        <p role="alert">{t.authError}</p>
        <button type="button" onClick={() => setAttempt(attempt + 1)}>
          {t.retry}
        </button>
      </>
    );
  if (auth.state !== "member")
    return (
      <>
        <p role="status">{auth.state === "email" ? t.email : t.guest}</p>
        <Link
          to="/login"
          state={{
            overlay: true,
            backgroundPath: location.pathname + location.search,
          }}
        >
          {auth.state === "email" ? t.account : t.login}
        </Link>
      </>
    );
  return (
    <LegalConsentGate key={auth.userId} userId={auth.userId!}>
      <BookingSupport placeId={placeId} />
    </LegalConsentGate>
  );
}

function BookingSupport({ placeId }: { placeId: string }) {
  const { language } = useI18n();
  const t = copy[language];
  const [support, setSupport] = useState<
    "loading" | "disabled" | "unsupported" | "error" | BookingVenue
  >("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void bookingApi
      .capabilities()
      .then(async ({ enabled }) => {
        if (!active) return;
        if (!enabled) {
          setSupport("disabled");
          return;
        }
        const venue = await bookingApi.venue(placeId);
        if (active)
          setSupport(
            venue.placeId !== placeId || venue.externalId !== "1185547279"
              ? "error"
              : venue.supported
                ? venue
                : "unsupported",
          );
      })
      .catch(() => {
        if (active) setSupport("error");
      });
    return () => {
      active = false;
    };
  }, [placeId, attempt]);
  // Reuse the checked entry snapshot. The existing submit endpoint revalidates venue facts.
  const checkedApi = useMemo(
    () =>
      typeof support === "object"
        ? {
            ...bookingApi,
            capabilities: async () => ({ enabled: true }),
            venue: async (id: string) =>
              id === placeId ? support : bookingApi.venue(id),
          }
        : null,
    [support, placeId],
  );
  if (checkedApi)
    return (
      <BookingButton api={checkedApi} placeId={placeId} language={language} />
    );
  return (
    <>
      <p role={support === "error" ? "alert" : "status"}>
        {t[typeof support === "object" ? "error" : support]}
      </p>
      {support !== "loading" && (
        <button
          type="button"
          onClick={() => {
            setSupport("loading");
            setAttempt(attempt + 1);
          }}
        >
          {t.retry}
        </button>
      )}
    </>
  );
}

export default EuljiroBookingPanel;
