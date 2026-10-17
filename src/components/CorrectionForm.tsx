import { useI18n } from "../i18n";
import { useRef, useState } from "react";
import type { Place } from "../../shared/domain";
import { correctionSchema } from "../../shared/community";
import { api } from "../api";
import { config } from "../config";
import { hoursFactSchema } from "../../shared/place-facts";
export function CorrectionForm({
  places,
  initial,
}: {
  places: Place[];
  initial?: Place;
}) {
  const { t, language } = useI18n();
  const hoursCopy =
    language === "en"
      ? {
          date: "Date these hours apply",
          closed: "Closed all day on this date",
          open: "Opens",
          close: "Closes",
          lastEntry: "Last entry (optional)",
          lastOrder: "Last food order (optional)",
          split: "There is a break between two opening intervals",
          interval: "Opening interval",
          note: "Enter confirmed hours for one date in Korea Standard Time. Add a second interval for a break. Overnight hours need separate dates. Nothing changes until a moderator approves the evidence.",
          invalid:
            "Choose a date and valid opening intervals. Closing must follow opening; optional cutoffs must be within that interval. Two intervals must be ordered without overlap.",
        }
      : {
          date: "영업시간을 적용할 날짜",
          closed: "이 날짜는 종일 휴무예요",
          open: "영업 시작",
          close: "영업 종료",
          lastEntry: "마지막 입장 (선택)",
          lastOrder: "마지막 음식 주문 (선택)",
          split: "중간 휴게시간으로 영업 구간이 두 번 나뉘어요",
          interval: "영업 구간",
          note: "한국 시간으로 직접 확인한 날짜별 영업시간을 적어 주세요. 휴게시간이 있으면 두 구간으로 나누고, 자정을 넘는 영업은 날짜별로 요청해 주세요. 근거를 운영자가 승인해야 반영돼요.",
          invalid:
            "날짜와 올바른 영업 구간을 입력해 주세요. 종료는 시작보다 늦어야 하고, 마지막 입장·주문은 영업 구간 안이어야 해요. 두 구간은 시간순으로 겹치지 않게 적어 주세요.",
        };

  const [placeId, setPlaceId] = useState(initial?.id || ""),
    [field, setField] = useState("name"),
    [value, setValue] = useState(""),
    [evidence, setEvidence] = useState(""),
    [contact, setContact] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  const [hoursDate, setHoursDate] = useState("");
  const [closed, setClosed] = useState(false);
  const [split, setSplit] = useState(false);
  const [intervals, setIntervals] = useState([
    { open: "", close: "", lastEntry: "", lastOrder: "" },
    { open: "", close: "", lastEntry: "", lastOrder: "" },
  ]);
  const requestId = useRef(crypto.randomUUID());
  if (done)
    return (
      <div className="success-state">
        <h3>
          {config.demo
            ? t("데모 요청을 확인했어요")
            : t("수정 요청을 접수했어요")}
        </h3>
        <p>
          {t(
            "운영자가 근거를 확인한 뒤 처리해요. 요청만으로 가게 정보나 평점이 바뀌지 않아요.",
          )}
        </p>
      </div>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        let submittedValue = value;
        if (field === "hours") {
          const hours = hoursFactSchema.safeParse({
            timezone: "Asia/Seoul",
            dates: {
              [hoursDate]: closed
                ? []
                : intervals.slice(0, split ? 2 : 1).map((interval) => ({
                    open: interval.open,
                    close: interval.close,
                    ...(interval.lastEntry
                      ? { lastEntry: interval.lastEntry }
                      : {}),
                    ...(interval.lastOrder
                      ? { lastOrder: interval.lastOrder }
                      : {}),
                  })),
            },
          });
          if (!hours.success) {
            setError(hoursCopy.invalid);
            return;
          }
          submittedValue = JSON.stringify(hours.data);
        }
        const parsed = correctionSchema.safeParse({
          requestId: requestId.current,
          placeId,
          field,
          value: submittedValue,
          evidence,
          contact,
          consent,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        setBusy(true);
        setError("");
        try {
          if (!config.demo) await api.correction(parsed.data);
          setDone(true);
        } catch (e) {
          setError(
            e instanceof Error ? e.message : t("요청을 접수하지 못했어요."),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="muted">
        {t("사장님과 이용자 모두 잘못된 장소 정보를 알려 주실 수 있어요.")}
      </p>
      <label>
        {t("가게")}
        <select
          value={placeId}
          onChange={(e) => setPlaceId(e.target.value)}
          required
        >
          <option value="">{t("장소 선택")}</option>
          {places.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name} · {p.address}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("수정할 정보")}
        <select value={field} onChange={(e) => setField(e.target.value)}>
          <option value="name">{t("가게 이름")}</option>
          <option value="address">{t("주소")}</option>
          <option value="hours">{t("영업시간")}</option>
          <option value="menu">{t("메뉴·가격")}</option>
          <option value="other">{t("기타")}</option>
        </select>
      </label>
      {field === "hours" ? (
        <fieldset style={{ minWidth: 0, padding: 0, border: 0 }}>
          <legend>{t("영업시간")}</legend>
          <p className="muted">{hoursCopy.note}</p>
          <label>
            {hoursCopy.date}
            <input
              type="date"
              required
              value={hoursDate}
              onChange={(event) => setHoursDate(event.target.value)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={closed}
              onChange={(event) => setClosed(event.target.checked)}
            />
            <span>{hoursCopy.closed}</span>
          </label>
          {!closed && (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={split}
                  onChange={(event) => setSplit(event.target.checked)}
                />
                <span>{hoursCopy.split}</span>
              </label>
              {intervals.slice(0, split ? 2 : 1).map((interval, index) => (
                <fieldset key={index} style={{ minWidth: 0 }}>
                  <legend>
                    {hoursCopy.interval} {index + 1}
                  </legend>
                  {(["open", "close", "lastEntry", "lastOrder"] as const).map(
                    (key) => (
                      <label key={key}>
                        {hoursCopy[key]}
                        <input
                          type="time"
                          required={key === "open" || key === "close"}
                          value={interval[key]}
                          onChange={(event) =>
                            setIntervals((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, [key]: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                    ),
                  )}
                </fieldset>
              ))}
            </>
          )}
        </fieldset>
      ) : (
        <label>
          {t("올바른 내용")}
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={1000}
            required
          />
        </label>
      )}
      <label>
        {t("확인할 수 있는 근거")}
        <textarea
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          maxLength={2000}
          placeholder={t(
            "공식 안내 또는 직접 확인한 날짜와 내용을 적어 주세요.",
          )}
          required
        />
      </label>
      <label>
        {t("회신용 연락처 (선택)")}
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={200}
        />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
        />
        <span>
          {t(
            "검토를 위해 내용을 처리하는 데 동의해요. 연락처는 처리 완료 시 또는 최대 30일 후 삭제 대상이 돼요.",
          )}
        </span>
      </label>
      <button className="primary full" disabled={busy || !consent}>
        {busy
          ? t("접수 중…")
          : config.demo
            ? t("데모 요청 제출")
            : t("수정 요청 보내기")}
      </button>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
