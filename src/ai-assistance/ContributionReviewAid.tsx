import { useI18n } from "../i18n";
import type { ReviewAssistanceResult } from "../../shared/ai-assistance";
import { failures } from "./messages";
import "./assistance.css";

const categories = {
  instruction_like_text: ["지시문 형태의 내용", "Instruction-like content"],
  content_concern: ["내용 확인 필요", "Content needs checking"],
  factual_claim_needs_check: [
    "사실 주장 확인 필요",
    "Factual claim needs checking",
  ],
  insufficient_context: ["판단 자료 부족", "Insufficient context"],
};
const uncertainty = {
  insufficient_context: ["추가 맥락이 필요해요.", "More context is needed."],
  cannot_verify_visit: [
    "방문 사실을 확인할 수 없어요.",
    "A visit cannot be verified.",
  ],
  cannot_verify_authenticity: [
    "진위를 독립적으로 확인할 수 없어요.",
    "Authenticity is not independently verified.",
  ],
  not_fraud_probability: [
    "이 신호는 부정행위 확률이 아니에요.",
    "These signals are not fraud probabilities.",
  ],
};
export function ContributionReviewAid({
  result,
  loading = false,
  language,
}: {
  result?: ReviewAssistanceResult;
  loading?: boolean;
  language?: "ko" | "en";
}) {
  const context = useI18n();
  const ko = (language ?? context.language) === "ko",
    t = (k: string, e: string) => (ko ? k : e);
  return (
    <section
      className="ai-assistance"
      lang={ko ? "ko" : "en"}
      aria-label={t("관리자 검토 보조", "Moderator review aid")}
      aria-busy={loading}
    >
      <h3>
        {t("검토 보조 · 사람이 판단해요", "Review aid · a human decides")}
      </h3>
      <p>
        {t(
          "자동 게시·차단·LP 지급은 하지 않아요. 원문과 근거를 직접 확인해 주세요.",
          "No automatic publishing, bans or LP payments. Check the original contribution and evidence yourself.",
        )}
      </p>
      {loading ? (
        <p role="status">
          {t(
            "검토 참고 자료를 준비하고 있어요…",
            "Preparing review assistance…",
          )}
        </p>
      ) : result?.status === "failed" ? (
        <p role="alert">{failures[result.code][ko ? 0 : 1]}</p>
      ) : result?.status === "ready" ? (
        <>
          <p>
            {t("권장 검토 조치", "Suggested review action")}:{" "}
            {result.data.recommendedAction === "human_review"
              ? t("사람의 검토", "Human review")
              : t("추가 자료 요청 검토", "Consider requesting clarification")}
          </p>
          {!result.data.signals.length && (
            <p>
              {t(
                "보고된 신호가 없어도 안전·진위가 검증된 것은 아니에요.",
                "No reported signals does not establish safety or authenticity.",
              )}
            </p>
          )}
          <ul>
            {result.data.signals.map((signal, i) => (
              <li key={i}>
                {categories[signal.category][ko ? 0 : 1]}
                <ul>
                  {signal.evidence.map((e, j) => (
                    <li key={j}>
                      {e.ref === "title"
                        ? t("제목", "Title")
                        : t("본문", "Body")}
                      : <q>{e.quote}</q>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {result.data.uncertainty.map((code) => (
            <p key={code}>{uncertainty[code][ko ? 0 : 1]}</p>
          ))}
          <small>
            {t("출처", "Source")}:{" "}
            {result.metadata.source === "deterministic"
              ? t("규칙 검사", "Deterministic checks")
              : "Gemini"}{" "}
            · {result.metadata.model} · {result.metadata.promptVersion} ·{" "}
            <time dateTime={result.metadata.completedAt}>
              {result.metadata.completedAt}
            </time>
          </small>
        </>
      ) : (
        <p>{t("아직 검토 보조 결과가 없어요.", "No review assistance yet.")}</p>
      )}
    </section>
  );
}
