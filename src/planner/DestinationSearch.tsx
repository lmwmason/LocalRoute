import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  destinationErrorCodes,
  destinationQuerySchema,
  destinationSearchResponseSchema,
  type Destination,
  type DestinationErrorCode,
  type DestinationSearch as Search,
} from "../../shared/destinations";

const copy = {
  ko: {
    label: "여행 지역",
    hint: "대한민국 시·군·구·읍·면을 두 글자 이상 입력하세요. 예: 충주시 살미면",
    loading: "지역을 검색하고 있어요.",
    empty: "선택 가능한 지역이 없어요. 시·도 이름을 함께 입력해 보세요.",
    selected: "선택한 지역",
    clear: "지역 선택 지우기",
    retry: "다시 검색",
    more: "검색 결과 더 보기",
    source:
      "출처: Kakao 주소 검색 · 좌표는 지역 대표 위치예요. 일정 생성 가능 여부는 별도로 확인해요.",
    errors: {
      DESTINATIONS_DISABLED: "지역 검색이 아직 활성화되지 않았어요.",
      DESTINATIONS_KEY_MISSING: "지역 검색 서버 키가 설정되지 않았어요.",
      DESTINATIONS_INVALID_QUERY: "지역명을 2~100자로 입력해 주세요.",
      DESTINATIONS_UNAUTHORIZED: "지역 검색 서비스 인증을 확인해야 해요.",
      DESTINATIONS_RATE_LIMITED:
        "검색 요청이 많아요. 잠시 후 다시 시도해 주세요.",
      DESTINATIONS_TIMEOUT: "지역 검색 시간이 초과됐어요. 다시 시도해 주세요.",
      DESTINATIONS_UNAVAILABLE: "지역을 검색하지 못했어요. 다시 시도해 주세요.",
      DESTINATIONS_INVALID_RESPONSE:
        "지역 검색 결과를 확인하지 못했어요. 다시 시도해 주세요.",
      DESTINATION_SELECTION_INVALID: "지역을 다시 검색하고 선택해 주세요.",
    },
  },
  en: {
    label: "Travel region",
    hint: "Enter at least two characters for a Korean city, county, district, town or township. Try 충주시 살미면.",
    loading: "Searching regions…",
    empty:
      "No selectable regions found. Include the province or city name. Korean names may work better.",
    selected: "Selected region",
    clear: "Clear region selection",
    retry: "Search again",
    more: "More search results",
    source:
      "Source: Kakao address search · Coordinates represent the region. Itinerary availability is checked separately.",
    errors: {
      DESTINATIONS_DISABLED: "Region search is not enabled yet.",
      DESTINATIONS_KEY_MISSING: "The region search server key is missing.",
      DESTINATIONS_INVALID_QUERY: "Enter a region name of 2–100 characters.",
      DESTINATIONS_UNAUTHORIZED:
        "The region search service needs authentication configuration.",
      DESTINATIONS_RATE_LIMITED: "Too many searches. Please try again later.",
      DESTINATIONS_TIMEOUT: "Region search timed out. Please try again.",
      DESTINATIONS_UNAVAILABLE: "Region search failed. Please try again.",
      DESTINATIONS_INVALID_RESPONSE:
        "The region search response could not be verified. Please try again.",
      DESTINATION_SELECTION_INVALID:
        "Please search and select the region again.",
    },
  },
};

export const searchDestinations: Search = async (query, page, signal) => {
  const response = await fetch(
    `/api/destinations?${new URLSearchParams({ q: query, page: String(page) })}`,
    {
      signal,
      credentials: "same-origin",
      cache: "no-store",
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      body && typeof body === "object" && "error" in body ? body.error : null;
    throw new Error(
      destinationErrorCodes.includes(code as DestinationErrorCode)
        ? String(code)
        : "DESTINATIONS_UNAVAILABLE",
    );
  }
  const parsed = destinationSearchResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.page !== page)
    throw new Error("DESTINATIONS_INVALID_RESPONSE");
  return parsed.data;
};
const control: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  width: "100%",
  boxSizing: "border-box",
  font: "inherit",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#fff",
  color: "#17263c",
  overflowWrap: "anywhere",
  textAlign: "start",
};
export type DestinationSearchProps = {
  value: Destination | null;
  onChange: (destination: Destination | null) => void;
  language: "ko" | "en";
  disabled?: boolean;
  search?: Search;
};

