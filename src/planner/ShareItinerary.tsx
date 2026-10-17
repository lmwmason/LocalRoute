import { useEffect, useMemo, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import type { Itinerary } from "../../shared/planner";
import {
  shareSnapshot,
  sharedItineraryText,
  type ShareLink,
} from "../../shared/sharing";
import { Modal } from "../components/Modal";
import { api } from "../api";
import { useI18n } from "../i18n";
export function ShareItinerary({
  itinerary,
  onClose,
}: {
  itinerary: Itinerary;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const snapshot = useMemo(() => shareSnapshot(itinerary), [itinerary]),
    text = sharedItineraryText(snapshot);
  const [consent, setConsent] = useState(false),
    [days, setDays] = useState(7),
    [url, setUrl] = useState(""),
    [links, setLinks] = useState<ShareLink[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (itinerary.provenance !== "demo")
      api
        .shares(itinerary.id)
        .then((data) => {
          if (active) setLinks(data);
        })
        .catch((error) => {
          if (active) setError(error.message);
        });
    return () => {
      active = false;
    };
  }, [itinerary.id, itinerary.provenance]);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(t("sharing.copied"));
      setError("");
    } catch {
      setError(t("sharing.copyFailed"));
    }
  }
  return (
    <Modal title={t("sharing.title")} onClose={onClose}>
      <div className="share-itinerary">
        <p className="muted">{t("sharing.intro")}</p>
        <p className="notice-box">{t("sharing.privateExcluded")}</p>
        <details className="share-preview">
          <summary>{t("sharing.preview")}</summary>
          <pre>{text}</pre>
        </details>
        <button className="secondary full" onClick={() => void copy(text)}>
          <Copy size={17} />
          {t("sharing.copyText")}
        </button>
        {itinerary.provenance === "demo" ? (
          <p className="demo-banner">{t("sharing.demo")}</p>
        ) : (
          <>
            <label>
              {t("sharing.expiry")}
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {[1, 7, 30].map((day) => (
                  <option key={day} value={day}>
                    {t("sharing.days", { n: day })}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>{t("sharing.consent")}</span>
            </label>
            <button
              className="primary full"
              disabled={!consent || busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  const result = await api.createShare(
                    itinerary.id,
                    itinerary.revision,
                    days,
                  );
                  setUrl(new URL(result.path, window.location.origin).href);
                  setLinks(await api.shares(itinerary.id));
                  setConsent(false);
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Share2 size={18} />
              {t("sharing.create")}
            </button>
          </>
        )}
        {url && (
          <div className="share-link-result">
            <label>
              {t("sharing.link")}
              <input readOnly value={url} onFocus={(e) => e.target.select()} />
            </label>
            <div className="detail-actions">
              <button className="secondary" onClick={() => void copy(url)}>
                {t("sharing.copyLink")}
              </button>
              {typeof navigator.share === "function" && (
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      await navigator.share({ title: snapshot.title, url });
                    } catch (error) {
                      if ((error as Error).name !== "AbortError")
                        setError(t("sharing.nativeFailed"));
                    }
                  }}
                >
                  {t("sharing.native")}
                </button>
              )}
            </div>
          </div>
        )}
        {links.length > 0 && (
          <section className="share-links">
            <h3>{t("sharing.manage")}</h3>
            {links.map((link) => (
              <article key={link.id}>
                <p>
                  v{link.revision} ·{" "}
                  {new Date(link.expiresAt).toLocaleDateString(
                    language === "ko" ? "ko-KR" : "en-US",
                  )}
                </p>
                <button
                  className="text-button"
                  disabled={Boolean(link.revokedAt) || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api.revokeShare(link.id);
                      setLinks(await api.shares(itinerary.id));
                      setUrl("");
                      setNotice(t("sharing.revoked"));
                    } catch (error) {
                      setError((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t(link.revokedAt ? "sharing.revoked" : "sharing.revoke")}
                </button>
              </article>
            ))}
          </section>
        )}
        <p className="fine-print">{t("sharing.snapshot")}</p>
        {notice && (
          <p className="notice-box" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="error-message" role="alert">
            {t(error)}
          </p>
        )}
      </div>
    </Modal>
  );
}
