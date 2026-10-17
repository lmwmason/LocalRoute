import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import {
  regions,
  tripSchema,
  evaluateSchedule,
  type Itinerary,
  type TripInput,
} from "../../shared/planner";
import { demoCatalog, demoSchedule } from "../../shared/planner-demo";
import { useI18n } from "../i18n";
import { config } from "../config";
import { api } from "../api";
import { ItineraryEditor } from "./ItineraryEditor";
import { PlannerWelcome } from "./PlannerWelcome";
import { readPending, persistPending } from "./pending";
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
    activities: ["art", "nature"],
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
    return data?.provenance === "demo" && data?.schedule && data?.catalog
      ? data
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
  const [step, setStep] = useState(0),
    [input, setInput] = useState<TripInput>(() => initialTrip(language)),
    [consent, setConsent] = useState(false),
    [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Itinerary | null>(readDemoPlan),
    [savedPlans, setSavedPlans] = useState<Itinerary[]>([]),
    [pins, setPins] = useState<string[]>([]),
    [sourceId, setSourceId] = useState<string | undefined>();
  const pending = useRef<PendingPayload | null>(null),
    inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (config.demo) return;
    const saved = readPending(userId);
    pending.current = saved;
    if (saved) {
      setInput(saved.input);
      setStep(3);
      setResult(null);
      setError(t("errors.REQUEST_STATUS_UNKNOWN"));
    }
  }, [userId, t]);
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
    if (step !== 3) return;
    setConsent(false);
    if (config.demo) {
      setQuote({
        enabled: true,
        cost: 0,
        promo: 300,
        earned: 0,
        held: 0,
        policyVersion: "demo",
      });
      return;
    }
    if (signedIn)
      api
        .quote()
        .then(setQuote)
        .catch((e) => setError(e.message));
  }, [step, signedIn]);
  function update<K extends keyof TripInput>(key: K, value: TripInput[K]) {
    if (pending.current) {
      setError(t("errors.REQUEST_STATUS_UNKNOWN"));
      return;
    }
    setInput((old) => ({ ...old, [key]: value }));
    setError("");
  }
  function toggle<K extends "activities" | "foodTypes">(
    key: K,
    value: TripInput[K][number],
  ) {
    update(
      key,
      (input[key].includes(value as never)
        ? input[key].filter((v) => v !== value)
        : [...input[key], value]) as TripInput[K],
    );
  }
  function next() {
    const parsed = tripSchema.safeParse({ ...input, language });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    setStep((n) => n + 1);
  }
  async function complete(plan: Itinerary) {
    setResult(plan);
    setStep(0);
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
        const trip = { ...input, language };
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
          input: { ...input, language },
          expectedCost: quote.cost,
          policyVersion: quote.policyVersion,
          consent: true as const,
          ...(sourceId ? { sourcePlanId: sourceId, pinIds: pins } : {}),
        };
        persistPending(userId, payload);
        pending.current = payload;
        const generated = await api.generate(payload);
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
        try {
          // Explicit recovery reuses the persisted key and original consent; never create a second job.
          const recovered = await api.generate(pending.current);
          if ("schedule" in recovered) await complete(recovered);
          else setError(t("errors.REQUEST_STATUS_UNKNOWN"));
        } catch (error) {
          setError(t(`errors.${(error as Error).message}`));
        }
      } else setError(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  if (result && step === 0)
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
  return (
    <section className="planner-page">
      {step === 0 ? (
        <>
          <PlannerWelcome
            input={input}
            onPurpose={(value) => update("purpose", value)}
            onActivity={(value) => toggle("activities", value)}
            onStart={() => {
              setStep(1);
              setResult(null);
            }}
          />
          {!config.demo && savedPlans.length > 0 && (
            <section className="saved-plans">
              <h2>{t("planner.savedSchedules")}</h2>
              {savedPlans.map((plan) => (
                <button
                  className="saved-plan"
                  key={plan.id}
                  onClick={() => setResult(plan)}
                >
                  <strong>{plan.schedule.title}</strong>
                  <span>
                    {plan.input.startDate} ·{" "}
                    {regions[plan.input.destination][language]}
                  </span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </section>
          )}
        </>
      ) : (
        <div className="wizard-shell">
          <div className="wizard-progress" aria-label={`${step}/3`}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= step ? "active" : ""} />
            ))}
          </div>
          <div className="wizard-heading">
            <span className="eyebrow">{step} / 3</span>
            <h1 ref={heading} tabIndex={-1}>
              {t(`planner.step${step}`)}
            </h1>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step < 3) next();
              else void generate();
            }}
          >
            {step === 1 && (
              <>
                <label>
                  {t("planner.destination")}
                  <select
                    value={input.destination}
                    onChange={(e) =>
                      update(
                        "destination",
                        e.target.value as TripInput["destination"],
                      )
                    }
                  >
                    {Object.entries(regions).map(([id, region]) => (
                      <option key={id} value={id}>
                        {region[language]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="fine-print">{t("planner.pilot")}</p>
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
                        "art",
                        "nature",
                        "shopping",
                        "history",
                        "coffee",
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
            {step === 3 && (
              <>
                <div className="trip-review">
                  <h3>{t("planner.review")}</h3>
                  <p>
                    {regions[input.destination][language]} · {input.startDate}{" "}
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
                      {config.demo ? 0 : quote?.cost || 100} LP{" "}
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
                <p className="fine-print">
                  {t("planner.bufferHint")} {t("planner.provenance")}
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
                  <span>{t("planner.confirm")}</span>
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
              </div>
            )}
            <div className="wizard-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy || Boolean(pending.current)}
                onClick={() => {
                  setStep((n) => n - 1);
                  setError("");
                }}
              >
                <ArrowLeft size={17} />
                {t("common.back")}
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  Boolean(pending.current) ||
                  (step === 3 &&
                    (!consent ||
                      (!config.demo && (!signedIn || !quote?.enabled))))
                }
              >
                {step < 3
                  ? t("common.next")
                  : config.demo
                    ? t("planner.demoGenerate")
                    : t("planner.generate", { cost: quote?.cost || 100 })}
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
