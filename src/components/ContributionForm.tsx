import { useI18n } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, MapPin, Search } from "lucide-react";
import {
  contributionSchema,
  filterPlaces,
  parseCoordinate,
  type Contribution,
  type Place,
} from "../../shared/domain";
import { config } from "../config";
import { api } from "../api";
import { readDraft, saveDraft } from "../drafts";
import { PlacePhoto } from "./PlacePhoto";
import { MenuPhotoAssistant } from "../ai-assistance/MenuPhotoAssistant";
import { aiAssistance } from "../ai-assistance/host-client";
import type { ConfirmedMenu } from "../../shared/ai-assistance";

export function ContributionForm({
  places,
  initial,
  loggedIn,
  onLogin,
}: {
  places: Place[];
  initial?: Place;
  loggedIn: boolean;
  onLogin: () => void;
}) {
  const { t, language } = useI18n();

  const [draft] = useState(() => {
    const saved = readDraft();
    return initial && saved?.selected?.id !== initial.id ? null : saved;
  });
  const [step, setStep] = useState<"place" | "write" | "preview" | "done">(
    draft?.step || (initial ? "write" : "place"),
  );
  const [selected, setSelected] = useState<Place | undefined>(
    initial ||
      (draft?.selected
        ? {
            ...draft.selected,
            tags: [],
            endorsements: [],
            rating: null,
            reviewCount: 0,
          }
        : undefined),
  );
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(draft?.manual || false);
  const [name, setName] = useState(draft?.name || "");
  const [address, setAddress] = useState(draft?.address || "");
  const [lat, setLat] = useState(draft?.lat || "");
  const [lng, setLng] = useState(draft?.lng || "");
  const [kind, setKind] = useState(draft?.kind || "restaurant");
  const [photo, setPhoto] = useState<File | null>(null),
    [photoUrl, setPhotoUrl] = useState(""),
    [photoId, setPhotoId] = useState(draft?.photoId),
    [photoConsent, setPhotoConsent] = useState(false);
  useEffect(() => {
    if (!photo) {
      setPhotoUrl("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const [text, setText] = useState(draft?.text || "");
  const [menuDraft, setMenuDraft] = useState<ConfirmedMenu | undefined>(
    draft?.menuDraft,
  );
  const [showMenu, setShowMenu] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [external, setExternal] = useState<Place[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const pending = useRef(false);
  const requestId = useRef(draft?.requestId || crypto.randomUUID());
  useEffect(() => {
    saveDraft(
      step === "done"
        ? null
        : {
            expires: Date.now() + 86400000,
            requestId: requestId.current,
            step,
            selected,
            manual,
            name,
            address,
            lat,
            lng,
            kind,
            photoId,
            text,
            menuDraft,
          },
    );
  }, [
    step,
    selected,
    manual,
    name,
    address,
    lat,
    lng,
    text,
    kind,
    photoId,
    menuDraft,
  ]);
  function resetPhoto() {
    setMenuDraft(undefined);
    setPhoto(null);
    setPhotoId(undefined);
    setPhotoConsent(false);
    requestId.current = crypto.randomUUID();
  }
  const target = () =>
    manual
      ? {
          manualPlace: {
            kind,
            name,
            address,
            lat: parseCoordinate(lat),
            lng: parseCoordinate(lng),
          },
        }
      : selected?.candidateToken
        ? { candidateToken: selected.candidateToken }
        : { placeId: selected?.id };
  const payload = (): unknown => ({
    requestId: requestId.current,
    photoId: photoId || (photo ? requestId.current : undefined),
    ...(manual
      ? {
          manualPlace: {
            kind,
            name,
            address,
            lat: parseCoordinate(lat),
            lng: parseCoordinate(lng),
          },
        }
      : selected?.candidateToken
        ? { candidateToken: selected.candidateToken }
        : { placeId: selected?.id }),
    text,
    menuDraft,
    confirmed: true,
  });
  useEffect(() => {
    if (config.demo || query.trim().length < 2 || step !== "place") return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchBusy(true);
      setSearchStatus("");
      api
        .search(query, controller.signal)
        .then((result) => {
          setExternal(result.places);
          if (!result.places.length)
            setSearchStatus(
              "외부 검색 결과가 없어요. 직접 장소를 알려 주세요.",
            );
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setExternal([]);
            setSearchStatus(e.message);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchBusy(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, step]);
  function preview() {
    if (!photo && !photoId) {
      setError(t("photos.error.required"));
      return;
    }
    if (!photoConsent) {
      setError(t("photos.error.consent"));
      return;
    }
    const parsed = contributionSchema.safeParse(payload());
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    setConfirmed(false);
    setStep("preview");
  }
  async function submit() {
    if (pending.current || !confirmed) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (config.demo) {
        const key = `localroute.demo.contribution.${selected?.id || `${name}:${address}`}`;
        if (sessionStorage.getItem(key))
          throw new Error("이 장소의 데모 추천을 이미 제출했어요.");
        sessionStorage.setItem(
          key,
          JSON.stringify({ text, status: "pending" }),
        );
      } else {
        if (!loggedIn) throw new Error("추천을 제출하려면 로그인해 주세요.");
        const uploaded = photoId
          ? { id: photoId }
          : await api.uploadPhoto(requestId.current, target(), photo!);
        setPhotoId(uploaded.id);
        await api.contribute({
          ...(payload() as Contribution),
          photoId: uploaded.id,
        });
      }
      setStep("done");
    } catch (e) {
      setError(
        e instanceof Error
          ? t(e.message)
          : t("저장하지 못했어요. 다시 시도해 주세요."),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (step === "done")
    return (
      <div className="success-state">
        <CheckCircle2 size={52} />
        <h3>
          {config.demo ? t("데모 추천을 저장했어요") : t("추천을 접수했어요")}
        </h3>
        <p>
          {config.demo
            ? t(
                "이 탭에서만 확인하는 체험 데이터예요. 실제로 공개되거나 LP가 지급되지 않아요.",
              )
            : t(
                "내용을 확인한 뒤 공개할게요. 추천 등록만으로 LP가 지급되지는 않아요.",
              )}
        </p>
        <span className="badge">{t("검토 대기")}</span>
      </div>
    );
  return (
    <div className="contribution">
      <div
        className="steps"
        aria-label={`3단계 중 ${step === "place" ? 1 : step === "write" ? 2 : 3}단계`}
      >
        <span className="done">{t("1 장소 선택")}</span>
        <span className={step !== "place" ? "done" : ""}>
          {t("2 나의 한마디")}
        </span>
        <span className={step === "preview" ? "done" : ""}>{t("3 확인")}</span>
      </div>
      {step === "place" && (
        <>
          <h3>{t("어떤 곳을 추천하고 싶나요?")}</h3>
          <p className="muted">{t("먼저 등록된 장소를 찾아볼게요.")}</p>
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label={t("추천할 장소 검색")}
              placeholder={t("가게 이름으로 검색")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="candidate-list">
            {[
              ...filterPlaces(places, query, "전체"),
              ...(query.trim().length >= 2 ? external : []),
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelected(p);
                  resetPhoto();
                  setManual(false);
                  setStep("write");
                }}
              >
                <MapPin size={19} />
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.address}
                    {p.source === "heyyumi" ? t(" · HeyYumi 제공") : ""}
                  </small>
                  {p.possiblyClosed && (
                    <small>{t("영업 상태 확인 필요")}</small>
                  )}
                </span>
                <Check size={18} />
              </button>
            ))}
          </div>
          {searchBusy && (
            <p className="fine-print" role="status">
              {t("외부 장소를 찾고 있어요…")}
            </p>
          )}
          {searchStatus && (
            <p className="fine-print" role="status">
              {searchStatus}
            </p>
          )}
          {filterPlaces(places, query, "전체").length === 0 && (
            <p className="empty-inline">
              {t("등록된 장소가 없어요. 아래에서 직접 알려 주세요.")}
            </p>
          )}
          <button
            className="secondary full"
            onClick={() => {
              setManual(true);
              resetPhoto();
              setSelected(undefined);
              setStep("write");
            }}
          >
            {t("찾는 장소가 없어요 · 직접 입력")}
          </button>
          <p className="fine-print">
            {t("외부 장소 검색은 HeyYumi 사용 권한 확인 후 연결됩니다.")}
          </p>
        </>
      )}
      {step === "write" && (
        <>
          <button
            className="back-link"
            onClick={() => {
              setStep("place");
              setError("");
            }}
          >
            <ArrowLeft size={16} /> {t("장소 다시 선택")}
          </button>
          {manual ? (
            <>
              <h3>{t("동네의 새로운 발견을 알려 주세요")}</h3>
              <label>
                {t("places.kind")}
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as typeof kind);
                    resetPhoto();
                  }}
                >
                  {(
                    [
                      "restaurant",
                      "cafe",
                      "attraction",
                      "culture",
                      "experience",
                    ] as const
                  ).map((k) => (
                    <option key={k} value={k}>
                      {t(`places.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("가게 이름")}
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    resetPhoto();
                  }}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                {t("정확한 주소")}
                <input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    resetPhoto();
                  }}
                  placeholder={t("도로명과 건물 번호")}
                  maxLength={250}
                />
              </label>
              <div className="two-columns">
                <label>
                  {t("위도")}
                  <input
                    inputMode="decimal"
                    value={lat}
                    onChange={(e) => {
                      setLat(e.target.value);
                      resetPhoto();
                    }}
                    placeholder="37.5459"
                  />
                </label>
                <label>
                  {t("경도")}
                  <input
                    inputMode="decimal"
                    value={lng}
                    onChange={(e) => {
                      setLng(e.target.value);
                      resetPhoto();
                    }}
                    placeholder="127.0537"
                  />
                </label>
              </div>
              <p className="fine-print">
                {t(
                  "현재는 좌표를 직접 입력해요. 지도에서 위치 선택은 다음 단계에서 연결합니다. 새 장소는 검토 후 공개해요.",
                )}
              </p>
            </>
          ) : (
            <div className="selected-place">
              <MapPin size={22} />
              <div>
                <strong>{selected?.name}</strong>
                <p>{selected?.address}</p>
              </div>
            </div>
          )}
          <label>
            {t("직접 경험한 추천 한마디")}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              rows={4}
              placeholder={t(
                "이곳에서 좋았던 메뉴나 나만 아는 팁을 알려 주세요.",
              )}
            />
          </label>
          <div className="field-meta">
            <span>{t("짧아도 괜찮아요. 나의 경험이면 충분해요.")}</span>
            <span>{text.length}/200</span>
          </div>
          <div className="optional-note">
            <strong>{t("메뉴 사진은 선택이에요")}</strong>
            <p>
              {language === "ko"
                ? "직접 입력하거나 사진으로 초안을 만들 수 있어요. 확인한 초안은 추천과 함께 비공개로 저장하며 검증된 메뉴 정보로 자동 게시하지 않아요."
                : "Enter items or extract a photo draft. Confirmed drafts are saved privately with your contribution and are not automatically published as verified menu facts."}
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => setShowMenu((old) => !old)}
            >
              {language === "ko"
                ? "선택 메뉴 초안 작성"
                : "Optional menu draft"}
            </button>
            {showMenu && (
              <MenuPhotoAssistant
                language={language}
                onExtract={(file, options) =>
                  config.demo
                    ? Promise.resolve({ status: "failed", code: "disabled" })
                    : aiAssistance.extractMenu(file, options)
                }
                onConfirm={(draft) => {
                  setMenuDraft(draft);
                  setShowMenu(false);
                  setConfirmed(false);
                }}
                onSkip={() => {
                  setShowMenu(false);
                }}
              />
            )}
            {menuDraft && (
              <p role="status">
                {language === "ko"
                  ? `확인한 메뉴 ${menuDraft.items.length}개 · 비공개 초안`
                  : `${menuDraft.items.length} confirmed items · private draft`}{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setMenuDraft(undefined)}
                >
                  {language === "ko" ? "초안 삭제" : "Remove draft"}
                </button>
              </p>
            )}
          </div>
          <section className="photo-upload">
            <label>
              {t("photos.label")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const next = e.target.files?.[0];
                  if (!next) return;
                  if (
                    !["image/jpeg", "image/png", "image/webp"].includes(
                      next.type,
                    )
                  ) {
                    setError(t("photos.error.type"));
                    e.target.value = "";
                    return;
                  }
                  if (next.size > 5 * 1024 * 1024) {
                    setError(t("photos.error.size"));
                    e.target.value = "";
                    return;
                  }
                  resetPhoto();
                  setPhoto(next);
                  setError("");
                }}
              />
            </label>
            <p className="fine-print">{t("photos.help")}</p>
            {photoUrl ? (
              <img
                className="contribution-photo"
                src={photoUrl}
                alt={t("photos.preview")}
              />
            ) : photoId ? (
              <PlacePhoto
                id={photoId}
                name={t("photos.preview")}
                privatePreview
                className="contribution-photo"
              />
            ) : (
              draft && <p className="fine-print">{t("photos.reselect")}</p>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={photoConsent}
                onChange={(e) => setPhotoConsent(e.target.checked)}
              />
              <span>{t("photos.consent")}</span>
            </label>
          </section>
          <button className="primary full" onClick={preview}>
            {t("미리 보기")}
          </button>
        </>
      )}
      {step === "preview" && (
        <>
          <button
            className="back-link"
            onClick={() => {
              setStep("write");
              setError("");
            }}
          >
            <ArrowLeft size={16} /> {t("수정하기")}
          </button>
          <h3>{t("이렇게 전달돼요")}</h3>
          <article className="preview-card">
            <span className="eyebrow">{t("나의 추천")}</span>
            <h3>{manual ? name : selected?.name}</h3>
            <p className="muted">{manual ? address : selected?.address}</p>
            {photoUrl ? (
              <img
                className="contribution-photo"
                src={photoUrl}
                alt={t("photos.preview")}
              />
            ) : photoId ? (
              <PlacePhoto
                id={photoId}
                name={t("photos.preview")}
                privatePreview
                className="contribution-photo"
              />
            ) : (
              <p role="alert">{t("photos.reselect")}</p>
            )}
            <blockquote>“{text}”</blockquote>
            {menuDraft && (
              <div className="menu-draft-summary">
                <strong>
                  {language === "ko"
                    ? "비공개 메뉴 초안 · 검증 전"
                    : "Private menu draft · unverified"}
                </strong>
                {menuDraft.items.map((item, index) => (
                  <p key={index}>
                    {item.name} · {item.price ?? "?"} {item.currency ?? "?"}
                  </p>
                ))}
              </div>
            )}
            <span className="badge">{t("검토 후 공개")}</span>
          </article>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>{t("장소가 맞고, 직접 경험한 내용임을 확인했어요.")}</span>
          </label>
          {!config.demo && !loggedIn ? (
            <button className="primary full" onClick={onLogin}>
              {t("로그인하고 추천하기")}
            </button>
          ) : (
            <button
              className="primary full"
              disabled={!confirmed || busy || (!photo && !photoId)}
              onClick={submit}
            >
              {busy
                ? t("접수하는 중…")
                : config.demo
                  ? t("데모 추천 제출")
                  : t("추천 제출하기")}
            </button>
          )}
          <p className="fine-print">
            {config.demo
              ? t("데모 모드 · 실제 서버에 저장하지 않습니다.")
              : t("공개 전 검토하며, 등록만으로 LP를 지급하지 않아요.")}
          </p>
        </>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
