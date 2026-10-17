import { useEffect, useState } from "react";
import { bookingProfileSchema } from "../../shared/booking";
import { api } from "../api";
import { useI18n } from "../i18n";
export function BookingProfile({ onFinished }: { onFinished?: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [consent, setConsent] = useState(false),
    [hasProfile, setHasProfile] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .bookingProfile()
      .then((data) => {
        if (active) {
          setName(data.profile?.guestName || "");
          setPhone(data.profile?.guestPhone || "");
          setHasProfile(Boolean(data.profile));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const parsed = bookingProfileSchema.safeParse({
    guestName: name,
    guestPhone: phone,
    consentVersion: "booking-profile-v1",
  });
  return (
    <form
      className="booking-profile"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || !consent || !parsed.success) return;
        setBusy(true);
        setError("");
        setMessage("");
        try {
          await api.saveBookingProfile(parsed.data);
          setHasProfile(true);
          setConsent(false);
          setMessage(t("booking.profileSaved"));
          onFinished?.();
        } catch (error) {
          setError(t((error as Error).message));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{t("booking.profileTitle")}</h3>
      <p className="muted">{t("booking.profileHelp")}</p>
      {loading ? (
        <p role="status">{t("common.loading")}</p>
      ) : (
        <>
          <label>
            {t("booking.name")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="name"
            />
          </label>
          <label>
            {t("booking.phone")}
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
              autoComplete="tel"
              inputMode="tel"
              placeholder="+82 10 1234 5678"
            />
          </label>
          <p className="fine-print">{t("booking.phoneHelp")}</p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>{t("booking.profileConsent")}</span>
          </label>
          <button
            className="primary full"
            disabled={busy || !consent || !parsed.success}
          >
            {t("booking.saveProfile")}
          </button>
          {onFinished && (
            <button
              type="button"
              className="text-button full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.skipBookingProfile();
                  onFinished();
                } catch (error) {
                  setError(t((error as Error).message));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("booking.skip")}
            </button>
          )}
          {hasProfile && (
            <button
              type="button"
              className="text-button full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.deleteBookingProfile();
                  setName("");
                  setPhone("");
                  setHasProfile(false);
                  setConsent(false);
                  setMessage(t("booking.profileDeleted"));
                } catch (error) {
                  setError(t((error as Error).message));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("booking.deleteProfile")}
            </button>
          )}
        </>
      )}
      {error && (
        <p className="error-message" role="alert">
          {t(error)}
        </p>
      )}
      {message && (
        <p className="notice-box" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
