import { useI18n } from "../i18n";
import { useRef, useState } from "react";
import type { Place } from "../../shared/domain";
import { correctionSchema } from "../../shared/community";
import { api } from "../api";
import { config } from "../config";
export function CorrectionForm({
  places,
  initial,
}: {
  places: Place[];
  initial?: Place;
}) {
  const { t } = useI18n();

  const [placeId, setPlaceId] = useState(initial?.id || ""),
    [field, setField] = useState("name"),
    [value, setValue] = useState(""),
    [evidence, setEvidence] = useState(""),
    [contact, setContact] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
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
        const parsed = correctionSchema.safeParse({
          requestId: requestId.current,
          placeId,
          field,
          value,
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
      <label>
        {t("올바른 내용")}
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={1000}
          required
        />
      </label>
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
