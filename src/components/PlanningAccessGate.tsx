import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { useI18n } from "../i18n";
import "./planning-access.css";

/** Host provides App's server-verified identity, never a raw cached token. */
export function PlanningAccessGate({
  verified,
  signedIn,
  onLogin,
  children,
}: {
  verified: boolean;
  signedIn: boolean;
  onLogin: () => void;
  children: ReactNode;
}) {
  const { language } = useI18n();
  if (verified) return <>{children}</>;
  const ko = language === "ko";
  return (
    <section
      className="planning-access"
      aria-labelledby="planning-access-title"
    >
      <span className="planning-access-icon">
        <LockKeyhole size={25} aria-hidden="true" />
      </span>
      <p className="planning-access-eyebrow">
        {ko ? "회원 전용 일정 만들기" : "MEMBER-ONLY TRIP PLANNING"}
      </p>
      <h1 id="planning-access-title">
        {signedIn
          ? ko
            ? "이메일 확인 후 일정을 만들 수 있어요"
            : "Verify your email to create an itinerary"
          : ko
            ? "일정 만들기는 로그인 후 이용해 주세요"
            : "Sign in to create an itinerary"}
      </h1>
      <p>
        {ko
          ? "LP를 사용하는 개인화 일정은 로그인과 이메일 확인을 마친 회원만 만들 수 있어요. 비회원은 등록된 장소를 자유롭게 둘러볼 수 있어요."
          : "Personalized itineraries use LP and are available to signed-in members with a verified email. Guests can freely browse registered places."}
      </p>
      <div className="planning-access-actions">
        <button className="primary" onClick={onLogin}>
          {signedIn
            ? ko
              ? "내 계정에서 확인하기"
              : "Check my account"
            : ko
              ? "로그인 / 회원가입"
              : "Sign in / Sign up"}
        </button>
        <Link to="/discover" className="secondary">
          {ko ? "장소 둘러보기" : "Explore places"}
        </Link>
      </div>
    </section>
  );
}
