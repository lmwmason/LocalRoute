import { useEffect, useId, useRef, useState } from "react";
import {
  reservationConsent,
  reservationSchema,
  type BookingVenue,
  type Reservation,
  type ReservationInput,
} from "../../shared/reservations";
import { BookingApiError, type BookingApi } from "./api";
import { messages } from "./messages";
import { initialBookingDateTime } from "./initial-date-time";
import "./booking.css";

type Props = {
  api: BookingApi;
  placeId: string;
  language?: "ko" | "en";
  /** Planned visit date (YYYY-MM-DD) and start time (HH:mm), both in Korea. */
  initialDate?: string;
  initialTime?: string;
  onReservation?: (reservation: Reservation) => void;
};
export function BookingButton(props: Props) {
  return <BookingSupport key={JSON.stringify([props.placeId, props.initialDate, props.initialTime])} {...props} />;
}
function BookingSupport(props: Props) {
  const { api, placeId, language = "ko" } = props;
  const t = messages[language];
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [failure, setFailure] = useState("");
  const [retry, setRetry] = useState(0);
  const [fallback, setFallback] = useState<BookingVenue>();
  const [existing, setExisting] = useState<Reservation | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  useEffect(() => {
    let active = true;
    setChecking(true);
    setFailure("");
    setEnabled(false);
    setFallback(undefined);
    setExisting(null);
    void (async () => {
      if (props.initialDate && api.existing) {
        const previous = await api.existing(placeId, props.initialDate);
        if (previous) {
          if (active) setExisting(previous);
          return;
        }
      }
      const v = await api.capabilities();
        if (!v.enabled) return;
        const venue = await api.venue(placeId);
        if (active) {
          setEnabled(venue.supported);
          setFallback(venue);
        }
      })()
      .catch((error) => {
        if (active) {
          if (error instanceof BookingApiError && error.retryAfter)
            setRetryAt(Date.now() + error.retryAfter * 1000);
          setFailure(
            error instanceof BookingApiError && error.status === 401
              ? "auth"
              : error instanceof Error
                ? error.message
                : "booking.unavailable",
          );
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [api, placeId, props.initialDate, retry]);
  if (checking)
    return (
      <p className="lr-booking-note" role="status">
        {language === "ko"
          ? "예약 지원 여부를 확인하고 있어요…"
          : "Checking booking support…"}
      </p>
    );
  if (failure)
    return (
      <div className="lr-booking" role="alert">
        <p>
          {failure === "auth"
            ? language === "ko"
              ? "현재 주소에서 이메일 인증을 마친 계정으로 로그인해 주세요."
              : "Sign in with a verified email on this site to book."
            : t[failure as keyof typeof t] ||
              (language === "ko"
                ? "예약 정보를 불러오지 못했어요. 다시 확인해 주세요."
                : "Could not load booking details. Please retry.")}
        </p>
        {failure === "auth" && (
          <a href="/login">{language === "ko" ? "로그인하기" : "Sign in"}</a>
        )}
        {retryAt > now && <p role="status">{language === "ko" ? `${Math.ceil((retryAt-now)/1000)}초 후 다시 확인할 수 있어요.` : `Retry in ${Math.ceil((retryAt-now)/1000)} seconds.`}</p>}
        <button type="button" disabled={retryAt > now} onClick={() => setRetry((n) => n + 1)}>
          {language === "ko" ? "예약 정보 다시 확인" : "Retry booking details"}
        </button>
      </div>
    );
  if (existing)
    return <ExistingBooking api={api} reservation={existing} language={language} onChange={setExisting} />;
  // Host can render a separately verified contact route when disabled.
  if (!enabled)
    return (
      <p className="lr-booking-note">
        {t[fallback ? "booking.unsupported" : "booking.disabled"]}
        {fallback?.phone && <span> {fallback.phone}</span>}
      </p>
    );
  return (
    <div className="lr-booking">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? t.close : t.open}
      </button>
      {open && <BookingForm key={placeId} {...props} />}
    </div>
  );
}
function ExistingBooking({api,reservation,language,onChange}:{api:BookingApi;reservation:Reservation;language:"ko"|"en";onChange:(reservation:Reservation)=>void}) {
  const t=messages[language];
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  return <section className="lr-booking">
    <p>{language==="ko"?"이 날짜에 기존 예약 요청이 있어요. 새 요청을 자동으로 보내지 않아요.":"An existing reservation request was found for this date. No new request is sent automatically."}</p>
    <p role="status">{t[reservation.state as keyof typeof t] || t["booking.unavailable"]}</p>
    <p>{new Date(reservation.reservationTime).toLocaleString(language==="ko"?"ko-KR":"en-GB",{timeZone:"Asia/Seoul"})} (KST) · {reservation.guestCount}</p>
    {(reservation.reconciliationRequired||reservation.state==="unknown")&&<p>{t.reconcile}</p>}
    <button type="button" disabled={busy} onClick={async()=>{if(busy)return;setBusy(true);setError("");try{const result=await api.refresh(reservation.id);if(active.current)onChange(result);}catch{if(active.current)setError(t["booking.unavailable"]);}finally{if(active.current)setBusy(false);}}}>{busy?t.busy:t.refresh}</button>
    {error&&<p role="alert">{error}</p>}
  </section>;
}
export function BookingForm(props: Props) {
  // Changing the itinerary context discards old lookups, errors, review and
  // consent. Cleanup guards prevent an earlier lookup from filling this form.
  // Opaque recovery is scoped to the planned date; another date must remain
  // bookable. Existing requests for that date are also recovered server-side.
  return (
    <BookingRequestForm
      key={JSON.stringify([
        props.placeId,
        props.initialDate,
        props.initialTime,
      ])}
      {...props}
    />
  );
}
function BookingRequestForm({
  api,
  placeId,
  language = "ko",
  onReservation,
  initialDate,
  initialTime,
}: Props) {
  const t = messages[language];
  const uid = useId();
  const [venue, setVenue] = useState<BookingVenue>();
  const [details, setDetails] = useState({
    time: initialBookingDateTime(initialDate, initialTime),
    count: "2",
    name: "",
    phone: "",
    note: "",
  });
  const [review, setReview] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Reservation>();
  const [attempt, setAttempt] = useState<ReservationInput>();
  // Persist only an opaque request ID, never contact details or consent.
  const storageKey = `localroute.booking.request.${placeId}${initialDate ? `.${initialDate}` : ""}`;
  const [recoveryId, setRecoveryId] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    api
      .venue(placeId)
      .then((v) => {
        if (active) setVenue(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    api
      .profile()
      .then((p) => {
        if (active && p)
          setDetails((d) => ({
            ...d,
            name: d.name || p.guestName,
            phone: d.phone || p.guestPhone,
          }));
      })
      .catch(() => {});
    if (recoveryId)
      api
        .lookup(recoveryId)
        .then((r) => {
          if (active) setResult(r);
        })
        .catch(() => {
          if (active) setError("booking.network");
        });
    return () => {
      active = false;
    };
  }, [api, placeId, recoveryId]);
  const text = (key: string) =>
    t[key as keyof typeof t] || t["booking.unavailable"];
  async function send() {
    if (lock.current || !venue || !consent) return;
    const parsed = reservationSchema.safeParse(
      attempt || {
        requestId: crypto.randomUUID(),
        placeId,
        expectedName: venue.name,
        expectedAddress: venue.address,
        reservationTime: `${details.time}:00+09:00`,
        guestCount: Number(details.count),
        guestName: details.name,
        guestPhone: details.phone,
        note: details.note,
        consentVersion: reservationConsent,
        consent,
      },
    );
    if (!parsed.success) {
      setError("booking.invalid");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setAttempt(parsed.data);
    try {
      sessionStorage.setItem(storageKey, parsed.data.requestId);
    } catch {
      /* Host should retain onReservation IDs when storage is unavailable. */
    }
    try {
      const r = await api.submit(parsed.data);
      setResult(r);
      onReservation?.(r);
    } catch (e) {
      setError(
        e instanceof Error && e.message.startsWith("booking.")
          ? e.message
          : "booking.network",
      );
      if (
        e instanceof BookingApiError &&
        [400, 401, 403, 409, 422].includes(e.status)
      ) {
        // These responses precede a new provider submission; allow correction with fresh consent.
        setAttempt(undefined);
        setReview(false);
        setConsent(false);
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* no persistent contact data */
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    if (!result || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await api.refresh(result.id);
      setResult(r);
      onReservation?.(r);
    } catch {
      setError("booking.unavailable");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function recover() {
    if (!recoveryId || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const r = await api.lookup(recoveryId);
      setResult(r);
      setError("");
      onReservation?.(r);
    } catch {
      setError("booking.network");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function startAnother() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* optional ID recovery */
    }
    setRecoveryId(null);
    setResult(undefined);
    setAttempt(undefined);
    setReview(false);
    setConsent(false);
    setError("");
    setDetails((d) => ({
      ...d,
      time: initialBookingDateTime(initialDate, initialTime),
      note: "",
    }));
  }
  if (!venue)
    return (
      <section className="lr-booking" aria-live="polite">
        {error ? text(error) : t.loading}
      </section>
    );
  if (!venue.supported)
    return (
      <section className="lr-booking">
        {t["booking.unsupported"]}
        {venue.phone && <p>{venue.phone}</p>}
      </section>
    );
  return (
    <section className="lr-booking" aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`}>{t.title}</h3>
      <p>
        <strong>{venue.name}</strong>
        <br />
        {venue.address}
      </p>
      {recoveryId && !result && !attempt ? (
        <>
          <p>{t.reconcile}</p>
          <button type="button" onClick={recover} disabled={busy}>
            {t.retry}
          </button>
        </>
      ) : result ? (
        <>
          <p role="status">{text(result.state)}</p>
          <p>
            {new Date(result.reservationTime).toLocaleString(
              language === "ko" ? "ko-KR" : "en-GB",
              { timeZone: "Asia/Seoul" },
            )}{" "}
            (KST) · {result.guestCount}
          </p>
          {(result.reconciliationRequired || result.state === "unknown") && (
            <p>{t.reconcile}</p>
          )}
          <button type="button" disabled={busy} onClick={refresh}>
            {t.refresh}
          </button>
          <p>{t.cancel}</p>
          {venue.phone && <p>{venue.phone}</p>}
          {!["submitting", "pending", "unknown"].includes(result.state) &&
            !result.reconciliationRequired && (
              <button type="button" onClick={startAnother}>
                {t.newRequest}
              </button>
            )}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (review) void send();
            else {
              setReview(true);
              setConsent(false);
            }
          }}
        >
          {(
            [
              ["time", t.time, "datetime-local"],
              ["count", t.count, "number"],
              ["name", t.name, "text"],
              ["phone", t.phone, "tel"],
              ["note", t.note, "text"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key}>
              {label}
              <input
                required={key !== "note"}
                type={type}
                value={details[key]}
                readOnly={review || Boolean(attempt)}
                min={key === "count" ? 1 : undefined}
                max={key === "count" ? 100 : undefined}
                maxLength={
                  key === "name"
                    ? 80
                    : key === "note"
                      ? 500
                      : key === "phone"
                        ? 30
                        : undefined
                }
                onChange={(e) => {
                  setDetails((d) => ({ ...d, [key]: e.target.value }));
                  setReview(false);
                  setConsent(false);
                  setError("");
                }}
              />
            </label>
          ))}
          <p>{t.caution}</p>
          {review && (
            <>
              <label className="lr-booking-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={Boolean(attempt)}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {t.disclosure}
              </label>
              {!attempt && (
                <button
                  type="button"
                  onClick={() => {
                    setReview(false);
                    setConsent(false);
                  }}
                >
                  {t.edit}
                </button>
              )}
            </>
          )}
          <button type="submit" disabled={busy || (review && !consent)}>
            {busy ? t.busy : attempt ? t.retry : review ? t.send : t.preview}
          </button>
        </form>
      )}
      {error && <p role="alert">{text(error)}</p>}
      <small>Source: HeyYumi</small>
    </section>
  );
}
