import { UserRound } from "lucide-react";
import { useI18n } from "../i18n";
import "./account-entry.css";

/** The host supplies verified account state; this component never reads tokens. */
export function AccountEntry({
  member,
  onClick,
}: {
  member: boolean;
  onClick: () => void;
}) {
  const { language } = useI18n();
  const label = member
    ? language === "ko"
      ? "내 계정"
      : "My account"
    : language === "ko"
      ? "로그인 / 회원가입"
      : "Sign in / Sign up";
  return (
    <button className="account-entry" onClick={onClick} aria-label={label}>
      {member && <UserRound size={16} aria-hidden="true" />}
      <span>{label}</span>
    </button>
  );
}
