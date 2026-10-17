import { useRef, useState } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import type { Place } from "../../shared/domain";
import { feedbackSchema } from "../../shared/community";
import { api } from "../api";
import { config } from "../config";
export function Feedback({
  place,
  userId,
  onLogin,
}: {
  place: Place;
  userId?: string;
  onLogin: () => void;
}) {
  const [rating, setRating] = useState(0),
    [helpfulness, setHelpfulness] = useState(0),
    [version, setVersion] = useState(""),
    [text, setText] = useState(""),
    [date, setDate] = useState(""),
    [affiliated, setAffiliated] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const options = place.endorsements.filter(
    (e) => e.versionId && e.userId !== userId,
  );
  if (done)
    return (
      <div className="success-state">
        <CheckCircle2 size={40} />
        <h3>{config.demo ? "데모 후기를 남겼어요" : "후기를 남겼어요"}</h3>
        <p>
          방문은 아직 검증되지 않았어요. 식당 만족도와 선택한 추천의 도움 평가는
          별도로 기록하며, LP는 지급되지 않아요.
        </p>
      </div>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setError("");
        const parsed = feedbackSchema.safeParse({
          requestId: requestId.current,
          placeId: place.id,
          rating,
          text,
          visitedOn: date,
          affiliated,
          ...(version ? { endorsementVersionId: version, helpfulness } : {}),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        setBusy(true);
        try {
          if (!config.demo) await api.feedback(parsed.data);
          setDone(true);
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "후기를 저장하지 못했어요.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{place.name}에서의 경험은 어땠나요?</h3>
      <label>식당 만족도</label>
      <div className="star-input" role="group" aria-label="식당 만족도">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            aria-label={`${n}점`}
            aria-pressed={rating === n}
            onClick={() => setRating(n)}
          >
            <Star fill={n <= rating ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <label>
        방문한 날짜
        <input
          type="date"
          value={date}
          max={new Date().toLocaleDateString("sv-SE")}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </label>
      <label>
        식당 후기 (선택)
        <textarea
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="좋았던 점과 아쉬웠던 점을 솔직하게 알려 주세요."
        />
      </label>
      {options.length > 0 && (
        <>
          <label>
            도움받은 추천 (선택)
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            >
              <option value="">선택하지 않음</option>
              {options.map((e) => (
                <option key={e.id} value={e.versionId}>
                  {e.author} · {e.text.slice(0, 30)}
                </option>
              ))}
            </select>
          </label>
          {version && (
            <>
              <label>이 추천은 얼마나 도움이 됐나요?</label>
              <div
                className="star-input"
                role="group"
                aria-label="추천 도움 평가"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    type="button"
                    key={n}
                    aria-label={`도움 ${n}점`}
                    aria-pressed={helpfulness === n}
                    onClick={() => setHelpfulness(n)}
                  >
                    <Star fill={n <= helpfulness ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={affiliated}
          onChange={(e) => setAffiliated(e.target.checked)}
        />
        <span>이 가게의 소유자·직원 또는 관계자예요.</span>
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          required
        />
        <span>실제 방문 경험이며 솔직하게 작성했어요.</span>
      </label>
      {!config.demo && !userId ? (
        <button type="button" className="primary full" onClick={onLogin}>
          로그인하고 후기 남기기
        </button>
      ) : (
        <button
          className="primary full"
          disabled={busy || !confirmed || !rating}
        >
          {busy ? "저장 중…" : config.demo ? "데모 후기 제출" : "후기 제출"}
        </button>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <p className="fine-print">
        별점이 낮아도 후기를 남길 수 있어요. 식당 평가는 모든 추천자의 도움
        평가로 자동 반영되지 않아요.
      </p>
    </form>
  );
}
