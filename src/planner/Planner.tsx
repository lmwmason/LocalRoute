import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import {
  regionForDestination,
  tripSchema,
  tripDates,
  scheduleSchema,
  evaluateSchedule,
  type Itinerary,
  type TripInput,
} from "../../shared/planner";
import { demoCatalog, demoSchedule } from "../../shared/planner-demo";
import { useI18n } from "../i18n";
import { config } from "../config";
import { api } from "../api";
import { ItineraryEditor } from "./ItineraryEditor";
import { toggleChoice } from "../../shared/preferences";
import { DestinationSearch } from "./DestinationSearch";
import { PlannerWelcome } from "./PlannerWelcome";
import { readPending, persistPending } from "./pending";
import { readTripDraft, writeTripDraft, type TripDraft } from "./trip-draft";
type Quote = Awaited<ReturnType<typeof api.quote>>;
type PendingPayload = Parameters<typeof api.generate>[0];
function initialTrip(language: "ko" | "en"): TripInput {
  const today = new Date().toLocaleDateString("sv-SE");
  return {
    destination: "seongsu",
    startDate: today,
    endDate: today,
    startTime: "09:30",
    endTime: "20:00",
    purpose: "food",
    activities: ["food"],
    foodTypes: ["korean"],
    budget: "moderate",
    companions: "couple",
    mobility: "walking",
    pace: "balanced",
    dietary: "",
    allowUnverifiedDietary: false,
    transferBufferMinutes: 20,
    language,
  };
}
function readDemoPlan(): Itinerary | null {
  try {
    const data = JSON.parse(
      sessionStorage.getItem("localroute.demo.plan") || "null",
    );
    if (
      data?.provenance !== "demo" ||
      !tripSchema.safeParse(data.input).success ||
      !scheduleSchema.safeParse(data.schedule).success ||
      !Array.isArray(data.catalog)
    )
      return null;
    if (
      data.catalog.some(
        (candidate: unknown) =>
          !candidate ||
          typeof candidate !== "object" ||
          !("id" in candidate) ||
          !demoCatalog.some((place) => place.id === candidate.id),
      )
    )
      return null;
    const evaluation = evaluateSchedule(data.schedule, data.input, demoCatalog);
    return evaluation.valid
      ? { ...data, catalog: demoCatalog, evaluation }
      : null;
  } catch {
    return null;
  }
}
export function Planner({
  signedIn,
  userId,
  onLogin,
}: {
  signedIn: boolean;
  userId?: string;
  onLogin: () => void;
}) {
  const { t, language } = useI18n();
  const location = useLocation(),
    navigate = useNavigate();
  const routeStep = /^\/plan\/new\/([1-4])$/.exec(location.pathname);
  const step = routeStep ? Number(routeStep[1]) : 0;
  const itineraryId = location.pathname.match(/^\/itineraries\/([^/]+)$/)?.[1];
  function setStep(next: number | ((current: number) => number)) {
    const value = typeof next === "function" ? next(step) : next;
    navigate(value > 0 ? `/plan/new/${value}` : "/plan");
  }
  const [input, setInput] = useState<TripDraft>(() => {
      const draft = readTripDraft(userId);
      if (draft) return draft;
      return config.demo
        ? initialTrip(language)
        : { ...initialTrip(language), destination: null };
    }),
    [consent, setConsent] = useState(false),
    [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Itinerary | null>(() =>
      config.demo ? readDemoPlan() : null,
    ),
    [savedPlans, setSavedPlans] = useState<Itinerary[]>([]),
    [pins, setPins] = useState<string[]>([]),
    [sourceId, setSourceId] = useState<string | undefined>(),
    [planLookup, setPlanLookup] = useState<{
      id: string;
      loading: boolean;
      error: string;
    } | null>(null),
    [planRetry, setPlanRetry] = useState(0);
  const pending = useRef<PendingPayload | null>(null),
    inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    writeTripDraft(input, userId);
  }, [input, userId]);
  useEffect(() => {
    const id = itineraryId;
    if (!id || result?.id === id) return;
    const local = config.demo
      ? readDemoPlan()
      : savedPlans.find((plan) => plan.id === id);
    if (local?.id === id) setResult(local);
    else if (!config.demo && signedIn) {
      let active = true;
      setPlanLookup({ id, loading: true, error: "" });
      api
        .plan(id)
        .then((plan) => {
          if (active) {
            setResult(plan);
            setPlanLookup({ id, loading: false, error: "" });
          }
        })
        .catch((error: Error) => {
          if (active)
            setPlanLookup({ id, loading: false, error: error.message });
        });
      return () => {
        active = false;
      };
    }
  }, [itineraryId, result?.id, savedPlans, signedIn, planRetry]);
  useEffect(() => {
    if (config.demo) return;
    const saved = readPending(userId);
    pending.current = saved;
    if (saved) {
      setInput(saved.input);
      navigate("/plan/new/4", { replace: true });
      setResult(null);
      setError(t("errors.REQUEST_STATUS_UNKNOWN"));
    }
  }, [userId, t, navigate]);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (!config.demo && signedIn)
      api
        .plans()
        .then((plans) => setSavedPlans(plans.map((p) => p.result)))
        .catch(() => {});
  }, [signedIn]);
  useEffect(() => {
    if (step !== 4) return;
    setConsent(false);
    if (config.demo) {
      setQuote({
        enabled: true,
        cost: 0,
        promo: 50,
        earned: 0,
        held: 0,
        policyVersion: "demo",
      });
      return;
    }
    let active = true;
    setQuote(null);
    if (signedIn)
      api
        .quote(userId, tripDates(input.startDate, input.endDate).length)
        .then((value) => {
          if (active) setQuote(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [step, signedIn, userId, input.startDate, input.endDate]);
  function update<K extends keyof TripDraft>(key: K, value: TripDraft[K]) {
    setInput((old) => ({ ...old, [key]: value }));
    setConsent(false);
    setError("");
  }
  function toggle<K extends "activities" | "foodTypes">(
    key: K,
    value: TripInput[K][number],
  ) {
    setInput((previous) => ({
      ...previous,
      [key]: toggleChoice<string>(previous[key], value),
    }));
    setConsent(false);
    setError("");
  }
  function next() {
    const parsed = tripSchema.safeParse({ ...input, language });
    if (!parsed.success) {
      setError(
        !input.destination
          ? t("errors.DESTINATION_SELECTION_INVALID")
          : parsed.error.issues[0].message,
      );
      return;
    }
    setError("");
    setStep((n) => n + 1);
  }
  async function complete(plan: Itinerary) {
    setResult(plan);
    navigate(`/itineraries/${plan.id}`);
    setPins([]);
    setSourceId(undefined);
    pending.current = null;
    if (!config.demo) persistPending(userId, null);
    try {
      if (plan.provenance === "demo")
        sessionStorage.setItem("localroute.demo.plan", JSON.stringify(plan));
    } catch {
      /* still available in this page */
    }
    if (!config.demo && signedIn)
      api
        .plans()
        .then((plans) => setSavedPlans(plans.map((p) => p.result)))
        .catch(() => {});
  }
  async function generate() {
    if (inFlight.current || !consent) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (config.demo) {
        if (
          input.destination !== "seongsu" ||
          input.startDate !== input.endDate ||
          input.startTime !== "09:30" ||
          input.endTime !== "20:00"
        ) {
          throw new Error(t("planner.demoOneDay"));
        }
        const trip = tripSchema.parse({ ...input, language });
        const schedule = demoSchedule(trip),
          evaluation = evaluateSchedule(schedule, trip, demoCatalog);
        if (!evaluation.valid)
          throw new Error(
            evaluation.errors.map((e) => t(`quality.${e.code}`)).join(" "),
          );
        await complete({
          id: crypto.randomUUID(),
          revision: 1,
          input: trip,
          schedule,
          catalog: demoCatalog,
          evaluation,
          createdAt: new Date().toISOString(),
          model: "demo-template",
          provenance: "demo",
          cost: 0,
        });
      } else {
        if (!quote?.enabled) throw new Error(t("planner.disabled"));
        const payload = pending.current || {
          requestId: crypto.randomUUID(),
          input: tripSchema.parse({ ...input, language }),
          expectedCost: quote.cost,
          policyVersion: quote.policyVersion,
          consent: true as const,
          ...(quote.starter
            ? { aiConsentVersion: "planner-ai-v1" as const }
            : {}),
          ...(sourceId ? { sourcePlanId: sourceId, pinIds: pins } : {}),
        };
        persistPending(userId, payload);
        pending.current = payload;
        const generated = await api.generate(payload, userId);
        if ("schedule" in generated) await complete(generated);
        else setError(t("errors.REQUEST_STATUS_UNKNOWN"));
      }
    } catch (e) {
      setError(
        t(`errors.${e instanceof Error ? e.message : "GENERATION_FAILED"}`),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function checkPending() {
    if (!pending.current) return;
    setBusy(true);
    try {
      const status = await api.planStatus(pending.current.requestId);
      if (status.status === "ready" && status.result)
        await complete(status.result);
      else if (status.status === "failed") {
        persistPending(userId, null);
        pending.current = null;
        setError(t("planner.noChargeFailure"));
      } else setError(t("planner.generating"));
    } catch (e) {
      if ((e as Error).message === "REQUEST_NOT_FOUND" && pending.current) {
        // Status checks never send another model request. Keep unknown work
        // separate until the traveler explicitly chooses to stop or retry.
        setError(t("planner.requestMissing"));
      } else setError(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function backToEdit() {
    setStep((n) => n - 1);
    setConsent(false);
    setError("");
    const previous = pending.current;
    if (!previous) return;
    setBusy(true);
    try {
      const outcome = await api.cancelPlan(previous.requestId, userId);
      if (outcome.status === "not_found" && previous.expectedCost > 0) {
        setError(t("planner.requestMissing"));
        return;
      }
      persistPending(userId, null);
      pending.current = null;
      setError(
        t(
          outcome.status === "ready"
            ? "planner.previousSaved"
            : "planner.editReady",
        ),
      );
      if (outcome.status === "ready")
        void api
          .plans()
          .then((plans) => setSavedPlans(plans.map((p) => p.result)))
          .catch(() => {});
    } catch {
      setError(t("planner.editWhilePending"));
    } finally {
      setBusy(false);
    }
  }
  if (result && location.pathname === `/itineraries/${result.id}`)
    return (
      <>
        <ItineraryEditor
          key={result.id}
          itinerary={result}
          onSaved={(plan) => void complete(plan)}
          onRegenerate={(ids) => {
            setPins(ids);
            setSourceId(result.id);
            setInput({ ...result.input, language });
            setStep(2);
            setError("");
          }}
        />
        <button
          className="text-button plan-another"
          onClick={() => {
            setResult(null);
            setStep(1);
            setInput(initialTrip(language));
            pending.current = null;
          }}
        >
          {t("planner.startAgain")}
          <ArrowRight size={17} />
        </button>
      </>
    );
  if (itineraryId) {
    const needsLogin = !config.demo && !signedIn;
    const loading =
      !config.demo &&
      !needsLogin &&
      (planLookup?.id !== itineraryId || planLookup.loading);
    return (
      <section className="planner-page empty-state">
        <h1>
          {language === "ko"
            ? needsLogin
              ? "로그인 후 일정을 확인해 주세요"
              : loading
                ? "일정을 불러오고 있어요"
                : "일정을 불러오지 못했어요"
            : needsLogin
              ? "Sign in to view your itinerary"
              : loading
                ? "Loading your itinerary"
                : "Itinerary unavailable"}
        </h1>
        {loading ? (
          <p role="status">{t("planner.checking")}</p>
        ) : (
          <>
            <p role={needsLogin ? undefined : "alert"}>
              {language === "ko"
                ? needsLogin
                  ? "일정을 만든 계정으로 로그인해 주세요."
                  : config.demo
                    ? "이 브라우저에 저장된 체험 일정이 없어요. 새 체험 일정을 만들어 주세요."
                    : "삭제된 일정이거나 접근 권한이 없을 수 있어요. 연결 상태를 확인하고 다시 시도해 주세요."
                : needsLogin
                  ? "Use the account that created this itinerary."
                  : config.demo
                    ? "This demo itinerary is not saved in this browser. Create a new demo itinerary."
                    : "The itinerary may be deleted or belong to another account. Check your connection and try again."}
            </p>
            {needsLogin ? (
              <button className="primary" onClick={onLogin}>
                {t("로그인")}
              </button>
            ) : !config.demo ? (
              <button
                className="secondary"
                onClick={() => setPlanRetry((value) => value + 1)}
              >
                {t("common.retry")}
              </button>
            ) : null}
          </>
        )}
        <button className="text-button" onClick={() => navigate("/plan")}>
          {t("common.plan")}
          <ArrowRight size={17} />
        </button>
      </section>
    );
  }
  return (
    <section className="planner-page">
      {step === 0 ? (
        <>
          {!config.demo && savedPlans.length > 0 && (
            <section className="saved-plans">
              <h2>{t("planner.savedSchedules")}</h2>
              {savedPlans.map((plan) => (
                <button
                  className="saved-plan"
                  key={plan.id}
                  onClick={() => {
                    setResult(plan);
                    navigate(`/itineraries/${plan.id}`);
                  }}
                >
                  <strong>{plan.schedule.title}</strong>
                  <span>
                    {plan.input.startDate} ·{" "}
                    {regionForDestination(plan.input.destination)[language]}
                  </span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </section>
          )}
          <PlannerWelcome
            input={{ ...input, destination: input.destination || "seongsu" }}
            onActivity={(value) => toggle("activities", value)}
            onStart={() => {
              setStep(1);
              setResult(null);
            }}
          />
        </>
      ) : (
        <div className="wizard-shell">
          <div className="wizard-progress" aria-label={`${step}/4`}>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={n <= step ? "active" : ""} />
            ))}
          </div>
          <div className="wizard-heading">
            <span className="eyebrow">{step} / 4</span>
            <h1 ref={heading} tabIndex={-1}>
              {t(`planner.step${step}`)}
            </h1>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 4) next();
              else void generate();
            }}
          >
            {step === 1 && (
              <>
                {!config.demo && (
                  <p className="fine-print">{t("planner.coverageRadius")}</p>
                )}
                {config.demo ? (
                  <p className="notice-box">{t("planner.demoOneDay")}</p>
                ) : (
                  <DestinationSearch
                    language={language}
                    value={
                      typeof input.destination === "object"
                        ? input.destination
                        : null
                    }
                    onChange={(destination) =>
                      update("destination", destination)
                    }
                    disabled={busy}
                  />
                )}
                <div className="two-columns">
                  <label>
                    {t("planner.startDate")}
                    <input
                      type="date"
                      value={input.startDate}
                      onChange={(e) => update("startDate", e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    {t("planner.endDate")}
                    <input
                      type="date"
                      value={input.endDate}
                      min={input.startDate}
                      onChange={(e) => update("endDate", e.target.value)}
                      required
                    />
                  </label>
                </div>
                <div className="two-columns">
                  <label>
                    {t("planner.dailyStart")}
                    <input
                      type="time"
                      value={input.startTime}
                      onChange={(e) => update("startTime", e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    {t("planner.dailyEnd")}
                    <input
                      type="time"
                      value={input.endTime}
                      onChange={(e) => update("endTime", e.target.value)}
                      required
                    />
                  </label>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <fieldset>
                  <legend>{t("planner.purpose")}</legend>
                  <div className="option-grid">
                    {(["relax", "culture", "food", "explore"] as const).map(
                      (v) => (
                        <button
                          type="button"
                          key={v}
                          aria-pressed={input.purpose === v}
                          className={input.purpose === v ? "selected" : ""}
                          onClick={() => update("purpose", v)}
                        >
                          {t(`purpose.${v}`)}
                        </button>
                      ),
                    )}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>{t("planner.activities")}</legend>
                  <div className="choice-chips">
                    {(
                      [
                        "food",
                        "art",
                        "nature",
                        "shopping",
                        "history",
                        "coffee",
                        "hotspots",
                      ] as const
                    ).map((v) => (
                      <button
                        type="button"
                        key={v}
                        aria-pressed={input.activities.includes(v)}
                        onClick={() => toggle("activities", v)}
                      >
                        {t(`activity.${v}`)}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>{t("planner.food")}</legend>
                  <div className="choice-chips">
                    {(["korean", "japanese", "western", "cafe"] as const).map(
                      (v) => (
                        <button
                          type="button"
                          key={v}
                          aria-pressed={input.foodTypes.includes(v)}
                          onClick={() => toggle("foodTypes", v)}
                        >
                          {t(`food.${v}`)}
                        </button>
                      ),
                    )}
                  </div>
                </fieldset>
                <div className="two-columns">
                  <label>
                    {t("planner.budget")}
                    <select
                      value={input.budget}
                      onChange={(e) =>
                        update("budget", e.target.value as TripInput["budget"])
                      }
                    >
                      {["value", "moderate", "flexible"].map((v) => (
                        <option key={v} value={v}>
                          {t(`budget.${v}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("planner.companions")}
                    <select
                      value={input.companions}
                      onChange={(e) =>
                        update(
                          "companions",
                          e.target.value as TripInput["companions"],
                        )
                      }
                    >
                      {["solo", "couple", "friends", "family"].map((v) => (
                        <option key={v} value={v}>
                          {t(`companion.${v}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <div className="two-columns">
                  <label>
                    {t("planner.mobility")}
                    <select
                      value={input.mobility}
                      onChange={(e) =>
                        update(
                          "mobility",
                          e.target.value as TripInput["mobility"],
                        )
                      }
                    >
                      {["walking", "transit", "car", "wheelchair"].map((v) => (
                        <option key={v} value={v}>
                          {t(`mobility.${v}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("planner.pace")}
                    <select
                      value={input.pace}
                      onChange={(e) =>
                        update("pace", e.target.value as TripInput["pace"])
                      }
                    >
                      {["relaxed", "balanced", "active"].map((v) => (
                        <option key={v} value={v}>
                          {t(`pace.${v}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  {t("planner.buffer")}
                  <input
                    type="number"
                    min={10}
                    max={90}
                    value={input.transferBufferMinutes}
                    onChange={(e) =>
                      update("transferBufferMinutes", Number(e.target.value))
                    }
                  />
                </label>
                <p className="fine-print">{t("planner.bufferHint")}</p>
                <label>
                  {t("planner.dietary")}
                  <textarea
                    value={input.dietary}
                    onChange={(e) => update("dietary", e.target.value)}
                    maxLength={500}
                    placeholder={t("planner.dietaryHint")}
                  />
                </label>
                {input.dietary && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={input.allowUnverifiedDietary}
                      onChange={(e) =>
                        update("allowUnverifiedDietary", e.target.checked)
                      }
                    />
                    <span>{t("planner.dietaryConsent")}</span>
                  </label>
                )}
              </>
            )}
            {step === 4 && (
              <>
                <div className="trip-review">
                  <h3>{t("planner.review")}</h3>
                  <p>
                    {input.destination
                      ? regionForDestination(input.destination)[language]
                      : t("errors.DESTINATION_SELECTION_INVALID")}{" "}
                    · {input.startDate}{" "}
                    {input.endDate !== input.startDate
                      ? `— ${input.endDate}`
                      : ""}
                  </p>
                  <p>
                    {input.startTime}–{input.endTime} ·{" "}
                    {t(`purpose.${input.purpose}`)} · {t(`pace.${input.pace}`)}
                  </p>
                  <div className="place-tags">
                    {input.activities.map((v) => (
                      <span key={v}>{t(`activity.${v}`)}</span>
                    ))}
                    {input.foodTypes.map((v) => (
                      <span key={v}>{t(`food.${v}`)}</span>
                    ))}
                  </div>
                </div>
                <div className="lp-confirm">
                  <div>
                    <span>{t("planner.price")}</span>
                    <strong>
                      {config.demo ? 0 : (quote?.cost ?? "—")} LP{" "}
                      {config.demo && <small>DEMO</small>}
                    </strong>
                  </div>
                  <div>
                    <span>{t("planner.promo")}</span>
                    <strong>{quote?.promo ?? "—"} LP</strong>
                  </div>
                  <div>
                    <span>{t("planner.earned")}</span>
                    <strong>{quote?.earned ?? "—"} LP</strong>
                  </div>
                  <p>{t("planner.expiry")}</p>
                </div>
                {config.demo ? (
                  <p className="notice-box">{t("planner.demoNotice")}</p>
                ) : !signedIn ? (
                  <button
                    type="button"
                    className="secondary full"
                    onClick={onLogin}
                  >
                    {t("planner.loginRequired")}
                  </button>
                ) : !quote?.enabled ? (
                  <p className="notice-box">{t("planner.disabled")}</p>
                ) : null}
                {quote?.starter && (
                  <p className="notice-box">
                    {language === "ko"
                      ? "운영자가 수집한 실제 장소를 초기 추천으로 사용하며 독립적인 현지인 방문 후기는 아직 확인되지 않았어요. 하루당 10 LP이며 검증된 일정이 저장된 뒤에만 차감해요. 실제 금전 결제는 없어요. 여행 지역·날짜·취향은 Google Gemini로 전송하며 무료 API의 입력·출력은 서비스 개선과 검토에 사용될 수 있어요. 이름·연락처·식이 제한 원문은 전송하지 않아요."
                      : "Operator starter picks use researched real places; independent local visits are not yet verified. The cost is 10 LP per travel day, charged only after a validated itinerary is saved. No real money is charged. Trip areas, dates and preferences go to Google Gemini; free API inputs and outputs may be used for improvement and review. Names, contact details and dietary text are excluded."}
                  </p>
                )}
                <p className="fine-print">
                  {t("planner.bufferHint")}{" "}
                  {language === "ko"
                    ? "입력 내용을 확인한 뒤 실제 장소 후보를 조회하고 일정의 시간·동선을 검증해요."
                    : "After confirmation, we look up real candidates and validate the itinerary's timing and route."}
                </p>
                {input.dietary && (
                  <p className="notice-box">{t("planner.unknownDiet")}</p>
                )}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    {quote?.starter
                      ? language === "ko"
                        ? "위 LP 총액, 초기 추천의 출처·미확인 정보와 Gemini 처리 안내를 확인하고 일정 생성을 요청해요."
                        : "I confirm the total LP cost, starter sources, unverified information and Gemini processing notice, and request this itinerary."
                      : t("planner.confirm")}
                  </span>
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="error-message">
                {error.startsWith("errors.") ? error.slice(7) : error}
              </p>
            )}
            {pending.current && error && (
              <button
                type="button"
                className="secondary full"
                onClick={checkPending}
                disabled={busy}
              >
                {t("common.retry")}
              </button>
            )}
            {busy && (
              <div className="generation-progress" role="status">
                <Sparkles size={24} />
                <p>{t("planner.generating")}</p>
                <small>{t("planner.checking")}</small>
                <small>{t("planner.validationRetries")}</small>
              </div>
            )}
            <div className="wizard-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void backToEdit()}
              >
                <ArrowLeft size={17} />
                {t("common.back")}
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  (step === 4 && Boolean(pending.current)) ||
                  (step === 4 &&
                    (!consent ||
                      (!config.demo && (!signedIn || !quote?.enabled))))
                }
              >
                {step < 4
                  ? t("common.next")
                  : config.demo
                    ? t("planner.demoGenerate")
                    : t("planner.generate", { cost: quote?.cost ?? "—" })}
                <ArrowRight size={17} />
              </button>
            </div>
            <p className="fine-print wizard-nocharge">
              {t("planner.noChargeFailure")}
            </p>
          </form>
        </div>
      )}
    </section>
  );
}
