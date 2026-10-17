import { useState } from "react";
import { api } from "../api";
import { config } from "../config";
export function ReportForm({
  id,
  kind,
}: {
  id: string;
  kind: "place" | "endorsement" | "appeal";
}) {
  const [reason, setReason] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          if (!config.demo)
            await api.report({
              requestId: crypto.randomUUID(),
              kind,
              entityId: id,
              reason,
            });
          setStatus(
            config.demo
              ? "데모 신고를 확인했어요. 실제 접수되지 않습니다."
              : "신고/이의 신청을 접수했어요. 사람이 근거를 확인합니다.",
          );
        } catch (e) {
          setStatus((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="muted">
        잘못된 정보나 추천의 문제를 알려 주세요. 신고만으로 사용자나 장소가 자동
        제재되지 않아요.
      </p>
      <label>
        확인할 내용과 근거
        <textarea
          minLength={5}
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
      </label>
      <button
        className="primary full"
        disabled={busy || reason.trim().length < 5}
      >
        검토 요청
      </button>
      {status && (
        <p role="status" className="notice-box">
          {status}
        </p>
      )}
    </form>
  );
}
