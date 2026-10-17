import { useId, useRef, useState } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import { useI18n } from "../i18n";
import type { Place } from "../../shared/domain";
import {
  feedbackSchema,
  type Feedback as FeedbackPayload,
} from "../../shared/community";
import { api } from "../api";
import { config } from "../config";
import "./Feedback.css";

type Props = {
  place: Place;
  userId?: string;
  onLogin: () => void;
  submitFeedback?: (payload: FeedbackPayload) => Promise<unknown>;
};

// A new place or account starts a fresh draft, including its request identity.
export function Feedback(props: Props) {
  return (
    <FeedbackForm
      key={`${props.place.id}:${props.userId ?? "guest"}`}
      {...props}
    />
  );
}

function FeedbackForm({ place, userId, onLogin, submitFeedback }: Props) {
  const { language } = useI18n();
  const en = language === "en";
  const say = (ko: string, english: string) => (en ? english : ko);
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const attempt = useRef<{ fingerprint: string; requestId: string } | null>(
    null,
  );
  const [rating, setRating] = useState(0);
  const [helpfulness, setHelpfulness] = useState(0);
  const [version, setVersion] = useState("");
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [affiliated, setAffiliated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [failed, setFailed] = useState(false);
  const options = place.endorsements.filter(
    (e) => e.versionId && e.userId !== userId,
  );
  const selected = options.find((e) => e.versionId === version);
  const today = new Date().toLocaleDateString("sv-SE");
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  const rewardNotice = say(
    "추천자 LP는 방문 사실·참고한 추천의 귀속·보상 적격성 검토 후에만 지급될 수 있어요. 별점 제출만으로 지급되지 않아요. 영수증은 필수가 아니에요.",
    "Curator LP may be awarded only after reviewing the visit, attribution to the recommendation used, and reward eligibility. Submitting stars alone does not award LP. A receipt is not required.",
  );
  const stars = (
    kind: "rating" | "helpfulness",
    value: number,
    change: (n: number) => void,
  ) => (
    <div className="feedback-stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="feedback-star">
          <input
            type="radio"
            name={kind}
            value={n}
            checked={value === n}
            required
            aria-label={say(`${n}점`, `${n} ${n === 1 ? "star" : "stars"}`)}
            aria-invalid={invalid && !value}
            aria-describedby={`${id}-${kind}-hint`}
            onChange={() => {
              change(n);
              setFailed(false);
            }}
          />
          <span>
            <Star
              aria-hidden="true"
              size={22}
              fill={n <= value ? "currentColor" : "none"}
            />
            <small>{n}</small>
          </span>
        </label>
      ))}
    </div>
  );
  if (done)
    return (
      <div
        className="feedback-form feedback-success"
        role="status"
        tabIndex={-1}
        ref={(node) => node?.focus()}
      >
        <CheckCircle2 size={40} aria-hidden="true" />
        <h3>
          {config.demo && !submitFeedback
            ? say("데모 후기를 남겼어요", "Demo review saved")
            : say("후기를 남겼어요", "Review saved")}
        </h3>
        <p>
          {say(
            "장소 만족도를 기록했어요.",
            "Your place satisfaction was recorded.",
          )}
        </p>
        {selected && (
          <p>
            {say(
              `${selected.author}님의 선택한 추천에만 도움 평가를 남겼어요.`,
              `Helpfulness was recorded only for the selected recommendation by ${selected.author}.`,
            )}
          </p>
        )}
        <p>
          {say(
            "후기 저장은 방문 인증을 의미하지 않아요.",
            "Saving a review does not verify your visit.",
          )}
        </p>
        <p>{rewardNotice}</p>
      </div>
    );
  return (
    <form
      ref={form}
      className="feedback-form"
      noValidate
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        if (inFlight.current) return;
        if (!config.demo && !userId) {
          onLogin();
          return;
        }
        setInvalid(true);
        setFailed(false);
        if (
          !rating ||
          !dateValid ||
          !confirmed ||
          (version && (!selected || !helpfulness))
        ) {
          const target = !rating
            ? '[name="rating"]'
            : !dateValid
              ? '[name="visitedOn"]'
              : version && (!selected || !helpfulness)
                ? selected
                  ? '[name="helpfulness"]'
                  : '[name="endorsement"]'
                : '[name="confirmed"]';
          form.current?.querySelector<HTMLElement>(target)?.focus();
          return;
        }
        const body = {
          placeId: place.id,
          rating,
          text,
          visitedOn: date,
          affiliated,
          ...(selected
            ? { endorsementVersionId: selected.versionId, helpfulness }
            : {}),
        };
        const fingerprint = JSON.stringify(body);
        if (attempt.current?.fingerprint !== fingerprint)
          attempt.current = { fingerprint, requestId: crypto.randomUUID() };
        const parsed = feedbackSchema.safeParse({
          ...body,
          requestId: attempt.current.requestId,
        });
        if (!parsed.success) {
          setFailed(true);
          return;
        }
        inFlight.current = true;
        setBusy(true);
        try {
          if (submitFeedback) await submitFeedback(parsed.data);
          else if (!config.demo) await api.feedback(parsed.data);
          setDone(true);
        } catch {
          setFailed(true);
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      <h3>{say(`${place.name} 방문 후기`, `Your visit to ${place.name}`)}</h3>
      <p>
        {say(
          "낮은 별점도 괜찮아요. 실제 경험을 솔직하게 남겨 주세요.",
          "Every score is welcome. Share your honest experience.",
        )}
      </p>
      <fieldset disabled={busy} className="feedback-fields">
        <fieldset
          className="feedback-section"
          aria-describedby={`${id}-rating-hint`}
        >
          <legend>
            {say("장소 만족도 (필수)", "Place satisfaction (required)")}
          </legend>
          <p>
            {say(
              "장소에서의 경험을 평가해 주세요. 1점은 매우 아쉬움, 5점은 매우 만족이에요. 추천자의 점수와는 별개예요.",
              "Rate your experience at the place: 1 means very dissatisfied, 5 means very satisfied. This is separate from any curator’s recommendation.",
            )}
          </p>
          {stars("rating", rating, setRating)}
          <p
            id={`${id}-rating-hint`}
            className={invalid && !rating ? "feedback-error" : "feedback-hint"}
          >
            {rating
              ? say(
                  `${rating}점 선택 · 다른 별을 눌러 변경할 수 있어요.`,
                  `${rating} selected. Choose another star to change it.`,
                )
              : say(
                  "1~5점 중 하나를 선택해 주세요.",
                  "Choose a score from 1 to 5.",
                )}
          </p>
        </fieldset>
        <label className="feedback-field">
          {say("방문한 날짜 (필수)", "Visit date (required)")}
          <input
            name="visitedOn"
            type="date"
            value={date}
            max={today}
            required
            aria-invalid={invalid && !dateValid}
            aria-describedby={`${id}-date-hint`}
            onChange={(e) => {
              setDate(e.target.value);
              setFailed(false);
            }}
          />
        </label>
        <p
          id={`${id}-date-hint`}
          className={invalid && !dateValid ? "feedback-error" : "feedback-hint"}
        >
          {say(
            "오늘 또는 이전 방문 날짜를 선택해 주세요.",
            "Choose today or an earlier visit date.",
          )}
        </p>
        <label className="feedback-field">
          {say("방문 후기 (선택)", "Visit review (optional)")}
          <textarea
            maxLength={1000}
            rows={4}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFailed(false);
            }}
            placeholder={say(
              "좋았던 점과 아쉬웠던 점을 알려 주세요.",
              "What went well? What could have been better?",
            )}
          />
        </label>
        <p className="feedback-hint">{text.length}/1000</p>
        <section
          className="feedback-section"
          aria-labelledby={`${id}-recommendation`}
        >
          <h4 id={`${id}-recommendation`}>
            {say(
              "참고한 추천의 도움 평가 (선택)",
              "Helpfulness of a recommendation (optional)",
            )}
          </h4>
          <p>
            {say(
              "실제로 참고한 추천 하나만 선택해 주세요. 선택하지 않으면 추천자 점수는 기록하지 않아요.",
              "Choose only the recommendation you actually used. Without a selection, no curator is rated.",
            )}
          </p>
          {options.length ? (
            <>
              <label className="feedback-field">
                {say("내가 참고한 추천", "Recommendation I used")}
                <select
                  name="endorsement"
                  value={version}
                  onChange={(e) => {
                    setVersion(e.target.value);
                    setHelpfulness(0);
                    setFailed(false);
                  }}
                >
                  <option value="">
                    {say("선택하지 않음", "No recommendation selected")}
                  </option>
                  {options.map((e) => (
                    <option key={e.versionId} value={e.versionId}>
                      {e.author} · {e.text.slice(0, 70)}
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <>
                  <blockquote>
                    {selected.author} · {selected.text}
                  </blockquote>
                  <fieldset className="feedback-helpfulness">
                    <legend>
                      {say(
                        "이 추천의 도움 정도 (선택 시 필수)",
                        "Helpfulness of this recommendation (required when selected)",
                      )}
                    </legend>
                    <p>
                      {say(
                        "1점은 도움이 되지 않음, 5점은 매우 도움이 됨이에요.",
                        "1 means not helpful, 5 means very helpful.",
                      )}
                    </p>
                    {stars("helpfulness", helpfulness, setHelpfulness)}
                    <p
                      id={`${id}-helpfulness-hint`}
                      className={
                        invalid && !helpfulness
                          ? "feedback-error"
                          : "feedback-hint"
                      }
                    >
                      {helpfulness
                        ? say(
                            `${helpfulness}점 선택`,
                            `${helpfulness} selected`,
                          )
                        : say(
                            "이 추천의 도움 정도를 1~5점으로 선택해 주세요.",
                            "Choose 1–5 stars for this recommendation’s helpfulness.",
                          )}
                    </p>
                  </fieldset>
                </>
              )}
            </>
          ) : (
            <p>
              {say(
                "평가할 수 있는 다른 사람의 추천이 아직 없어요. 장소 후기는 남길 수 있어요.",
                "There are no other curators’ recommendations to rate yet. You can still review the place.",
              )}
            </p>
          )}
        </section>
        <label className="feedback-check">
          <input
            type="checkbox"
            checked={affiliated}
            onChange={(e) => setAffiliated(e.target.checked)}
          />
          <span>
            {say(
              "이 장소의 소유자·직원 또는 관계자예요.",
              "I own, work at, or am affiliated with this place.",
            )}
          </span>
        </label>
        <label className="feedback-check">
          <input
            name="confirmed"
            type="checkbox"
            checked={confirmed}
            required
            aria-invalid={invalid && !confirmed}
            aria-describedby={`${id}-confirmation`}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            {say(
              "실제 방문 경험이며 솔직하게 작성했어요. (필수)",
              "This is my actual visit and honest experience. (required)",
            )}
          </span>
        </label>
        {invalid && !confirmed && (
          <p id={`${id}-confirmation`} className="feedback-error">
            {say(
              "실제 방문 경험인지 확인해 주세요.",
              "Please confirm this is your actual visit.",
            )}
          </p>
        )}
      </fieldset>
      {failed && (
        <p className="feedback-error" role="alert">
          {say(
            "저장 결과를 확인하지 못했어요. 입력 내용은 유지되어 있어요. 연결과 로그인 상태를 확인한 뒤 다시 시도해 주세요.",
            "We could not confirm the save. Your entries are preserved. Check your connection and sign-in, then try again.",
          )}
        </p>
      )}
      {!config.demo && !userId ? (
        <button type="button" className="primary full" onClick={onLogin}>
          {say("로그인하고 후기 남기기", "Sign in to review")}
        </button>
      ) : (
        <button type="submit" className="primary full" disabled={busy}>
          {busy
            ? say("저장 중…", "Saving…")
            : failed
              ? say("다시 저장하기", "Retry save")
              : config.demo && !submitFeedback
                ? say("데모 후기 제출", "Submit demo review")
                : say("후기 제출", "Submit review")}
        </button>
      )}
      <p className="feedback-hint" role="status">
        {busy
          ? say(
              "저장 중이에요. 잠시 기다려 주세요.",
              "Saving your review. Please wait.",
            )
          : ""}
      </p>
      <p className="feedback-hint">{rewardNotice}</p>
    </form>
  );
}
