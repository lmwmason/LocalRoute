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
import "./booking.css";

type Props = {
  api: BookingApi;
  placeId: string;
  language?: "ko" | "en";
  onReservation?: (reservation: Reservation) => void;
};
export function BookingButton(props: Props) {
  const { api, placeId, language = "ko" } = props;
  const t = messages[language];
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [fallback, setFallback] = useState<BookingVenue>();
  useEffect(() => {
    let active = true;
    api
      .capabilities()
      .then(async (v) => {
        if (!v.enabled) return;
        const venue = await api.venue(placeId);
        if (active) {
          setEnabled(venue.supported);
          setFallback(venue);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, placeId]);
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
export function BookingForm({
  api,
  placeId,
  language = "ko",
  onReservation,
}: Props) {
  const t = messages[language];
  const uid = useId();
  const [venue, setVenue] = useState<BookingVenue>();
  const [details, setDetails] = useState({
    time: "",
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
  const storageKey = `localroute.booking.request.${placeId}`;
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
    setDetails((d) => ({ ...d, time: "", note: "" }));
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
                  setConsent(false);
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
