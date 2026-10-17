import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
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
type Phase =
  "checking" | "loadError" | "ready" | "saving" | "saveError" | "saved";
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
  const titleId = useId(),
    helpId = useId();
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [choices, setChoices] = useState(emptyChoices);
  const [phase, setPhase] = useState<Phase>("checking");
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<LegalConsent | null>(null);
  const lock = useRef(false);
  const mounted = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const busy = phase === "saving";
  useEffect(() => {
    mounted.current = true;
    let active = true;
    requestLegalConsent()
      .then((data) => {
        if (!active) return;
        setStatus(data);
        setChoices({ ...emptyChoices, publicLocalArea: data.publicLocalArea });
        setPhase("ready");
      })
      .catch(() => {
        if (active) setPhase("loadError");
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (phase === "loadError" || phase === "saveError" || phase === "saved")
      feedback.current?.focus();
    else if (phase === "ready" && attempt > 0) heading.current?.focus();
  }, [phase, attempt]);
  const success = (
    <div
      className="legal-feedback legal-feedback-success"
      role="status"
      tabIndex={-1}
      ref={feedback}
    >
      <CheckCircle2 aria-hidden="true" size={22} />
      <div>
        <strong>
          {ko ? "동의 설정을 저장했어요." : "Consent settings saved."}
        </strong>
        <p>
          {ko
            ? "선택한 내용이 반영되었어요. 계속 이용하실 수 있어요."
            : "Your choices are saved. You can continue using member features."}
        </p>
      </div>
    </div>
  );
  if (status?.current && !settings)
    return (
      <>
        {phase === "saved" && (
          <div className="legal-gate-complete">{success}</div>
        )}
        {children}
      </>
    );
  const checking = phase === "checking",
    failed = phase === "loadError";
  return (
    <section
      className="legal-gate legal-gate-card"
      data-state={phase}
      aria-labelledby={titleId}
    >
      <header className="legal-gate-header">
        <span className="legal-gate-icon" aria-hidden="true">
          <ShieldCheck size={26} />
        </span>
        <p className="legal-gate-eyebrow">
          LocalRoute · {ko ? "이용 동의" : "Your consent"}
        </p>
        <h2 id={titleId} ref={heading} tabIndex={-1}>
          {checking
            ? ko
              ? "동의 설정을 확인하고 있어요"
              : "Checking your consent settings"
            : failed
              ? ko
                ? "동의 기록을 확인하지 못했어요"
                : "Could not check consent"
              : settings
                ? ko
                  ? "내 동의 설정"
                  : "Your consent settings"
                : ko
                  ? "안심하고 시작할 수 있도록"
                  : "A clear choice before you start"}
        </h2>
        <p className="legal-gate-description">
          {checking
            ? ko
              ? "저장된 선택을 불러오고 있어요. 잠시만 기다려 주세요."
              : "We are loading your saved choices. Please wait a moment."
            : failed
              ? ko
                ? "연결이 원활하지 않아요. 아래 버튼을 눌러 다시 확인해 주세요. 확인 전에는 회원 기능을 열지 않아요."
                : "We could not connect. Use the button below to try again. Member features stay locked until consent is checked."
              : ko
                ? "필수 항목과 안내를 확인해 주세요. 선택 동의는 거절해도 회원 기능을 이용할 수 있어요."
                : "Review the required choices and notices. Optional consent is not needed to use member features."}
        </p>
      </header>
      {checking ? (
        <div className="legal-gate-wait" role="status" aria-live="polite">
          <LoaderCircle
            className="legal-spinner"
            aria-hidden="true"
            size={24}
          />
          <span>
            {attempt > 0
              ? ko
                ? "동의 기록을 다시 확인하고 있어요…"
                : "Checking your consent again…"
              : ko
                ? "동의 기록 확인 중…"
                : "Checking consent…"}
          </span>
          <div className="legal-loading-lines" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      ) : failed ? (
        <div className="legal-gate-recovery">
          <div
            className="legal-feedback legal-feedback-error"
            role="alert"
            ref={feedback}
            tabIndex={-1}
          >
            <CircleAlert aria-hidden="true" size={22} />
            <p>
              {ko
                ? "동의 기록을 확인하지 못했어요. 다시 시도해 주세요."
                : "Could not check consent. Please retry."}
            </p>
          </div>
          <button
            className="legal-gate-action"
            type="button"
            onClick={() => {
              setPhase("checking");
              setAttempt(attempt + 1);
            }}
          >
            {ko ? "다시 확인" : "Retry"}
          </button>
        </div>
      ) : (
        <form
          className="legal-gate-form"
          aria-busy={busy}
          onSubmit={async (event) => {
            event.preventDefault();
            if (!requiredAccepted(choices) || lock.current) return;
            lock.current = true;
            setPhase("saving");
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
              if (!mounted.current) return;
              // A successful HTTP response alone must never unlock the gate.
              if (!data.current) throw new Error("Consent not recorded");
              setStatus(data);
              pending.current = null;
              setPhase("saved");
            } catch {
              if (mounted.current) setPhase("saveError");
            } finally {
              lock.current = false;
            }
          }}
        >
          <ConsentFields
            value={choices}
            disabled={busy}
            onChange={(value) => {
              pending.current = null;
              setChoices(value);
              setPhase("ready");
            }}
          />
          <div className="legal-save-area">
            <p id={helpId} className="legal-save-help">
              {!requiredAccepted(choices)
                ? ko
                  ? "필수 항목 4개를 모두 확인하면 저장할 수 있어요."
                  : "Confirm all four required choices to enable saving."
                : ko
                  ? "저장 버튼을 누르면 선택한 동의 내용이 반영돼요."
                  : "Select Save consent settings to record these choices."}
            </p>
            <button
              className="legal-gate-action"
              aria-describedby={helpId}
              disabled={!requiredAccepted(choices) || busy}
            >
              {busy && (
                <LoaderCircle
                  className="legal-spinner"
                  aria-hidden="true"
                  size={20}
                />
              )}
              {busy
                ? ko
                  ? "저장 중…"
                  : "Saving…"
                : ko
                  ? "동의 설정 저장"
                  : "Save consent settings"}
            </button>
            <div className="legal-save-feedback">
              {phase === "saving" && (
                <p role="status">
                  {ko
                    ? "동의 내용을 저장하고 있어요. 잠시만 기다려 주세요."
                    : "Saving your choices. Please wait a moment."}
                </p>
              )}
              {phase === "saveError" && (
                <div
                  className="legal-feedback legal-feedback-error"
                  role="alert"
                  ref={feedback}
                  tabIndex={-1}
                >
                  <CircleAlert aria-hidden="true" size={22} />
                  <div>
                    <strong>
                      {ko
                        ? "저장하지 못했어요. 동의는 완료되지 않았습니다."
                        : "Could not save. Consent is incomplete."}
                    </strong>
                    <p>
                      {ko
                        ? "선택한 항목은 유지했어요. 연결을 확인한 뒤 동의 설정 저장을 다시 눌러 주세요."
                        : "Your choices are kept. Check your connection, then select Save consent settings again."}
                    </p>
                  </div>
                </div>
              )}
              {phase === "saved" && success}
            </div>
            {status?.recordedAt && (
              <p className="legal-recorded">
                {ko ? "마지막 저장" : "Last saved"}:{" "}
                {new Date(status.recordedAt).toLocaleString(
                  ko ? "ko-KR" : "en-GB",
                )}{" "}
                · {status.version}
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
