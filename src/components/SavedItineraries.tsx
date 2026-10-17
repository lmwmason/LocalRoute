import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { supabase } from "../supabase";
import { useI18n } from "../i18n";
import "../planner/planner.css";

// Account changes synchronously discard the previous account's rendered state.
export function SavedItineraries({ userId }: { userId: string }) {
  return <AccountItineraries key={userId} userId={userId} />;
}
function AccountItineraries({ userId }: { userId: string }) {
  const { language } = useI18n();
  const ko = language === "ko", headingId = useId();
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof api.plans>> | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function sameAccount() {
      const session = (await supabase?.auth.getSession())?.data.session;
      if (!session || session.user.id !== userId) throw new Error("AUTH_ACCOUNT_CHANGED");
    }
    void (async () => {
      try {
        await sameAccount();
        const result = await api.plans();
        await sameAccount();
        if (!Array.isArray(result)) throw new Error("Invalid itinerary list");
        if (active) { setPlans(result); setError(false); }
      } catch {
        if (active) { setPlans(null); setError(true); }
      }
    })();
    return () => { active = false; };
  }, [userId, attempt]);
  return <section className="saved-plans" aria-labelledby={headingId}>
    <h2 id={headingId}>{ko ? "저장한 여행 일정" : "Saved itineraries"}</h2>
    {error ? <div role="alert">
      <p>{ko ? "저장한 일정을 불러오지 못했어요. 다시 확인해 주세요." : "Could not load your saved itineraries. Please retry."}</p>
      <button className="secondary" style={{minHeight:44}} onClick={() => {setError(false);setPlans(null);setAttempt(value=>value+1);}}>{ko ? "다시 불러오기" : "Retry"}</button>
    </div> : plans === null ? <p role="status">{ko ? "저장한 일정을 불러오는 중…" : "Loading saved itineraries…"}</p>
      : plans.length === 0 ? <p>{ko ? "아직 저장한 여행 일정이 없어요." : "You have no saved itineraries yet."}</p>
      : plans.map(({id,result}) => <Link key={id} className="saved-plan" to={`/itineraries/${encodeURIComponent(id)}`} style={{minHeight:44,minWidth:0,flexWrap:"wrap",overflowWrap:"anywhere",color:"inherit",textDecoration:"none"}}>
        <strong style={{minWidth:0,flexBasis:"100%"}}>{result.schedule.title}</strong>
        <time dateTime={result.input.startDate}>{result.input.startDate}{result.input.endDate !== result.input.startDate ? ` – ${result.input.endDate}` : ""}</time>
        {result.provenance === "operator_example" && <span className="badge">{ko ? "운영자 예약 시연 · 예약 미확정" : "Operator booking example · unconfirmed"}</span>}
        <span>{result.cost} LP</span>
      </Link>)}
  </section>;
}
