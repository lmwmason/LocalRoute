import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Gift, ShieldCheck } from "lucide-react";
import { LanguageSwitch, useI18n } from "../i18n";
import { BrandLink } from "../components/BrandLink";
import { supabase } from "../supabase";
import "./checkout.css";
async function requestBonus(claim = false) {
  const session = (await supabase?.auth.getSession())?.data.session;
  if (!session) throw new Error("AUTH");
  const response = await fetch("/api/checkout/test-bonus", {
    method: claim ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    ...(claim ? { body: JSON.stringify({ accepted: true, requestId: crypto.randomUUID() }) } : {}),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "AUTH" : "UNAVAILABLE");
  const value = await response.json();
  if (typeof value.claimed !== "boolean" || typeof value.granted !== "boolean" || value.amount !== 100) throw new Error("UNAVAILABLE");
  return value as { claimed: boolean; granted: boolean; amount: 100 };
}
export default function TestCheckout() {
  const { language } = useI18n(),
    ko = language === "ko";
  const [accepted, setAccepted] = useState(false),
    [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(true);
  const [already, setAlready] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    setBusy(true); setError("");
    requestBonus().then(value => {
      if (active && value.claimed) { setAlready(true); setComplete(true); }
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "UNAVAILABLE");
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [attempt]);
  return (
    <div className="app-shell">
      <header className="topbar">
        <BrandLink />
        <LanguageSwitch />
      </header>
      <main className="test-checkout">
        <span className="badge">
          TEST MODE · {ko ? "실제 결제 없음" : "No real payment"}
        </span>
        <h1>{ko ? "무료 테스트 보너스" : "Free test bonus"}</h1>
        {complete ? (
          <section className="checkout-success" role="status">
            <CheckCircle2 size={44} />
            <h2>
              {already ? (ko ? "이미 받은 테스트 보너스예요" : "Test bonus already claimed") : (ko ? "100 LP를 지급했어요" : "100 LP added")}
            </h2>
            <p>
              {ko
                ? "계정당 한 번 제공하는 무료 테스트 보너스 100 LP예요. 실제 일정에 사용할 수 있고 중복 지급되지 않아요. 실제 결제나 구매는 없어요."
                : "This free 100 LP test bonus is available once per account and can be used for itineraries. Repeated requests do not add more LP. No payment or purchase occurred."}
            </p>
            <Link className="primary full" to="/plan">
              {ko ? "여행 계획으로 돌아가기" : "Back to trip planning"}
            </Link>
          </section>
        ) : (
          <>
            <p className="intro-copy">
              {ko
                ? "이메일 인증과 필수 동의를 완료한 계정에 한 번만 100 LP를 제공해요. 실제 결제가 아니며 카드·계좌 정보를 받지 않아요."
                : "Verified accounts with current required consent can receive 100 LP once. There is no real payment and no card or bank information is collected."}
            </p>
            <section className="checkout-order">
              <h2>{ko ? "계정당 1회 테스트 보너스" : "One-time account test bonus"}</h2>
              <div>
                <span>100 LP</span>
                <strong>
                  {ko ? "무료" : "Free"}
                </strong>
              </div>
              <p>
                {ko
                  ? "구매한 LP가 아닌 무료 테스트 보너스이며 실제 일정에 사용할 수 있어요."
                  : "These are free test bonus LP, not purchased LP, and can be used for itineraries."}
              </p>
              <div className="checkout-total">
                <span>{ko ? "실제 청구 금액" : "Actual charge"}</span>
                <strong>₩0</strong>
              </div>
            </section>
            <section className="checkout-method">
              <h2>{ko ? "무료 시연 지원" : "Free demo support"}</h2>
              <div>
                <Gift size={24} />
                <strong>
                  {ko ? "실제 결제 없이 지급" : "Granted without payment"}
                </strong>
                <CheckCircle2 size={20} />
              </div>
              <p>
                <ShieldCheck size={16} />
                {ko
                  ? "결제대행사 연결과 금융정보 수집이 없어요."
                  : "No payment gateway or financial data collection."}
              </p>
            </section>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={accepted}
                disabled={busy}
                onChange={(event) => setAccepted(event.target.checked)}
              />
              <span>
                {ko
                  ? "실제 결제 없이 계정당 1회 무료 테스트 보너스 100 LP를 받는 것에 동의해요."
                  : "I agree to receive the free 100 LP test bonus once per account, without real payment."}
              </span>
            </label>
            <button
              className="primary full"
              disabled={!accepted || busy || Boolean(error)}
              onClick={async () => {
                if (!accepted || lock.current) return;
                lock.current = true; setBusy(true); setError("");
                try {
                  const value = await requestBonus(true);
                  if (!value.claimed) throw new Error("UNAVAILABLE");
                  setAlready(!value.granted); setComplete(true);
                } catch(cause) { setError(cause instanceof Error ? cause.message : "UNAVAILABLE"); }
                finally { setBusy(false); lock.current = false; }
              }}
            >
              {busy ? (ko ? "확인 중…" : "Checking…") : (ko ? "무료 테스트 보너스 100 LP 받기" : "Claim free 100 LP test bonus")}
            </button>
            {error && <div role="alert"><p>{error === "AUTH" ? (ko ? "로그인하고 이메일 인증·필수 동의를 완료해 주세요." : "Please sign in, verify your email and complete required consent.") : (ko ? "지급 상태를 확인하지 못했어요. 다시 확인해 주세요. 중복 지급되지 않아요." : "Could not verify bonus status. Retry safely; duplicate grants are prevented.")}</p><button className="secondary full" disabled={busy} onClick={() => setAttempt(value => value + 1)}>{ko ? "상태 다시 확인" : "Check status again"}</button></div>}
            <Link className="text-button" to="/plan">
              {ko ? "로그인·동의 확인 / 계획으로 돌아가기" : "Sign in / consent / return to planning"}
            </Link>
          </>
        )}
        <nav className="legal-page-links">
          <Link to="/legal/terms">{ko ? "이용약관" : "Terms"}</Link>
          <Link to="/legal/privacy">
            {ko ? "개인정보 처리방침" : "Privacy"}
          </Link>
        </nav>
      </main>
    </div>
  );
}
