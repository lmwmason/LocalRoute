import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  LEGAL_VERSION,
  type LegalConsent,
  type LegalStatus,
} from "../../shared/legal";
import { useI18n } from "../i18n";
import { ConsentFields, emptyChoices, requiredAccepted } from "./ConsentFields";
import { requestLegalConsent } from "./client";

// Keying by verified Auth user prevents a previous account's result opening the gate.
export function LegalConsentGate(props: {
  userId: string;
  children: ReactNode;
  settings?: boolean;
}) {
  const { language } = useI18n();
  return <Gate key={`${props.userId}:${language}`} {...props} />;
}
function Gate({
  children,
  settings = false,
}: {
  userId: string;
  children: ReactNode;
  settings?: boolean;
}) {
  const { language } = useI18n();
  const ko = language === "ko";
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [choices, setChoices] = useState(emptyChoices);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<LegalConsent | null>(null);
  useEffect(() => {
    let active = true;
    requestLegalConsent()
      .then((data) => {
        if (active) {
          setStatus(data);
          setChoices({
            ...emptyChoices,
            publicLocalArea: data.publicLocalArea,
          });
        }
      })
      .catch(() => {
        if (active)
          setMessage(
            ko
              ? "동의 기록을 확인하지 못했어요. 다시 시도해 주세요."
              : "Could not check consent. Please retry.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt, ko]);
  if (loading)
    return (
      <p role="status">{ko ? "동의 기록 확인 중…" : "Checking consent…"}</p>
    );
  if (!status)
    return (
      <div className="legal-gate">
        <p role="alert">{message}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setMessage("");
            setAttempt(attempt + 1);
          }}
        >
          {ko ? "다시 확인" : "Retry"}
        </button>
      </div>
    );
  if (status.current && !settings) return <>{children}</>;
  return (
    <form
      className="legal-gate"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!requiredAccepted(choices) || busy) return;
        setBusy(true);
        setMessage("");
        pending.current ||= {
          ...choices,
          terms: true,
          privacy: true,
          supabaseTransfer: true,
          adult: true,
          requestId: crypto.randomUUID(),
          version: LEGAL_VERSION,
          language,
        };
        try {
          const data = await requestLegalConsent(pending.current);
          setStatus(data);
          pending.current = null;
          setMessage(
            ko ? "동의 설정을 저장했어요." : "Consent settings saved.",
          );
        } catch {
          setMessage(
            ko
              ? "저장하지 못했어요. 동의는 완료되지 않았습니다. 다시 시도해 주세요."
              : "Could not save. Consent is incomplete. Please retry.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>
        {ko
          ? "이메일 확인 후 동의를 완료해 주세요"
          : "Complete consent after verifying your email"}
      </h2>
      <ConsentFields
        value={choices}
        disabled={busy}
        onChange={(value) => {
          pending.current = null;
          setChoices(value);
        }}
      />
      <button
        className="primary full"
        disabled={!requiredAccepted(choices) || busy}
      >
        {busy
          ? ko
            ? "저장 중…"
            : "Saving…"
          : ko
            ? "동의 설정 저장"
            : "Save consent settings"}
      </button>
      {status.recordedAt && (
        <p>
          {ko ? "마지막 서버 기록" : "Last server record"}: {status.recordedAt}{" "}
          · {status.version}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}
