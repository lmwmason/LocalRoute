import { useRef, useState } from "react";
import { useI18n } from "../i18n";
import {
  confirmedMenuSchema,
  type ConfirmedMenu,
  type MenuAssistanceResult,
  type MenuExtraction,
  type MenuPhotoOptions,
} from "../../shared/ai-assistance";
import { failures, menuWarnings } from "./messages";
import "./assistance.css";

export type MenuPhotoAssistantProps = {
  language?: "ko" | "en";
  onExtract: (
    file: File,
    options: MenuPhotoOptions,
  ) => Promise<MenuAssistanceResult>;
  onConfirm: (draft: ConfirmedMenu) => void | Promise<void>;
  onSkip: () => void;
};
export function MenuPhotoAssistant({
  language,
  onExtract,
  onConfirm,
  onSkip,
}: MenuPhotoAssistantProps) {
  const context = useI18n();
  const lang = language ?? context.language,
    ko = lang === "ko";
  const t = (k: string, e: string) => (ko ? k : e);
  const [file, setFile] = useState<File | null>(null),
    [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<MenuAssistanceResult | null>(null);
  const [localError, setLocalError] = useState<
    "invalid_photo" | "photo_too_large" | null
  >(null);
  const revision = useRef(0);
  async function extract() {
    if (!file || !privacy || busy) return;
    const current = ++revision.current;
    setBusy(true);
    setResult(null);
    let next: MenuAssistanceResult;
    try {
      next = await onExtract(file, {
        language: lang,
        privacyConfirmed: true,
        redactions: [],
      });
    } catch {
      next = { status: "failed", code: "unavailable" };
    }
    if (current === revision.current) {
      setResult(next);
      setBusy(false);
    }
  }
  const skip = () => {
    revision.current++;
    setBusy(false);
    setResult(null);
    onSkip();
  };
  return (
    <section
      className="ai-assistance"
      lang={lang}
      aria-label={t("선택 메뉴 사진 분석", "Optional menu photo analysis")}
    >
      <h3>{t("메뉴 사진은 선택이에요", "Menu photos are optional")}</h3>
      <p>
        {t(
          "분석을 건너뛰거나 직접 입력해도 추천을 제출할 수 있어요.",
          "You can skip analysis or enter details manually and still contribute.",
        )}
      </p>
      <label>
        {t("메뉴 사진 파일", "Menu photo file")}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            revision.current++;
            setBusy(false);
            setResult(null);
            setPrivacy(false);
            const selected = event.target.files?.[0] ?? null;
            const error =
              selected && selected.size > 5 * 1024 * 1024
                ? "photo_too_large"
                : selected &&
                    !["image/jpeg", "image/png", "image/webp"].includes(
                      selected.type,
                    )
                  ? "invalid_photo"
                  : null;
            setLocalError(error);
            setFile(error ? null : selected);
          }}
        />
      </label>
      <p>
        {t(
          "메뉴만 보이도록 잘라 주세요. 이름·얼굴·전화번호·영수증 등 개인정보를 제거한 사진만 Google Gemini에 전송해요. 원본 사진은 이 모듈에 저장하지 않아요.",
          "Crop to the menu only. Remove names, faces, phone numbers, receipts and other private information before sending the photo to Google Gemini. This module does not store the original photo.",
        )}
      </p>
      <label className="ai-check">
        <input
          type="checkbox"
          checked={privacy}
          onChange={(e) => setPrivacy(e.target.checked)}
          disabled={busy}
        />
        {t(
          "메뉴만 남기고 개인정보를 제거했으며 Gemini 전송에 동의해요.",
          "I removed private information and consent to sending this menu photo to Gemini.",
        )}
      </label>
      <div className="ai-actions">
        <button
          type="button"
          disabled={!file || !privacy || busy}
          onClick={extract}
        >
          {t("보이는 메뉴 추출", "Extract visible menu")}
        </button>
        <button type="button" onClick={skip}>
          {t("메뉴 사진 없이 계속", "Continue without menu photo")}
        </button>
      </div>
      {busy && (
        <p role="status">
          {t(
            "메뉴를 읽고 있어요… 다른 기여 내용은 유지돼요.",
            "Reading the menu… Your other contribution details are preserved.",
          )}
        </p>
      )}
      {(localError || result?.status === "failed") && (
        <p role="alert">
          {
            failures[
              localError ??
                (result as Extract<MenuAssistanceResult, { status: "failed" }>)
                  .code
            ][ko ? 0 : 1]
          }{" "}
          {t(
            "직접 입력하거나 메뉴 사진 없이 계속할 수 있어요.",
            "You can enter details manually or continue without a menu photo.",
          )}
        </p>
      )}
      {!busy && (
        <MenuExtractionPreview
          key={revision.current}
          extraction={result?.status === "ready" ? result.data : undefined}
          language={lang}
          onConfirm={onConfirm}
        />
      )}
    </section>
  );
}

