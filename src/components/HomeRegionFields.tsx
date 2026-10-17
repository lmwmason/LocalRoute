import {
  findRegionAlias,
  regionSearchTerm,
  bilingualRegionName,
} from "../../shared/region-search-aliases";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  type Locality,
  localityLabel,
  localitySchema,
  suggestedScope,
} from "../../shared/locality";
import { useI18n } from "../i18n";
import {
  type RegionData,
  type RegionSelection,
  emptyRegion,
  loadRegions,
  provinces,
  districts,
  allowsCityOnly,
  towns,
  searchRegions,
  selectRegion,
  regionLocality,
  recoverRegions,
  regionSource,
} from "../regions/administrative-regions";
import "../regions/region-fields.css";

type Option = { value: string; label: string };
function RegionSelect({
  label,
  options,
  value,
  onChange,
  disabled,
  optional,
  language,
  onPendingChange,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  optional?: boolean;
  language: "ko" | "en";
  onPendingChange: (pending: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const ko = language === "ko";
  const blank = { value: "", label: ko ? "선택 안 함" : "Leave blank" };
  const localQuery =
    findRegionAlias(query)?.names.find((name) =>
      options.some((option) => option.label.includes(name)),
    ) ?? regionSearchTerm(query);
  const filtered = searchRegions(options, localQuery, (option) => option.label);
  const visible = optional && !query ? [blank, ...filtered] : filtered;
  const selected = options.find((option) => option.value === value);
  const activeOption = visible[active];
  function choose(option: Option) {
    onChange(option.value);
    onPendingChange(false);
    setOpen(false);
    setQuery("");
  }
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);
  return (
    <div
      className="region-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
          onPendingChange(false);
        }
      }}
    >
      <label htmlFor={`${id}-input`}>{label}</label>
      <div className="region-combobox" data-open={open && !disabled}>
        <div className="region-combobox-control">
          <input
            ref={input}
            id={`${id}-input`}
            role="combobox"
            aria-required={!optional}
            aria-autocomplete="list"
            aria-expanded={open && !disabled}
            aria-controls={`${id}-list`}
            aria-activedescendant={
              open && activeOption ? `${id}-option-${active}` : undefined
            }
            aria-describedby={`${id}-results`}
            autoComplete="off"
            disabled={disabled}
            maxLength={80}
            placeholder={
              ko ? "검색하거나 선택해 주세요" : "Search or choose a region"
            }
            value={open ? query : (selected?.label ?? "")}
            onClick={() => setOpen(true)}
            onFocus={() => {
              setOpen(true);
              setActive(0);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(0);
              onPendingChange(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && open) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                setQuery("");
                onPendingChange(false);
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                setActive((n) =>
                  !open
                    ? 0
                    : Math.max(
                        0,
                        Math.min(
                          visible.length - 1,
                          n + (event.key === "ArrowDown" ? 1 : -1),
                        ),
                      ),
                );
              }
              if (open && (event.key === "Home" || event.key === "End")) {
                event.preventDefault();
                setActive(
                  event.key === "Home" ? 0 : Math.max(0, visible.length - 1),
                );
              }
              if (open && event.key === "Enter") {
                event.preventDefault();
                if (activeOption) choose(activeOption);
              }
            }}
          />
          <button
            type="button"
            className="region-toggle"
            disabled={disabled}
            tabIndex={-1}
            aria-label={`${label} ${ko ? "목록 열기/닫기" : "toggle options"}`}
            aria-expanded={open && !disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              input.current?.focus();
              setQuery("");
              setActive(0);
              setOpen(!open);
            }}
          >
            ⌄
          </button>
        </div>
        {open && !disabled && (
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label={label}
            className="region-options"
          >
            {visible.map((option, n) => (
              <button
                type="button"
                role="option"
                id={`${id}-option-${n}`}
                key={option.value}
                tabIndex={-1}
                aria-selected={option.value === value}
                data-active={n === active}
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => setActive(n)}
                onClick={() => choose(option)}
              >
                {option.label}
              </button>
            ))}
            {!filtered.length && (
              <p>
                {ko
                  ? "검색 결과가 없어요. 검색어를 바꿔 주세요."
                  : "No results. Try another search."}
              </p>
            )}
          </div>
        )}
      </div>
      <small id={`${id}-results`} role="status">
        {disabled
          ? ko
            ? "상위 지역을 먼저 선택해 주세요."
            : "Choose the parent region first."
          : open
            ? ko
              ? `${filtered.length}개 검색 결과 · 입력 후 목록에서 선택해 주세요.`
              : `${filtered.length} results · choose an item after searching.`
            : ko
              ? optional
                ? "선택 사항 · 눌러서 검색·선택"
                : "눌러서 검색·선택"
              : optional
                ? "Optional · tap to search and choose"
                : "Tap to search and choose"}
      </small>
    </div>
  );
}

