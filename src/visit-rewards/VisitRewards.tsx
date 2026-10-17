import { useEffect, useRef, useState } from "react";
import {
  visitRequestSchema,
  type VisitRewardPolicy,
  type VisitRewardRequest,
  type VisitTarget,
} from "../../shared/visit-rewards";
import { VisitRewardsApiError, type VisitRewardsApi } from "./api";
import { visitMessages } from "./messages";
import "./visit-rewards.css";
type Props = { api: VisitRewardsApi; language?: "ko" | "en" };
type Texts = typeof visitMessages.ko;
const errorText = (t: Texts, e: unknown) =>
  t[(e instanceof Error ? e.message : "visit.unavailable") as keyof Texts] ||
  t["visit.unavailable"];
function CaseDetails({ item, t }: { item: VisitRewardRequest; t: Texts }) {
  return (
    <>
      <p>
        <strong>{item.placeName}</strong>
      </p>
      <p>
        {t.date}: {item.visitedOn} · {t.score}: {item.helpfulness}/5
      </p>
      <p>
        {t.version} {item.versionNumber}: {item.versionText}
      </p>
      <p>
        {t.evidenceLabel}: {item.evidence}
      </p>
      <p>{t[item.state]}</p>
      {item.decision && (
        <>
          <p>
            {t.reason}: {item.decision.reason}
          </p>
          <p>
            {t.basis}: {item.decision.evidenceSummary}
          </p>
        </>
      )}
      {item.grant ? (
        <p>
          {item.grant.amount === 0 ? t.zero : `${t.paid}: ${item.grant.amount}`}
        </p>
      ) : (
        <p>{t.noGrant}</p>
      )}
    </>
  );
}
export function VisitRewardRequestPanel({ api, language = "ko" }: Props) {
  const t = visitMessages[language];
  const [targets, setTargets] = useState<VisitTarget[]>([]);
  const [items, setItems] = useState<VisitRewardRequest[]>([]);
  const [rating, setRating] = useState("");
  const [evidence, setEvidence] = useState("");
  const [affiliated, setAffiliated] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const attempt = useRef<ReturnType<typeof visitRequestSchema.parse> | null>(
    null,
  );
  async function refresh() {
    try {
      const [next, list] = await Promise.all([api.targets(), api.list()]);
      setTargets(next);
      setItems(list);
      setError("");
    } catch (e) {
      setError(errorText(t, e));
    }
  }
  useEffect(() => {
    let active = true;
    Promise.all([api.targets(), api.list()])
      .then(([a, b]) => {
        if (active) {
          setTargets(a);
          setItems(b);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(t, e));
      });
    return () => {
      active = false;
    };
  }, [api, t]);
  async function submit() {
    if (lock.current) return;
    const target = targets.find((v) => v.ratingId === rating);
    if (!target) return;
    const parsed = visitRequestSchema.safeParse(
      attempt.current || {
        requestId: crypto.randomUUID(),
        ratingId: rating,
        expectedHelpfulness: target.helpfulness,
        expectedVisitedOn: target.visitedOn,
        affiliated,
        evidence,
        consent,
      },
    );
    if (!parsed.success) {
      setError(t["visit.invalid"]);
      return;
    }
    lock.current = true;
    setBusy(true);
    attempt.current = parsed.data;
    try {
      const saved = await api.submit(parsed.data);
      setItems((list) => [saved, ...list.filter((v) => v.id !== saved.id)]);
      attempt.current = null;
      setEvidence("");
      setConsent(false);
      setError("");
    } catch (e) {
      setError(errorText(t, e));
      if (
        e instanceof VisitRewardsApiError &&
        [400, 401, 403, 404, 409, 422, 429].includes(e.status)
      ) {
        attempt.current = null;
        setConsent(false);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const selected = targets.find((v) => v.ratingId === rating);
  return (
    <section className="lr-visits">
      <h2>{t.title}</h2>
      <p>{t.notice}</p>
      {targets.length === 0 ? (
        <p>{t.empty}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label>
            {t.target}
            <select
              required
              value={rating}
              disabled={busy || Boolean(attempt.current)}
              onChange={(e) => {
                setRating(e.target.value);
                setConsent(false);
              }}
            >
              <option value="">—</option>
              {targets.map((v) => (
                <option key={v.ratingId} value={v.ratingId}>
                  {v.placeName} · v{v.versionNumber} · {v.visitedOn} ·{" "}
                  {v.helpfulness}/5
                </option>
              ))}
            </select>
          </label>
          {selected && <p>{selected.versionText}</p>}
          <label>
            {t.evidence}
            <textarea
              required
              minLength={10}
              maxLength={2000}
              value={evidence}
              readOnly={Boolean(attempt.current)}
              onChange={(e) => {
                setEvidence(e.target.value);
                setConsent(false);
              }}
            />
          </label>
          <label className="lr-visit-check">
            <input
              type="checkbox"
              checked={affiliated}
              disabled={Boolean(attempt.current)}
              onChange={(e) => {
                setAffiliated(e.target.checked);
                setConsent(false);
              }}
            />
            {t.affiliated}
          </label>
          <label className="lr-visit-check">
            <input
              type="checkbox"
              checked={consent}
              disabled={Boolean(attempt.current)}
              onChange={(e) => setConsent(e.target.checked)}
            />
            {t.consent}
          </label>
          <button disabled={busy || !consent} type="submit">
            {busy ? t.busy : t.send}
          </button>
        </form>
      )}
      <button type="button" onClick={refresh} disabled={busy}>
        {t.refresh}
      </button>
      {error && <p role="alert">{error}</p>}
      <h3>{t.history}</h3>
      <div aria-live="polite">
        {items.map((item) => (
          <article key={item.id}>
            <CaseDetails item={item} t={t} />
          </article>
        ))}
      </div>
    </section>
  );
}
export function VisitRewardAdminPanel({ api, language = "ko" }: Props) {
  const t = visitMessages[language];
  const [items, setItems] = useState<VisitRewardRequest[]>([]);
  const [policy, setPolicy] = useState<VisitRewardPolicy>();
  const [error, setError] = useState("");
  async function refresh() {
    try {
      const [queue, p] = await Promise.all([api.queue(), api.policy()]);
      setItems(queue);
      setPolicy(p);
      setError("");
    } catch (e) {
      setError(errorText(t, e));
    }
  }
  useEffect(() => {
    let active = true;
    Promise.all([api.queue(), api.policy()])
      .then(([q, p]) => {
        if (active) {
          setItems(q);
          setPolicy(p);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(t, e));
      });
    return () => {
      active = false;
    };
  }, [api, t]);
  return (
    <section className="lr-visits">
      <h2>{t.queue}</h2>
      <p>{t.notice}</p>
      {!policy?.effectiveEnabled && <p role="status">{t.disabled}</p>}
      <button type="button" onClick={refresh}>
        {t.refresh}
      </button>
      {error && <p role="alert">{error}</p>}
      {items.length === 0 ? (
        <p>{t.queueEmpty}</p>
      ) : (
        items.map((item) => (
          <ReviewCase
            key={item.id}
            api={api}
            item={item}
            t={t}
            enabled={policy?.effectiveEnabled === true}
            changed={refresh}
          />
        ))
      )}
    </section>
  );
}
function ReviewCase({
  api,
  item,
  t,
  enabled,
  changed,
}: {
  api: VisitRewardsApi;
  item: VisitRewardRequest;
  t: Texts;
  enabled: boolean;
  changed: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [basis, setBasis] = useState("");
  const [independent, setIndependent] = useState(false);
  const [affiliations, setAffiliations] = useState(false);
  const [collusion, setCollusion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  async function act(kind: "approve" | "reject" | "issue") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "issue") await api.issue(item.id);
      else
        await api.decide({
          requestId: requestId.current,
          id: item.id,
          decision: kind,
          reason,
          evidenceSummary: basis,
          independentEvidence: independent,
          affiliationsChecked: affiliations,
          collusionChecked: collusion,
        });
      await changed();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <article>
      <code>{item.id}</code>
      <CaseDetails item={item} t={t} />
      <p>
        {t.visitor}: {item.visitorId}
        <br />
        {t.curator}: {item.curatorId}
        <br />
        {t.place}: {item.placeId}
      </p>
      <p>
        {t.attribution}: {item.ratingId} / {item.endorsementVersionId}
      </p>
      <p>
        {t.affiliations}: {item.affiliated ? t.affiliated : t.none} ·{" "}
        {item.knownAffiliations
          ?.map((v) => `${v.userId}: ${v.kind}`)
          .join(", ") || t.none}
      </p>
      {item.state === "pending" ? (
        <>
          <label>
            {t.reason}
            <textarea
              minLength={10}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label>
            {t.basis}
            <textarea
              minLength={20}
              maxLength={2000}
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
            />
          </label>
          {(
            [
              [independent, setIndependent, t.independent],
              [affiliations, setAffiliations, t.affiliationCheck],
              [collusion, setCollusion, t.collusion],
            ] as const
          ).map(([value, setValue, label]) => (
            <label key={label} className="lr-visit-check">
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => setValue(e.target.checked)}
              />
              {label}
            </label>
          ))}
          <button
            type="button"
            disabled={
              busy ||
              reason.trim().length < 10 ||
              basis.trim().length < 20 ||
              !independent ||
              !affiliations ||
              !collusion
            }
            onClick={() => act("approve")}
          >
            {t.approve}
          </button>
          <button
            type="button"
            disabled={
              busy || reason.trim().length < 10 || basis.trim().length < 20
            }
            onClick={() => act("reject")}
          >
            {t.reject}
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={busy || !enabled || Boolean(item.grant)}
          onClick={() => act("issue")}
        >
          {t.issue}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