export type MenuExtractionPreviewProps = {
  extraction?: MenuExtraction;
  language?: "ko" | "en";
  onConfirm: (draft: ConfirmedMenu) => void | Promise<void>;
};
export function MenuExtractionPreview({
  extraction,
  ...props
}: MenuExtractionPreviewProps) {
  return (
    <PreviewEditor
      key={JSON.stringify(extraction ?? null)}
      extraction={extraction}
      {...props}
    />
  );
}
function PreviewEditor({
  extraction,
  language,
  onConfirm,
}: MenuExtractionPreviewProps) {
  const context = useI18n();
  const ko = (language ?? context.language) === "ko",
    t = (k: string, e: string) => (ko ? k : e);
  const [rows, setRows] = useState(() =>
    (extraction?.items ?? []).map((item) => ({
      name: item.name,
      price: item.price === null ? "" : String(item.price),
      currency: item.currency ?? "",
    })),
  );
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [state, setState] = useState<"error" | "saved" | null>(null);
  function edit(
    index: number,
    field: "name" | "price" | "currency",
    value: string,
  ) {
    setRows((old) =>
      old.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
    setConfirmed(false);
    setState(null);
  }
  async function confirm() {
    if (!confirmed || busy || state === "saved") return;
    const validNumber = rows.every(
      (row) =>
        !row.price.trim() || /^\d+(?:\.\d{1,2})?$/.test(row.price.trim()),
    );
    const parsed = confirmedMenuSchema.safeParse({
      items: rows.map((row) => ({
        name: row.name,
        price: row.price.trim() ? Number(row.price) : null,
        currency: row.currency.trim() || null,
      })),
      confirmed: true,
      source: "user_confirmed_draft",
    });
    if (!validNumber || !parsed.success) {
      setState("error");
      return;
    }
    setBusy(true);
    setState(null);
    try {
      await onConfirm(parsed.data);
      setState("saved");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="ai-menu-preview"
      lang={ko ? "ko" : "en"}
      aria-label={t("메뉴 수정 미리보기", "Editable menu preview")}
    >
      <h4>{t("확인 전 메뉴 초안", "Menu draft — review required")}</h4>
      <p>
        {t(
          "AI 추출은 실제 메뉴·가격의 검증이 아니에요. 사진과 비교해 수정해 주세요. 빈 가격·통화는 미확인으로 남아요.",
          "AI extraction does not verify the menu or prices. Compare with the photo and correct the draft. Blank prices and currencies remain unknown.",
        )}
      </p>
      {!rows.length && (
        <p>
          {t(
            "읽힌 메뉴가 없어요. 직접 추가하거나 건너뛸 수 있어요.",
            "No items were read. Add items manually or skip.",
          )}
        </p>
      )}
      {extraction && (
        <div>
          {extraction.notes.map((note) => (
            <p key={note}>{menuWarnings[note][ko ? 0 : 1]}</p>
          ))}
          {extraction.unreadable_regions.length > 0 && (
            <p>
              {t(
                "읽히지 않는 사진 영역이 있어요.",
                "Some image regions are unreadable.",
              )}
            </p>
          )}
          <ul>
            {extraction.items
              .filter(
                (item) =>
                  item.confidence === "uncertain" || item.uncertainty.length,
              )
              .map((item, index) => (
                <li key={index}>
                  {item.name}:{" "}
                  {item.uncertainty.length
                    ? item.uncertainty
                        .map((code) => menuWarnings[code][ko ? 0 : 1])
                        .join(" · ")
                    : t("불확실해요", "Uncertain")}
                </li>
              ))}
          </ul>
        </div>
      )}
      {rows.map((row, index) => (
        <fieldset key={index} disabled={busy}>
          <legend>
            {t("메뉴", "Item")} {index + 1}
          </legend>
          <label>
            {t("메뉴명", "Item name")}
            <input
              value={row.name}
              maxLength={240}
              onChange={(e) => edit(index, "name", e.target.value)}
            />
          </label>
          <label>
            {t(
              "가격 · 미확인이면 비워 두세요",
              "Price · leave blank if unknown",
            )}
            <input
              inputMode="decimal"
              value={row.price}
              maxLength={20}
              onChange={(e) => edit(index, "price", e.target.value)}
            />
          </label>
          <label>
            {t("통화 · 사진에 표시된 그대로", "Currency · as printed")}
            <input
              value={row.currency}
              maxLength={12}
              onChange={(e) => edit(index, "currency", e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setRows((old) => old.filter((_, i) => i !== index));
              setConfirmed(false);
              setState(null);
            }}
          >
            {t("메뉴 삭제", "Remove item")} {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={rows.length >= 60 || busy}
        onClick={() => {
          setRows((old) => [...old, { name: "", price: "", currency: "" }]);
          setConfirmed(false);
          setState(null);
        }}
      >
        {t("메뉴 직접 추가", "Add item manually")}
      </button>
      <label className="ai-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(e) => {
            setConfirmed(e.target.checked);
            setState(null);
          }}
        />
        {t(
          "메뉴명·가격·통화를 확인했어요. 자동 게시되지 않아요.",
          "I checked the item names, prices and currencies. This does not publish them.",
        )}
      </label>
      <button
        type="button"
        disabled={!confirmed || busy || state === "saved"}
        onClick={confirm}
      >
        {t("수정한 메뉴 확인", "Confirm edited menu")}
      </button>
      {state === "error" && (
        <p role="alert">
          {t(
            "입력 또는 확인 처리를 마치지 못했어요. 내용을 확인하고 다시 시도해 주세요.",
            "Input or confirmation could not be completed. Check the draft and try again.",
          )}
        </p>
      )}
      {state === "saved" && (
        <p role="status">
          {t(
            "메뉴 초안을 확인했어요. 게시 승인은 별도예요.",
            "Menu draft confirmed. Publication requires separate review.",
          )}
        </p>
      )}
    </div>
  );
}