export function HomeRegionFields({
  value,
  onChange,
  onValidityChange,
  load = loadRegions,
}: {
  value: Locality;
  onChange: (value: Locality) => void;
  onValidityChange?: (valid: boolean) => void;
  /** Injectable local snapshot loader for offline/error tests. */
  load?: () => Promise<RegionData>;
}) {
  const { t, language } = useI18n();
  const [mode, setMode] = useState<"kr" | "international">("kr");
  const [data, setData] = useState<RegionData | null>(null);
  const [error, setError] = useState(false);
  const [searchPending, setSearchPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [edited, setEdited] = useState<{
    value: Locality;
    selection: RegionSelection;
  } | null>(null);
  useEffect(() => {
    let active = true;
    load()
      .then((loaded) => {
        if (active) setData(loaded);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [load, attempt]);
  const recovered = useMemo(
    () => (data && value.homeCity ? recoverRegions(data, value) : []),
    [data, value],
  );
  const exact = recovered.filter((candidate) => {
    const mapped = data && regionLocality(data, candidate, value.localityScope);
    return (
      mapped?.homeCity === value.homeCity && mapped?.homeArea === value.homeArea
    );
  });
  const selection =
    edited?.value === value
      ? edited.selection
      : exact.length === 1
        ? exact[0]
        : emptyRegion;
  const mapped = data && regionLocality(data, selection, value.localityScope);
  const matched =
    !!mapped &&
    mapped.homeCity === value.homeCity &&
    mapped.homeArea === value.homeArea;
  const valid =
    !searchPending &&
    localitySchema.safeParse(value).success &&
    (mode === "international" || matched);
  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);
  function emit(next: RegionSelection, scope = value.localityScope) {
    if (!data) return;
    const nextValue = regionLocality(data, next, scope) ??
      (scope === "area" ? regionLocality(data, next, "auto") : null) ?? {
        homeCity: "",
        homeArea: "",
        localityScope: scope === "area" ? "auto" : scope,
      };
    setEdited({ value: nextValue, selection: next });
    onChange(nextValue);
  }
  const choose = (level: keyof RegionSelection, id: string) => {
    if (data)
      emit(selectRegion(data, selection, level, id), value.localityScope);
  };
  const ko = language === "ko";
  return (
    <div className="home-region-fields administrative-region-fields">
      <label>
        {ko ? "거주 지역 입력 방식" : "Home region entry"}
        <select
          aria-label={ko ? "거주 지역 입력 방식" : "Home region entry"}
          value={mode}
          onChange={(event) => {
            setSearchPending(false);
            setMode(event.target.value as typeof mode);
          }}
        >
          <option value="kr">
            {ko
              ? "대한민국 · 공식 행정구역 선택"
              : "South Korea · official region list"}
          </option>
          <option value="international">
            {ko
              ? "해외 거주 · 직접 입력"
              : "Outside South Korea · manual entry"}
          </option>
        </select>
      </label>
      {mode === "kr" ? (
        <>
          <p className="fine-print">
            {ko
              ? "시·도부터 순서대로 선택해 주세요. 읍·면·동은 선택 사항이며 상세 주소는 받지 않아요. 행정구역 이름은 공식 한국어 명칭입니다."
              : "Choose your province, then municipality. Neighborhood is optional; no street address is collected. Known English names are shown alongside the original Korean names."}
          </p>
          {!data && !error && (
            <p role="status">
              {ko
                ? "공식 지역 목록을 불러오는 중…"
                : "Loading the official region list…"}
            </p>
          )}
          {error && (
            <div role="alert">
              <p>
                {ko
                  ? "지역 목록을 불러오지 못했어요. 다시 시도해 주세요."
                  : "Could not load the region list. Please retry."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setError(false);
                  setAttempt((n) => n + 1);
                }}
              >
                {ko ? "다시 시도" : "Retry"}
              </button>
            </div>
          )}
          {data && (
            <>
              {!!value.homeCity && !matched && (
                <div className="notice-box">
                  <p>
                    {ko ? "기존 입력값" : "Saved entry"}: {value.homeCity}{" "}
                    {value.homeArea}
                  </p>
                  <p>
                    {ko
                      ? "목록에서 지역을 다시 선택해 주세요. 같은 이름의 지역은 시·도를 확인해야 해요. 해외 거주지는 위 입력 방식을 바꿔 복구할 수 있어요."
                      : "Reselect your region from the list. Duplicate names need a province. For a home outside Korea, switch the entry method above."}
                  </p>
                  {recovered.length === 1 && (
                    <button type="button" onClick={() => emit(recovered[0])}>
                      {ko ? "공식 명칭으로 복구" : "Restore official name"}:{" "}
                      {recovered[0].province} {recovered[0].district}
                    </button>
                  )}
                </div>
              )}
              <RegionSelect
                onPendingChange={setSearchPending}
                label={ko ? "시·도" : "Province / metropolitan city"}
                options={provinces(data).map((name) => ({
                  value: name,
                  label: language === "en" ? bilingualRegionName(name) : name,
                }))}
                value={selection.province}
                onChange={(id) => choose("province", id)}
                language={language}
              />
              <RegionSelect
                onPendingChange={setSearchPending}
                key={`district-${selection.province}`}
                label={ko ? "시·군·구" : "City / county / district"}
                options={districts(data, selection.province).map((name) => ({
                  value: name,
                  label: language === "en" ? bilingualRegionName(name) : name,
                }))}
                value={selection.district}
                onChange={(id) => choose("district", id)}
                language={language}
                disabled={
                  !selection.province ||
                  districts(data, selection.province).length === 0
                }
                optional={allowsCityOnly(data, selection.province)}
              />
              {selection.province &&
                districts(data, selection.province).length === 0 && (
                  <p className="fine-print">
                    {ko
                      ? "이 시·도는 시·군·구 단계 없이 읍·면·동을 선택해요."
                      : "This city has no municipality level. Choose a neighborhood directly."}
                  </p>
                )}
              <RegionSelect
                onPendingChange={setSearchPending}
                key={`town-${selection.province}-${selection.district}`}
                label={
                  ko
                    ? "읍·면·동 (선택)"
                    : "Town / township / neighborhood (optional)"
                }
                options={towns(data, selection).map((row) => ({
                  value: row[0],
                  label: row[3],
                }))}
                value={selection.townCode}
                onChange={(id) => choose("townCode", id)}
                language={language}
                optional
                disabled={
                  !selection.province ||
                  (!selection.district &&
                    districts(data, selection.province).length > 0)
                }
              />
              <p className="fine-print">
                <a href={regionSource} target="_blank" rel="noreferrer">
                  {ko
                    ? "출처: 행정안전부 · 공공데이터포털"
                    : "Source: MOIS · Public Data Portal"}
                </a>{" "}
                · {ko ? "목록 기준일" : "Snapshot date"}: {data.referenceDate}.{" "}
                {ko
                  ? "기준일 이후 변경된 지역은 다음 목록 갱신 후 선택할 수 있어요."
                  : "Later administrative changes become selectable after a snapshot update."}
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <p className="fine-print">
            {ko
              ? "해외 거주자용 입력입니다. 대한민국 지역은 공식 목록에서 선택해 주세요."
              : "For homes outside South Korea. Use the official list for Korean regions."}
          </p>
          <label>
            {t("profile.city")}
            <input
              autoComplete="address-level2"
              value={value.homeCity}
              minLength={2}
              maxLength={80}
              required
              onChange={(event) =>
                onChange({ ...value, homeCity: event.target.value })
              }
            />
          </label>
          <label>
            {t("profile.area")}
            <input
              value={value.homeArea}
              maxLength={80}
              onChange={(event) =>
                onChange({ ...value, homeArea: event.target.value })
              }
            />
          </label>
        </>
      )}
      <label>
        {t("profile.scope")}
        <select
          value={value.localityScope}
          onChange={(event) => {
            const scope = event.target.value as Locality["localityScope"];
            if (mode === "kr" && data) emit(selection, scope);
            else onChange({ ...value, localityScope: scope });
          }}
        >
          <option value="auto">{t("profile.scopeAuto")}</option>
          <option value="city">{t("profile.scopeCity")}</option>
          <option value="area" disabled={!value.homeArea}>
            {t("profile.scopeArea")}
          </option>
        </select>
      </label>
      {value.homeCity.trim().length >= 2 && (
        <p className="notice-box">
          {t("profile.scopePreview", {
            area: localityLabel(value),
            scope: t(
              suggestedScope(value) === "city"
                ? "profile.scopeCity"
                : "profile.scopeArea",
            ),
          })}
        </p>
      )}
      <p className="fine-print">{t("profile.scopeHelp")}</p>
      <p className="fine-print">
        {ko
          ? "지역 검색은 이 기기에서 처리해요. 이메일·예약 정보는 외부 검색 서비스로 보내지 않아요."
          : "Region search runs on this device. Email and booking details are never sent to an external search service."}
      </p>
    </div>
  );
}
