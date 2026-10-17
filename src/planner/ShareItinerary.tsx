import { useEffect, useMemo, useRef, useState } from "react";
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
import "./sharing.css";

const messages = {
  ko: {
    creating: "공유 링크를 만들고 있어요…",
    created: "공유 링크를 만들었어요. 아래에서 공유하거나 복사해 주세요.",
    opening: "공유 메뉴를 여는 중…",
    shared: "공유 메뉴에 전달했어요. 상대방의 수신 여부는 확인할 수 없어요.",
    cancelled: "공유를 취소했어요. 링크를 복사하거나 직접 선택할 수 있어요.",
    unsupported:
      "이 브라우저는 휴대폰 공유창을 지원하지 않아요. 복사 또는 링크 선택을 이용해 주세요.",
    select: "링크 직접 선택",
    selected: "링크를 선택했어요. 복사 메뉴나 Ctrl/Cmd+C로 복사해 주세요.",
    manual: "직접 복사할 일정 텍스트",
    loading: "내 공유 링크를 불러오고 있어요…",
    retry: "목록 다시 확인",
    active: "사용 가능",
    expired: "만료됨",
    expires: "만료",
    revoking: "공유 해제 중…",
    listFailed:
      "공유 링크 목록을 불러오지 못했어요. 새로 만든 링크가 있다면 아래에서 계속 사용할 수 있어요.",
    expiredHelp:
      "이 링크는 만료되어 더 이상 열 수 없어요. 다시 동의한 뒤 새 링크를 만들어 주세요.",
    private: "계정 이메일도 공유 내용에 포함하지 않아요.",
  },
  en: {
    creating: "Creating your sharing link…",
    created: "Sharing link created. Share or copy it below.",
    opening: "Opening the sharing menu…",
    shared: "Sent to the sharing menu. Recipient delivery cannot be verified.",
    cancelled: "Sharing cancelled. You can still copy or select the link.",
    unsupported:
      "This browser does not support the sharing menu. Copy or select the link instead.",
    select: "Select link manually",
    selected: "Link selected. Use the Copy menu or Ctrl/Cmd+C to copy it.",
    manual: "Itinerary text for manual copying",
    loading: "Loading your sharing links…",
    retry: "Retry loading links",
    active: "Active",
    expired: "Expired",
    expires: "Expires",
    revoking: "Revoking sharing…",
    listFailed:
      "Could not load your sharing links. Any link just created can still be used below.",
    expiredHelp:
      "This link has expired and can no longer be opened. Give consent again to create a new one.",
    private: "Your account email is also excluded from sharing.",
  },
};
const safeErrors = new Set([
  "sharing.changed",
  "sharing.limit",
  "sharing.invalid",
  "sharing.failed",
]);
export function ShareItinerary(props: {
  itinerary: Itinerary;
  onClose: () => void;
}) {
  return (
    <SharePanel
      key={`${props.itinerary.id}:${props.itinerary.revision}`}
      {...props}
    />
  );
}
function SharePanel({
  itinerary,
  onClose,
}: {
  itinerary: Itinerary;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const m = messages[language];
  const snapshot = useMemo(() => shareSnapshot(itinerary), [itinerary]);
  const text = sharedItineraryText(snapshot);
  const [consent, setConsent] = useState(false),
    [days, setDays] = useState(7);
  const [created, setCreated] = useState<(ShareLink & { url: string }) | null>(
    null,
  );
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [busy, setBusy] = useState<"create" | "revoke" | "native" | null>(null);
  const [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [manual, setManual] = useState(false),
    [loading, setLoading] = useState(itinerary.provenance !== "demo");
  const [listFailed, setListFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const linkInput = useRef<HTMLInputElement>(null),
    manualInput = useRef<HTMLTextAreaElement>(null);
  const lock = useRef(false),
    mounted = useRef(false);
  const activeUrl =
    created && !created.revokedAt && Date.parse(created.expiresAt) > now
      ? created.url
      : "";
  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (itinerary.provenance !== "demo")
      api
        .shares(itinerary.id)
        .then((data) => {
          if (active) {
            setLinks(data);
            setListFailed(false);
          }
        })
        .catch(() => {
          if (active) setListFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
    };
  }, [itinerary.id, itinerary.provenance, attempt]);
  useEffect(() => {
    if (manual) {
      manualInput.current?.focus();
      manualInput.current?.select();
    }
  }, [manual]);
  function failure(value: unknown) {
    setError(
      t(
        value instanceof Error && safeErrors.has(value.message)
          ? value.message
          : "sharing.failed",
      ),
    );
  }
  function selectLink() {
    if (!created || Date.parse(created.expiresAt) <= Date.now()) {
      setNow(Date.now());
      return;
    }
    linkInput.current?.focus();
    linkInput.current?.select();
    setNotice(m.selected);
  }
  async function copy(value: string, kind: "link" | "text") {
    if (
      kind === "link" &&
      (!created || Date.parse(created.expiresAt) <= Date.now())
    ) {
      setNow(Date.now());
      return;
    }
    setError("");
    setNotice("");
    try {
      await navigator.clipboard.writeText(value);
      if (mounted.current) setNotice(t("sharing.copied"));
    } catch {
      if (!mounted.current) return;
      setError(t("sharing.copyFailed"));
      if (kind === "link") selectLink();
      else {
        setManual(true);
        manualInput.current?.focus();
        manualInput.current?.select();
      }
    }
  }
  async function nativeShare() {
    if (!activeUrl || lock.current) return;
    if (Date.parse(created!.expiresAt) <= Date.now()) {
      setNow(Date.now());
      return;
    }
    setError("");
    setNotice("");
    if (typeof navigator.share !== "function") {
      setNotice(m.unsupported);
      return;
    }
    lock.current = true;
    setBusy("native");
    try {
      // This runs directly in a user click, preserving transient activation.
      await navigator.share({ title: snapshot.title, url: activeUrl });
      if (mounted.current) setNotice(m.shared);
    } catch (value) {
      if (!mounted.current) return;
      if (
        value &&
        typeof value === "object" &&
        "name" in value &&
        value.name === "AbortError"
      )
        setNotice(m.cancelled);
      else setError(t("sharing.nativeFailed"));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  return (
    <Modal title={t("sharing.title")} onClose={onClose}>
      <div className="share-itinerary">
        <p className="muted">{t("sharing.intro")}</p>
        <p className="notice-box">
          {t("sharing.privateExcluded")} {m.private}
        </p>
        <details className="share-preview">
          <summary>{t("sharing.preview")}</summary>
          <pre>{text}</pre>
        </details>
        <button
          type="button"
          className="secondary full"
          onClick={() => void copy(text, "text")}
        >
          <Copy size={17} />
          {t("sharing.copyText")}
        </button>
        {manual && (
          <label>
            {m.manual}
            <textarea
              ref={manualInput}
              readOnly
              value={text}
              onFocus={(event) => event.target.select()}
              rows={7}
            />
          </label>
        )}
        {itinerary.provenance === "demo" ? (
          <p className="demo-banner">{t("sharing.demo")}</p>
        ) : (
          <>
            <label>
              {t("sharing.expiry")}
              <select
                disabled={Boolean(busy)}
                value={days}
                onChange={(event) => {
                  setDays(Number(event.target.value));
                  setConsent(false);
                }}
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
                disabled={Boolean(busy)}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>{t("sharing.consent")}</span>
            </label>
            <button
              type="button"
              className="primary full"
              disabled={!consent || Boolean(busy) || loading}
              onClick={async () => {
                if (!consent || lock.current) return;
                lock.current = true;
                setBusy("create");
                setError("");
                setNotice("");
                try {
                  const result = await api.createShare(
                    itinerary.id,
                    itinerary.revision,
                    days,
                  );
                  if (!mounted.current) return;
                  const url = new URL(result.path, window.location.origin);
                  if (
                    url.origin !== window.location.origin ||
                    !/^\/s\/[-_A-Za-z0-9]{43}$/.test(url.pathname) ||
                    url.search ||
                    url.hash
                  )
                    throw new Error("sharing.failed");
                  setCreated({ ...result, url: url.href });
                  setLinks((current) => [
                    result,
                    ...current.filter((link) => link.id !== result.id),
                  ]);
                  setConsent(false);
                  setNow(Date.now());
                  setNotice(m.created);
                } catch (value) {
                  if (mounted.current) failure(value);
                } finally {
                  lock.current = false;
                  if (mounted.current) setBusy(null);
                }
              }}
            >
              <Share2 size={18} />
              {busy === "create" ? m.creating : t("sharing.create")}
            </button>
          </>
        )}
        {activeUrl && (
          <div className="share-link-result">
            <label>
              {t("sharing.link")}
              <input
                ref={linkInput}
                readOnly
                value={activeUrl}
                onFocus={(event) => event.target.select()}
              />
            </label>
            <p className="fine-print">
              {m.expires}:{" "}
              {new Date(created!.expiresAt).toLocaleString(
                language === "ko" ? "ko-KR" : "en-GB",
              )}
            </p>
            <div className="share-result-actions">
              <button
                type="button"
                className="primary"
                disabled={Boolean(busy)}
                onClick={() => void nativeShare()}
              >
                {busy === "native" ? m.opening : t("sharing.native")}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void copy(activeUrl, "link")}
              >
                {t("sharing.copyLink")}
              </button>
              <button type="button" className="secondary" onClick={selectLink}>
                {m.select}
              </button>
            </div>
            {typeof navigator.share !== "function" && (
              <p className="fine-print">{m.unsupported}</p>
            )}
          </div>
        )}
        {created && !created.revokedAt && !activeUrl && (
          <p role="status" className="notice-box">
            {m.expiredHelp}
          </p>
        )}
        {loading && <p role="status">{m.loading}</p>}
        {listFailed && (
          <div>
            <p role="alert">{m.listFailed}</p>
            <button
              type="button"
              className="secondary"
              disabled={loading || Boolean(busy)}
              onClick={() => {
                setLoading(true);
                setAttempt(attempt + 1);
              }}
            >
              {m.retry}
            </button>
          </div>
        )}
        {links.length > 0 && (
          <section className="share-links">
            <h3>{t("sharing.manage")}</h3>
            {links.map((link) => {
              const expired = Date.parse(link.expiresAt) <= now;
              return (
                <article key={link.id}>
                  <p>
                    v{link.revision} ·{" "}
                    <strong>
                      {link.revokedAt
                        ? t("sharing.revoked")
                        : expired
                          ? m.expired
                          : m.active}
                    </strong>
                    <br />
                    {m.expires}:{" "}
                    {new Date(link.expiresAt).toLocaleString(
                      language === "ko" ? "ko-KR" : "en-GB",
                    )}
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    disabled={
                      Boolean(link.revokedAt) ||
                      expired ||
                      Boolean(busy) ||
                      loading
                    }
                    onClick={async () => {
                      if (lock.current) return;
                      lock.current = true;
                      setBusy("revoke");
                      setError("");
                      setNotice("");
                      try {
                        await api.revokeShare(link.id);
                        if (!mounted.current) return;
                        const revokedAt = new Date().toISOString();
                        setLinks((current) =>
                          current.map((item) =>
                            item.id === link.id ? { ...item, revokedAt } : item,
                          ),
                        );
                        setCreated((current) =>
                          current?.id === link.id
                            ? { ...current, revokedAt }
                            : current,
                        );
                        setNotice(t("sharing.revoked"));
                      } catch (value) {
                        if (mounted.current) failure(value);
                      } finally {
                        lock.current = false;
                        if (mounted.current) setBusy(null);
                      }
                    }}
                  >
                    {link.revokedAt
                      ? t("sharing.revoked")
                      : expired
                        ? m.expired
                        : busy === "revoke"
                          ? m.revoking
                          : t("sharing.revoke")}
                  </button>
                </article>
              );
            })}
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
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
