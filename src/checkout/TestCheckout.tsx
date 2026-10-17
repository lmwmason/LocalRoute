import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";
import { LanguageSwitch, useI18n } from "../i18n";
import { BrandLink } from "../components/BrandLink";
import "./checkout.css";
export default function TestCheckout() {
  const { language } = useI18n(),
    ko = language === "ko";
  const [accepted, setAccepted] = useState(false),
    [complete, setComplete] = useState(false);
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
        <h1>{ko ? "LP 충전 체험" : "Try LP checkout"}</h1>
        {complete ? (
          <section className="checkout-success" role="status">
            <CheckCircle2 size={44} />
            <h2>
              {ko ? "테스트 결제를 완료했어요" : "Test checkout complete"}
            </h2>
            <p>
              {ko
                ? "실제 청구 금액은 0원이에요. 실제 LP 잔액은 바뀌지 않았고, 구매나 유료 API 호출도 발생하지 않았어요."
                : "The actual charge is ₩0. Your real LP balance is unchanged. No purchase or paid API request was made."}
            </p>
            <Link className="primary full" to="/plan">
              {ko ? "여행 계획으로 돌아가기" : "Back to trip planning"}
            </Link>
            <button
              className="text-button"
              onClick={() => {
                setComplete(false);
                setAccepted(false);
              }}
            >
              {ko ? "다시 체험하기" : "Try again"}
            </button>
          </section>
        ) : (
          <>
            <p className="intro-copy">
              {ko
                ? "결제 화면과 완료 흐름을 확인하는 체험입니다. 카드번호·계좌·결제 비밀번호를 입력하지 마세요."
                : "Preview checkout and its completion flow. Do not enter a card number, bank details or payment password."}
            </p>
            <section className="checkout-order">
              <h2>{ko ? "체험용 상품" : "Sample item"}</h2>
              <div>
                <span>100 LP</span>
                <strong>
                  {ko ? "가상 금액 ₩1,000" : "Sample price ₩1,000"}
                </strong>
              </div>
              <p>
                {ko
                  ? "테스트 표시용 금액이며 판매 가격이 아닙니다. 실제 상품을 구매하거나 LP를 발급하지 않아요."
                  : "This is a display fixture, not a sale price. No real product is purchased and no LP is issued."}
              </p>
              <div className="checkout-total">
                <span>{ko ? "실제 청구 금액" : "Actual charge"}</span>
                <strong>₩0</strong>
              </div>
            </section>
            <section className="checkout-method">
              <h2>{ko ? "테스트 결제 수단" : "Test payment method"}</h2>
              <div>
                <CreditCard size={24} />
                <strong>
                  {ko ? "테스트 카드 · 모의 처리" : "Test card · simulated"}
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
                onChange={(event) => setAccepted(event.target.checked)}
              />
              <span>
                {ko
                  ? "체험용 결제이며 실제 청구·LP 변경이 없음을 확인했어요."
                  : "I understand this is a test with no real charge or LP change."}
              </span>
            </label>
            <button
              className="primary full"
              disabled={!accepted}
              onClick={() => {
                if (accepted) setComplete(true);
              }}
            >
              {ko
                ? "테스트 결제하기 · 실제 ₩0"
                : "Complete test checkout · actual ₩0"}
            </button>
            <Link className="text-button" to="/plan">
              {ko ? "취소하고 돌아가기" : "Cancel and return"}
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
