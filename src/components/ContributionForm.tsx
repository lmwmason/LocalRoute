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
  const [text, setText] = useState(draft?.text || "");
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
            text,
          },
    );
  }, [step, selected, manual, name, address, lat, lng, text]);
  const payload = (): unknown => ({
    requestId: requestId.current,
    ...(manual
      ? {
          manualPlace: {
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
        await api.contribute(payload() as Contribution);
      }
      setStep("done");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "저장하지 못했어요. 다시 시도해 주세요.",
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
        <h3>{config.demo ? "데모 추천을 저장했어요" : "추천을 접수했어요"}</h3>
        <p>
          {config.demo
            ? "이 탭에서만 확인하는 체험 데이터예요. 실제로 공개되거나 LP가 지급되지 않아요."
            : "내용을 확인한 뒤 공개할게요. 추천 등록만으로 LP가 지급되지는 않아요."}
        </p>
        <span className="badge">검토 대기</span>
      </div>
    );
  return (
    <div className="contribution">
      <div
        className="steps"
        aria-label={`3단계 중 ${step === "place" ? 1 : step === "write" ? 2 : 3}단계`}
      >
        <span className="done">1 장소 선택</span>
        <span className={step !== "place" ? "done" : ""}>2 나의 한마디</span>
        <span className={step === "preview" ? "done" : ""}>3 확인</span>
      </div>
      {step === "place" && (
        <>
          <h3>어떤 곳을 추천하고 싶나요?</h3>
          <p className="muted">먼저 등록된 장소를 찾아볼게요.</p>
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="추천할 장소 검색"
              placeholder="가게 이름으로 검색"
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
                  setManual(false);
                  setStep("write");
                }}
              >
                <MapPin size={19} />
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.address}
                    {p.source === "heyyumi" ? " · HeyYumi 제공" : ""}
                  </small>
                  {p.possiblyClosed && <small>영업 상태 확인 필요</small>}
                </span>
                <Check size={18} />
              </button>
            ))}
          </div>
          {searchBusy && (
            <p className="fine-print" role="status">
              외부 장소를 찾고 있어요…
            </p>
          )}
          {searchStatus && (
            <p className="fine-print" role="status">
              {searchStatus}
            </p>
          )}
          {filterPlaces(places, query, "전체").length === 0 && (
            <p className="empty-inline">
              등록된 장소가 없어요. 아래에서 직접 알려 주세요.
            </p>
          )}
          <button
            className="secondary full"
            onClick={() => {
              setManual(true);
              setSelected(undefined);
              setStep("write");
            }}
          >
            찾는 장소가 없어요 · 직접 입력
          </button>
          <p className="fine-print">
            외부 장소 검색은 HeyYumi 사용 권한 확인 후 연결됩니다.
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
            <ArrowLeft size={16} /> 장소 다시 선택
          </button>
          {manual ? (
            <>
              <h3>동네의 새로운 발견을 알려 주세요</h3>
              <label>
                가게 이름
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                정확한 주소
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="도로명과 건물 번호"
                  maxLength={250}
                />
              </label>
              <div className="two-columns">
                <label>
                  위도
                  <input
                    inputMode="decimal"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="37.5459"
                  />
                </label>
                <label>
                  경도
                  <input
                    inputMode="decimal"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="127.0537"
                  />
                </label>
              </div>
              <p className="fine-print">
                현재는 좌표를 직접 입력해요. 지도에서 위치 선택은 다음 단계에서
                연결합니다. 새 장소는 검토 후 공개해요.
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
            직접 경험한 추천 한마디
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              rows={4}
              placeholder="이곳에서 좋았던 메뉴나 나만 아는 팁을 알려 주세요."
            />
          </label>
          <div className="field-meta">
            <span>짧아도 괜찮아요. 나의 경험이면 충분해요.</span>
            <span>{text.length}/200</span>
          </div>
          <div className="optional-note">
            <strong>메뉴 사진은 선택이에요</strong>
            <p>사진 없이도 추천할 수 있어요. 사진 분석 기능은 준비 중입니다.</p>
          </div>
          <button className="primary full" onClick={preview}>
            미리 보기
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
            <ArrowLeft size={16} /> 수정하기
          </button>
          <h3>이렇게 전달돼요</h3>
          <article className="preview-card">
            <span className="eyebrow">나의 추천</span>
            <h3>{manual ? name : selected?.name}</h3>
            <p className="muted">{manual ? address : selected?.address}</p>
            <blockquote>“{text}”</blockquote>
            <span className="badge">검토 후 공개</span>
          </article>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>장소가 맞고, 직접 경험한 내용임을 확인했어요.</span>
          </label>
          {!config.demo && !loggedIn ? (
            <button className="primary full" onClick={onLogin}>
              로그인하고 추천하기
            </button>
          ) : (
            <button
              className="primary full"
              disabled={!confirmed || busy}
              onClick={submit}
            >
              {busy
                ? "접수하는 중…"
                : config.demo
                  ? "데모 추천 제출"
                  : "추천 제출하기"}
            </button>
          )}
          <p className="fine-print">
            {config.demo
              ? "데모 모드 · 실제 서버에 저장하지 않습니다."
              : "공개 전 검토하며, 등록만으로 LP를 지급하지 않아요."}
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
