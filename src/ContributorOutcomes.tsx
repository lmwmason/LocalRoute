import { useEffect, useId, useState } from "react";
import type { ContributorOutcomesResult } from "../shared/contributor-outcomes";
import {
  ContributorOutcomesError,
  loadContributorOutcomes,
  type LoadContributorOutcomes,
} from "./visit-rewards/contributor-outcomes-api";
import "./contributor-outcomes.css";

type Props = {
  /** The host's verified account ID; pass null when signed out/checking authentication. */
  userId: string | null;
  language?: "ko" | "en";
  load?: LoadContributorOutcomes;
};
const messages = {
  ko: {
    title: "내 추천의 평가·보상 현황",
    intro:
      "추천의 각 버전에 남겨진 도움 평가와 실제 지급 내역이에요. 장소 전체의 만족도와는 별개예요.",
    loading: "내 추천 내역을 불러오는 중이에요…",
    error: "내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    auth: "로그인한 본인의 추천 내역만 볼 수 있어요. 로그인 상태를 확인해 주세요.",
    retry: "다시 시도",
    refresh: "새로고침",
    empty: "아직 등록한 추천이 없어요.",
    missing: "미집계",
    placeMissing: "장소명 미집계",
    ratings: "이 버전 평가 수",
    helpful: "도움 점수 평균",
    paid: "실제 지급 LP",
    pending: "보상 검토 중",
    awaiting: "승인 · 미지급",
    none: "검토 중 내역 없음",
    note: "도움 점수는 5점 만점이에요. 검토·승인은 지급을 보장하지 않으며, 실제 지급 LP는 보상 기록과 원장에서 확인된 누적 금액이에요. 현재 잔액이 아니에요.",
    pendingVersion: "추천 검토 중",
    published: "게시됨",
    rejected: "추천 반려",
    superseded: "이전 버전",
  },
  en: {
    title: "My recommendation outcomes",
    intro:
      "Helpfulness ratings and actual rewards for each version of your recommendations. Separate from overall place satisfaction.",
    loading: "Loading your recommendations…",
    error: "We couldn’t load your outcomes. Please try again.",
    auth: "Only your own recommendations are available. Please check that you’re signed in.",
    retry: "Try again",
    refresh: "Refresh",
    empty: "You haven’t added any recommendations yet.",
    missing: "Not available",
    placeMissing: "Place name unavailable",
    ratings: "Ratings for this version",
    helpful: "Average helpfulness",
    paid: "LP actually paid",
    pending: "Reward review pending",
    awaiting: "Approved · not paid",
    none: "No reviews pending",
    note: "Helpfulness is out of 5. Review or approval does not guarantee payment. Paid LP is the cumulative amount confirmed in reward records and your ledger, not your current balance.",
    pendingVersion: "Recommendation under review",
    published: "Published",
    rejected: "Recommendation rejected",
    superseded: "Previous version",
  },
} as const;

export function ContributorOutcomes({
  userId,
  language = "ko",
  load = loadContributorOutcomes,
}: Props) {
  // Remount on account changes: old private rows never appear under a new account.
  return (
    <Outcomes
      key={userId ?? "signed-out"}
      userId={userId}
      language={language}
      load={load}
    />
  );
}

function Outcomes({
  userId,
  language = "ko",
  load = loadContributorOutcomes,
}: Props) {
  const t = messages[language],
    heading = useId();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { kind: "loading" | "error" | "auth" }
    | { kind: "ready"; result: ContributorOutcomesResult }
  >({ kind: userId ? "loading" : "auth" });
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    load(userId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setState({ kind: "ready", result });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            kind:
              error instanceof ContributorOutcomesError &&
              [401, 403].includes(error.status)
                ? "auth"
                : "error",
          });
      });
    return () => controller.abort();
  }, [userId, load, attempt]);
  function reload() {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }
  const format = new Intl.NumberFormat(language === "ko" ? "ko-KR" : "en-US", {
    maximumFractionDigits: 1,
  });
  return (
    <section
      className="contributor-outcomes"
      aria-labelledby={heading}
      lang={language}
    >
      <header>
        <h2 id={heading}>{t.title}</h2>
        <p>{t.intro}</p>
      </header>
      {state.kind === "loading" && (
        <p role="status" aria-live="polite">
          {t.loading}
        </p>
      )}
      {(state.kind === "error" || state.kind === "auth") && (
        <div role="alert">
          <p>{state.kind === "auth" ? t.auth : t.error}</p>
          {userId && (
            <button type="button" onClick={reload}>
              {t.retry}
            </button>
          )}
        </div>
      )}
      {state.kind === "ready" && (
        <>
          <button
            className="contributor-outcomes-refresh"
            type="button"
            onClick={reload}
          >
            {t.refresh}
          </button>
          {!state.result.items.length && <p role="status">{t.empty}</p>}
          <ul>
            {state.result.items.map((item) => (
              <li key={item.versionId ?? item.endorsementId}>
                <article>
                  <h3>{item.placeName || t.placeMissing}</h3>
                  <p className="contributor-outcomes-version">
                    {item.versionNumber === null
                      ? t.missing
                      : `${language === "ko" ? "버전" : "Version"} ${item.versionNumber}`}{" "}
                    ·{" "}
                    {item.status === null
                      ? t.missing
                      : t[
                          item.status === "pending"
                            ? "pendingVersion"
                            : item.status
                        ]}
                  </p>
                  {item.text && (
                    <p className="contributor-outcomes-text">{item.text}</p>
                  )}
                  <dl>
                    <div>
                      <dt>{t.ratings}</dt>
                      <dd>{format.format(item.ratingCount)}</dd>
                    </div>
                    <div>
                      <dt>{t.helpful}</dt>
                      <dd>
                        {item.helpfulnessAverage === null
                          ? t.missing
                          : `${format.format(item.helpfulnessAverage)} / 5`}
                      </dd>
                    </div>
                    <div>
                      <dt>{t.paid}</dt>
                      <dd>{format.format(item.paidLp)} LP</dd>
                    </div>
                  </dl>
                  <p className="contributor-outcomes-review">
                    {item.pendingReviewCount
                      ? `${t.pending}: ${format.format(item.pendingReviewCount)}`
                      : t.none}
                  </p>
                  {item.awaitingPayoutCount > 0 && (
                    <p>
                      {t.awaiting}: {format.format(item.awaitingPayoutCount)}
                    </p>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="contributor-outcomes-note">{t.note}</p>
    </section>
  );
}
