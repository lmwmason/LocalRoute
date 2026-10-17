import { useEffect, useState } from "react";
import type { Workspace as WorkspaceData } from "../../shared/community";
import { api } from "../api";
export function Workspace() {
  const [data, setData] = useState<WorkspaceData | null>(null),
    [name, setName] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    api
      .me()
      .then((v) => {
        setData(v);
        setName(v.displayName);
      })
      .catch((e) => setError(e.message));
  }, []);
  if (!data)
    return (
      <p role="status" className={error ? "error-message" : "muted"}>
        {error || "나의 추천을 불러오고 있어요…"}
      </p>
    );
  const latest = data.contributions.filter(
    (item, index, items) => items.findIndex((e) => e.id === item.id) === index,
  );
  return (
    <div className="workspace">
      <label>
        큐레이터 이름
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
        />
      </label>
      <button
        className="secondary full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.profile(name);
            setNotice("이름을 저장했어요.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        이름 저장
      </button>
      <h3>나의 추천</h3>
      {latest.length === 0 && (
        <p className="muted">아직 추천한 장소가 없어요.</p>
      )}
      {latest.map((item) => (
        <article className="workspace-item" key={item.id}>
          <div>
            <strong>{item.placeName}</strong>
            <span className="badge">
              {item.status} · v{item.version}
            </span>
          </div>
          {editing === item.id ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={200}
              />
              <button
                className="primary full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.edit(item.id, text, crypto.randomUUID());
                    setData(await api.me());
                    setEditing(null);
                    setNotice(
                      "새 버전을 검토 요청했어요. 이전 평가가 새 글에 이어지지 않아요.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                수정 내용 검토 요청
              </button>
            </>
          ) : (
            <>
              <p>{item.text}</p>
              <button
                className="text-button"
                onClick={() => {
                  setEditing(item.id);
                  setText(item.text);
                }}
              >
                새 버전으로 수정
              </button>
            </>
          )}
        </article>
      ))}
      {["moderator", "admin"].includes(data.role) && (
        <a className="primary full" href="/admin">
          운영 검토 화면
        </a>
      )}
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
  );
}