export function DestinationSearch({
  value,
  onChange,
  language,
  disabled = false,
  search = searchDestinations,
}: DestinationSearchProps) {
  const id = useId(),
    text = copy[language],
    input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""),
    [composing, setComposing] = useState(false);
  const [results, setResults] = useState<Destination[]>([]),
    [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<DestinationErrorCode | null>(null);
  const [finished, setFinished] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const generation = useRef(0),
    buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const current = ++generation.current;
    if (
      disabled ||
      value ||
      composing ||
      dismissed ||
      !destinationQuerySchema.safeParse(query).success
    ) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setError(null);
    setFinished(false);
    const timer = window.setTimeout(async () => {
      try {
        const result = destinationSearchResponseSchema.parse(
          await search(query.trim(), page, controller.signal),
        );
        if (result.page !== page)
          throw new Error("DESTINATIONS_INVALID_RESPONSE");
        if (controller.signal.aborted || current !== generation.current) return;
        setResults((old) => [
          ...new Map(
            (page === 1
              ? result.destinations
              : [...old, ...result.destinations]
            ).map((d) => [d.id, d]),
          ).values(),
        ]);
        setHasMore(result.hasMore);
        setFinished(true);
      } catch (e) {
        if (controller.signal.aborted || current !== generation.current) return;
        const code = e instanceof Error ? e.message : "";
        setError(
          destinationErrorCodes.includes(code as DestinationErrorCode)
            ? (code as DestinationErrorCode)
            : "DESTINATIONS_UNAVAILABLE",
        );
      } finally {
        if (!controller.signal.aborted && current === generation.current)
          setBusy(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, page, attempt, composing, disabled, value, dismissed, search]);
  function edit(next: string) {
    ++generation.current;
    setQuery(next);
    setResults([]);
    setPage(1);
    setHasMore(false);
    setError(null);
    setFinished(false);
    setDismissed(false);
    if (value) onChange(null);
  }
  const visible = !value && !dismissed && !disabled;
  return (
    <div
      style={{
        minWidth: 0,
        width: "100%",
        display: "grid",
        gap: 10,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <label htmlFor={id}>{text.label}</label>
      <input
        id={id}
        ref={input}
        type="search"
        value={value?.label ?? query}
        disabled={disabled}
        maxLength={100}
        autoComplete="off"
        style={control}
        aria-describedby={`${id}-hint ${id}-status`}
        onChange={(e) => edit(e.target.value)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" && visible && results.length) {
            e.preventDefault();
            buttons.current[0]?.focus();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDismissed(true);
            ++generation.current;
          }
          if (e.key === "Enter" && !value) {
            setDismissed(false);
            setAttempt((n) => n + 1);
          }
        }}
      />
      <small id={`${id}-hint`}>{text.hint}</small>
      <div
        id={`${id}-status`}
        role="status"
        aria-live="polite"
        aria-busy={busy}
      >
        {value
          ? `${text.selected}: ${value.label}`
          : visible &&
            (busy
              ? text.loading
              : error
                ? text.errors[error]
                : finished && !results.length
                  ? text.empty
                  : "")}
      </div>
      {value && (
        <button
          type="button"
          style={control}
          disabled={disabled}
          onClick={() => {
            edit("");
            input.current?.focus();
          }}
        >
          {text.clear}
        </button>
      )}
      {visible && results.length > 0 && (
        <ul
          aria-label={text.label}
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: 8,
            maxHeight: "min(40vh, 320px)",
            overflowY: "auto",
          }}
        >
          {results.map((destination, index) => (
            <li key={destination.id} style={{ minWidth: 0 }}>
              <button
                type="button"
                ref={(element) => {
                  buttons.current[index] = element;
                }}
                style={control}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    buttons.current[(index + 1) % results.length]?.focus();
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    if (index === 0) input.current?.focus();
                    else buttons.current[index - 1]?.focus();
                  }
                  if (e.key === "Escape") {
                    setDismissed(true);
                    input.current?.focus();
                  }
                }}
                onClick={() => {
                  ++generation.current;
                  onChange(destination);
                  setQuery("");
                  setResults([]);
                  setHasMore(false);
                  input.current?.focus();
                }}
              >
                {destination.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {visible && error && (
        <button
          type="button"
          style={control}
          onClick={() => setAttempt((n) => n + 1)}
        >
          {text.retry}
        </button>
      )}
      {visible && hasMore && !error && (
        <button
          type="button"
          style={control}
          disabled={busy}
          onClick={() => setPage((n) => n + 1)}
        >
          {text.more}
        </button>
      )}
      {(value || (visible && results.length > 0)) && (
        <small>{text.source}</small>
      )}
    </div>
  );
}
