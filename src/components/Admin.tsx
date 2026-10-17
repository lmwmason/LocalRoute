import { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { config } from "../config";
import type { AdminData, QueueItem } from "../../shared/community";
import { decisionSchema } from "../../shared/community";

const sections = [
  ["전체", "/admin"],
  ["장소", "/admin/places"],
  ["추천", "/admin/endorsements"],
  ["신고", "/admin/reports"],
  ["보상", "/admin/rewards"],
  ["사용자", "/admin/users"],
];
export function Admin() {
  const [data, setData] = useState<AdminData>({ queue: [], history: [] }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<QueueItem | null>(null),
    [reason, setReason] = useState(""),
    [target, setTarget] = useState(""),
    [newPlace, setNewPlace] = useState(false),
    [busy, setBusy] = useState(false);
  const path = window.location.pathname;
  useEffect(() => {
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
      return;
    }
    api
      .admin()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const queue = data.queue.filter((i) =>
    path.endsWith("/places")
      ? ["place", "submission", "correction"].includes(i.kind)
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
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {loading && <p role="status">권한과 대기 항목을 확인하는 중…</p>}
      {path.endsWith("/rewards") || path.endsWith("/users") ? (
        <div className="notice-box">
          {path.endsWith("/rewards")
            ? "보상은 검증된 방문·추천 귀속·예산을 확인한 뒤 지급합니다. 보상 기능은 출시 검증 전 비활성 상태입니다."
            : "사용자 권한은 서버의 user_roles에서 확인합니다. 클라이언트에서 역할을 승격하거나 자동 영구 차단하지 않습니다."}
        </div>
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
