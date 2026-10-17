import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { config } from "../config";
import type { AdminData, QueueItem } from "../../shared/community";
import { decisionSchema } from "../../shared/community";
import { PlacePhoto } from "./PlacePhoto";
import { ContributionReviewAid } from "../ai-assistance/ContributionReviewAid";
import { aiAssistance } from "../ai-assistance/host-client";
import type { ReviewAssistanceResult } from "../../shared/ai-assistance";
import { useI18n } from "../i18n";
import { VisitRewardAdminPanel } from "../visit-rewards/VisitRewards";
import { visitRewardsApi } from "../visit-rewards/host-client";
import { AdminAutomation } from "./AdminAutomation";

const sections = [
  ["전체", "/admin"],
  ["장소", "/admin/places"],
  ["추천", "/admin/endorsements"],
  ["신고", "/admin/reports"],
  ["보상", "/admin/rewards"],
  ["사용자", "/admin/users"],
];
export function Admin() {
  const { language } = useI18n();
  const ko = language === "ko";
  const [attempt, setAttempt] = useState(0);
  const [aidAvailable, setAidAvailable] = useState(false),
    [aidBusy, setAidBusy] = useState(false),
    [aid, setAid] = useState<ReviewAssistanceResult>();
  const [data, setData] = useState<AdminData>({ queue: [], history: [] }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<QueueItem | null>(null),
    [reason, setReason] = useState(""),
    [target, setTarget] = useState(""),
    [newPlace, setNewPlace] = useState(false),
    [busy, setBusy] = useState(false);
  const path = window.location.pathname;
  const selection = useRef(selected);
  selection.current = selected;
  useEffect(() => {
    let active = true;
    if (!config.demo)
      fetch("/api/health")
        .then((response) => response.json())
        .then((data) => {
          if (active) setAidAvailable(data.capabilities?.moderation === true);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData({ queue: [], history: [] });
    setSelected(null);
    if (config.demo) {
      setData({
        queue: [
          {
            id: "90000000-0000-4000-8000-000000000001",
            kind: "submission",
            title: "가상 동네 식당",
            body: "데모 검토 요청입니다. 실제 장소가 아닙니다.",
            status: "pending",
            createdAt: new Date().toISOString(),
            candidates: [],
          },
        ],
        history: [],
      });
      setLoading(false);
      return () => {
        active = false;
      };
    }
    api
      .admin()
      .then((value) => {
        if (active) setData(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "ADMIN_UNAVAILABLE",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const needsConsent = /LEGAL_CONSENT_REQUIRED|LEGAL_INVALID_OR_OUTDATED/.test(
    error,
  );
  const needsLogin =
    !needsConsent &&
    /LEGAL_VERIFIED_EMAIL_REQUIRED|AUTH_ACCOUNT_CHANGED|AUTH_SESSION|AUTH_REQUIRED|401|로그인|이메일 인증/i.test(
      error,
    );
  const needsRole =
    !needsConsent &&
    !needsLogin &&
    /403|관리자 권한|운영자 권한|FORBIDDEN|permission denied/i.test(error);
  const errorMessage = needsLogin
    ? ko
      ? "현재 주소에서 로그인을 확인해 주세요. localhost와 배포 주소의 로그인 세션은 별도예요. 이 주소에서 이메일 인증을 완료한 계정으로 로그인한 뒤 다시 확인해 주세요."
      : "Please verify your sign-in on this address. Localhost and the deployed site have separate sessions. Sign in here with your email-verified account, then retry."
    : needsConsent
      ? ko
        ? "회원 필수 동의를 확인해야 해요. 계정에서 동의를 완료한 뒤 다시 확인해 주세요."
        : "Current required consent is needed. Complete consent in your account, then retry."
      : needsRole
        ? ko
          ? "이 계정의 관리자 권한을 확인하지 못했어요. 관리자에게 권한을 요청하거나 올바른 계정으로 로그인해 주세요."
          : "This account does not have verified administrator access. Ask an administrator for access or sign in with the correct account."
        : ko
          ? "관리자 정보를 불러오거나 처리하지 못했어요. 연결을 확인한 뒤 다시 확인해 주세요."
          : "Could not load or process administrator information. Check your connection and retry.";
  const queue = data.queue.filter((i) =>
    path.endsWith("/places")
      ? ["place", "submission", "correction", "photo"].includes(i.kind)
      : path.endsWith("/endorsements")
        ? i.kind === "endorsement"
        : path.endsWith("/reports")
          ? i.kind === "report"
          : true,
  );
  async function decide(decision: "approve" | "reject") {
    if (!selected || busy) return;
    const parsed = decisionSchema.safeParse({
      requestId: crypto.randomUUID(),
      id: selected.id,
      kind: selected.kind,
      decision,
      reason,
      ...(target ? { placeId: target } : {}),
      confirmNew: newPlace,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (config.demo)
        setData((old) => ({
          ...old,
          queue: old.queue.filter((i) => i.id !== selected.id),
          history: [
            {
              id: 1,
              action: `DEMO ${decision}`,
              created_at: new Date().toISOString(),
              details: { reason },
            },
            ...old.history,
          ],
        }));
      else {
        await api.decide(parsed.data);
        setData(await api.admin());
      }
      setSelected(null);
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page">
      <header className="admin-heading">
        <a className="text-button" href="/">
          <ArrowLeft size={17} /> 동네 발견으로
        </a>
        <span className="badge">
          <ShieldCheck size={14} /> HUMAN REVIEW
        </span>
      </header>
      <h1>운영 검토</h1>
      <p className="muted">
        근거를 확인하고, 판단 이유를 기록합니다. AI 점수만으로 제재하지
        않습니다.
      </p>
      {config.demo && (
        <p className="demo-banner">
          DEMO · 모든 항목과 처리는 브라우저 체험입니다.
        </p>
      )}
      <nav className="admin-tabs" aria-label="운영 메뉴">
        {sections.map(([label, url]) => (
          <a
            key={url}
            href={url}
            aria-current={path === url ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      {error && (
        <div role="alert" className="error-message">
          <p>{errorMessage}</p>
          {(needsLogin || needsRole) && (
            <a
              className="secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
              }}
              href="/login"
            >
              {ko ? "현재 주소에서 로그인" : "Sign in on this site"}
            </a>
          )}
          {needsConsent && (
            <a
              className="secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
              }}
              href="/account"
            >
              {ko ? "계정에서 동의 확인" : "Review account consent"}
            </a>
          )}
          <button
            className="secondary"
            style={{ minHeight: 44 }}
            disabled={loading}
            onClick={() => setAttempt((value) => value + 1)}
          >
            {ko ? "다시 확인" : "Retry"}
          </button>
        </div>
      )}
      {loading && (
        <p role="status">
          {ko
            ? "권한과 대기 항목을 확인하는 중…"
            : "Checking access and review items…"}
        </p>
      )}
      {!loading && !error && !config.demo && aidAvailable && (
        <AdminAutomation />
      )}
      {path.endsWith("/rewards") || path.endsWith("/users") ? (
        path.endsWith("/rewards") && !config.demo ? (
          <VisitRewardAdminPanel api={visitRewardsApi} language={language} />
        ) : (
          <div className="notice-box">
            {path.endsWith("/rewards")
              ? "보상은 검증된 방문·추천 귀속·예산을 확인한 뒤 지급합니다. 보상 기능은 출시 검증 전 비활성 상태입니다."
              : "사용자 권한은 서버의 user_roles에서 확인합니다. 클라이언트에서 역할을 승격하거나 자동 영구 차단하지 않습니다."}
          </div>
        )
      ) : (
        <div className="admin-layout">
          <section className="admin-queue">
            <h2>검토 대기 {queue.length}</h2>
            {!loading && queue.length === 0 && !error && (
              <p className="empty-state">검토를 기다리는 항목이 없어요.</p>
            )}
            {queue.map((item) => (
              <button
                key={item.id}
                className="admin-item"
                onClick={() => {
                  setSelected(item);
                  setAid(undefined);
                  setReason("");
                  setTarget("");
                  setNewPlace(false);
                  setError("");
                }}
              >
                <span className="badge">{item.kind}</span>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <small>{new Date(item.createdAt).toLocaleString()}</small>
              </button>
            ))}
          </section>
          <section className="admin-detail">
            {selected ? (
              <>
                <span className="eyebrow">EVIDENCE FIRST</span>
                <h2>{selected.title}</h2>
                <p className="evidence-text">{selected.body}</p>
                {aidAvailable && (
                  <>
                    <button
                      type="button"
                      className="secondary full"
                      disabled={aidBusy}
                      onClick={async () => {
                        const target = selected;
                        setAidBusy(true);
                        try {
                          const result = await aiAssistance.assessContribution({
                            id: target.id,
                            kind: target.kind,
                            language,
                          });
                          if (
                            selection.current?.id === target.id &&
                            selection.current?.kind === target.kind
                          )
                            setAid(result);
                        } finally {
                          setAidBusy(false);
                        }
                      }}
                    >
                      {language === "ko"
                        ? "AI 검토 보조 요청"
                        : "Request AI review aid"}
                    </button>
                    <ContributionReviewAid
                      result={aid}
                      loading={aidBusy}
                      language={language}
                    />
                  </>
                )}
                {selected.kind === "photo" && (
                  <PlacePhoto
                    id={selected.id}
                    name="검토할 실제 장소 사진"
                    privatePreview
                    className="contribution-photo"
                  />
                )}
                {selected.kind === "submission" && (
                  <>
                    <label>
                      기존 장소에 연결
                      <select
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                      >
                        <option value="">새 장소 생성 검토</option>
                        {selected.candidates?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} · {c.address}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!target && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={newPlace}
                          onChange={(e) => setNewPlace(e.target.checked)}
                        />
                        <span>후보를 확인했고 별도 장소로 생성합니다.</span>
                      </label>
                    )}
                  </>
                )}
                <label>
                  판단 근거와 이유
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={1000}
                    placeholder="확인한 근거와 처리 이유를 5자 이상 기록해 주세요."
                  />
                </label>
                <div className="detail-actions">
                  <button
                    className="secondary"
                    disabled={busy || reason.trim().length < 5}
                    onClick={() => decide("reject")}
                  >
                    거절/종결
                  </button>
                  <button
                    className="primary"
                    disabled={busy || reason.trim().length < 5}
                    onClick={() => decide("approve")}
                  >
                    승인
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">대기 항목을 선택해 근거를 확인하세요.</p>
            )}
          </section>
        </div>
      )}
      <section className="audit-section">
        <h2>최근 감사 기록</h2>
        {data.history.length === 0 ? (
          <p className="muted">아직 표시할 기록이 없어요.</p>
        ) : (
          data.history.map((h) => (
            <article key={h.id}>
              <strong>{h.action}</strong>
              <span>{new Date(h.created_at).toLocaleString()}</span>
              <p>{JSON.stringify(h.details)}</p>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
