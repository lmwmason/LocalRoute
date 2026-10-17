import { useEffect, useState } from "react";
import {
  automatedTriageSchema,
  type AutomatedTriage,
} from "../../shared/admin-automation";
import { useI18n } from "../i18n";
import { supabase } from "../supabase";

/** Mount after the existing server-verified admin queue/auth check. */
export function AdminAutomation() {
  const { language } = useI18n();
  const ko = language === "ko";
  const [result, setResult] = useState<AutomatedTriage>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = (await supabase?.auth.getSession())?.data.session
          ?.access_token;
        if (!token) throw new Error("AUTH_REQUIRED");
        const response = await fetch("/api/admin/automation/triage", {
          method: "POST",
          cache: "no-store",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ language }),
        });
        if (!response.ok) throw new Error("TRIAGE_UNAVAILABLE");
        const data = automatedTriageSchema.parse(await response.json());
        if (active) {
          setResult(data);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [language, attempt]);
  return (
    <section className="notice-box" aria-live="polite">
      <h2>{ko ? "Gemini 자동 분류" : "Automatic Gemini triage"}</h2>
      <p>
        {ko
          ? "이 화면을 열면 대기 항목의 근거와 우선순위를 자동으로 분석합니다. 자동 승인·게시·보상 지급은 하지 않습니다."
          : "Opening this screen automatically analyzes queued evidence and priority. It does not approve, publish or issue rewards."}
      </p>
      {!result && !error && (
        <p role="status">
          {ko ? "자동 분류 중…" : "Running automatic triage…"}
        </p>
      )}
      {error && (
        <p role="alert">
          {ko
            ? "자동 분류가 비활성화되었거나 응답을 받지 못했어요. 기존 검토 대기 목록은 사용할 수 있어요."
            : "Automatic triage is disabled or unavailable. The existing review queue remains available."}
        </p>
      )}
      {result && (
        <>
          <p>
            {ko
              ? `${result.items.filter((item) => item.assessment.status === "ready").length}건 분석 · ${result.remaining + result.items.filter((item) => item.assessment.status === "failed").length}건 미분석`
              : `${result.items.filter((item) => item.assessment.status === "ready").length} analyzed · ${result.remaining + result.items.filter((item) => item.assessment.status === "failed").length} not analyzed`}
          </p>
          <ul>
            {result.items.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                {item.kind} · {item.id.slice(0, 8)} ·{" "}
                {item.priority === "high"
                  ? ko
                    ? "우선 검토"
                    : "High priority"
                  : item.priority === "needs_information"
                    ? ko
                      ? "추가 확인 필요"
                      : "Needs information"
                    : ko
                      ? "일반 검토"
                      : "Normal review"}
                {item.assessment.status === "ready" ? (
                  <ul>
                    {item.assessment.data.signals.flatMap((signal) =>
                      signal.evidence.map((evidence, index) => (
                        <li key={`${signal.category}-${index}`}>
                          {evidence.quote}
                        </li>
                      )),
                    )}
                  </ul>
                ) : (
                  <span> · {ko ? "분석 불가" : "Analysis unavailable"}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p>
        {ko
          ? "현재 화면 실행 방식이며 서버 재시작·다른 서버 간 중복 차단과 상시 백그라운드 처리는 아직 지원하지 않습니다."
          : "Runs while this screen is open. Durable deduplication across servers/restarts and continuous background processing are not supported yet."}
      </p>
      <button
        type="button"
        className="secondary"
        disabled={!result && !error}
        onClick={() => {
          setResult(undefined);
          setError(false);
          setAttempt((value) => value + 1);
        }}
      >
        {ko ? "다음 항목 분류 / 다시 확인" : "Analyze next items / retry"}
      </button>
    </section>
  );
}
