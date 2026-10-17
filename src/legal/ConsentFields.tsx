import { useId } from "react";
import { useI18n } from "../i18n";
import { LegalNotices } from "./LegalPage";

export type ConsentChoices = {
  terms: boolean;
  privacy: boolean;
  supabaseTransfer: boolean;
  adult: boolean;
  publicLocalArea: boolean;
};
export const emptyChoices: ConsentChoices = {
  terms: false,
  privacy: false,
  supabaseTransfer: false,
  adult: false,
  publicLocalArea: false,
};
export function requiredAccepted(value: ConsentChoices) {
  return value.terms && value.privacy && value.supabaseTransfer && value.adult;
}
export function ConsentFields({
  value,
  onChange,
  optional = true,
  disabled = false,
}: {
  value: ConsentChoices;
  onChange: (value: ConsentChoices) => void;
  optional?: boolean;
  disabled?: boolean;
}) {
  const { language } = useI18n();
  const ko = language === "ko";
  const groupId = useId();
  const labels: [keyof ConsentChoices, string][] = [
    [
      "adult",
      ko ? "[필수] 만 18세 이상입니다." : "[Required] I am 18 or older.",
    ],
    [
      "terms",
      ko
        ? "[필수] 이용약관에 동의합니다."
        : "[Required] I accept the terms of service.",
    ],
    [
      "privacy",
      ko
        ? "[필수] 아래 개인정보 수집·이용에 동의합니다."
        : "[Required] I consent to the collection and use below.",
    ],
    [
      "supabaseTransfer",
      ko
        ? "[필수] Supabase 국외 이전·보관에 별도로 동의합니다."
        : "[Required] I separately consent to Supabase overseas transfer and storage.",
    ],
  ];
  if (optional)
    labels.push([
      "publicLocalArea",
      ko
        ? "[선택] 자가 입력한 거주 도시·지역 라벨을 추천과 함께 공개합니다."
        : "[Optional] Publish my self-declared home city/area label with recommendations.",
    ]);
  return (
    <fieldset className="legal-consent-fields" disabled={disabled}>
      <legend>{ko ? "가입 동의" : "Membership consent"}</legend>
      <p className="legal-summary">
        {ko
          ? "수집 항목: 이메일·사용자 식별자·인증 정보, 거주 도시와 선택 지역·범위, 동의 내역·버전·언어·서버 시각. 목적: 이메일 확인·계정 관리·지역 추천·동의 증빙. 보유: 회원 관계와 동의 증빙에 필요한 동안; 탈퇴·삭제는 메일로 요청하며 법정 보존은 별도 안내합니다. 필수 동의를 거부하면 회원 기능을 이용할 수 없습니다. 공개 탐색·데모는 계속 이용할 수 있어요."
          : "Data: email, user ID, authentication information, home city and optional area/coverage, consent choices, version, language and server time. Purposes: email verification, account management, regional recommendations and consent evidence. Retained while needed for membership and evidence; email us for closure/deletion, with any lawful retention explained separately. Required refusal prevents member features; public discovery and demo remain available."}
      </p>
      <p className="legal-summary">
        {ko
          ? "국외 이전: Supabase Pte. Ltd.(싱가포르, privacy@supabase.io), 인도 뭄바이(ap-south-1)의 기본 DB. 가입·로그인·저장 시 HTTPS로 위 항목과 이용 기능의 데이터를 보내 인증·DB·Storage를 운영하고 서비스에 필요한 동안 보관합니다. 미국 운영·지원 및 백업·메일 재위탁의 추가 국가는 출시 전 확인 대상입니다. 거부 시 회원 인증·저장이 불가능하며 철회는 lmw.hpc@gmail.com으로 요청할 수 있어요. Gemini·예약 연락처 제공·위치 추적은 이 동의에 포함되지 않습니다."
          : "Overseas recipient: Supabase Pte. Ltd., Singapore (privacy@supabase.io), primary DB in Mumbai, India (ap-south-1). During signup/login/saving, the data above and feature data are sent over HTTPS for Auth, DB and Storage, retained while needed. Additional US support/operations and backup/email subprocessor locations require prelaunch confirmation. Refusal prevents member authentication/storage. Withdraw at lmw.hpc@gmail.com. This consent excludes Gemini personal-data transfers, booking disclosures and location tracking."}
      </p>
      <nav
        className="legal-document-links"
        aria-label={ko ? "전문 바로 보기 · 새 창" : "Full notices · new tab"}
      >
        {(
          [
            ["terms", ko ? "이용약관 전문" : "Full terms"],
            ["privacy", ko ? "개인정보 처리방침 전문" : "Full privacy notice"],
            [
              "transfers",
              ko ? "국외 이전 안내 전문" : "Full overseas transfer notice",
            ],
          ] as const
        ).map(([document, label]) => (
          <a
            key={document}
            href={`/legal/${document}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {label}
            <span className="legal-new-tab">{ko ? "새 창" : "New tab"}</span>
          </a>
        ))}
      </nav>
      <LegalNotices />
      {([false, true] as const).map(
        (isOptional) =>
          (!isOptional || optional) && (
            <div
              className={`legal-choice-group ${isOptional ? "legal-choice-optional" : "legal-choice-required"}`}
              role="group"
              aria-labelledby={`${groupId}-${isOptional}`}
              key={String(isOptional)}
            >
              <h3 id={`${groupId}-${isOptional}`}>
                {isOptional
                  ? ko
                    ? "선택 동의"
                    : "Optional consent"
                  : ko
                    ? "필수 동의 · 4개"
                    : "Required consent · 4 choices"}
              </h3>
              {labels
                .filter(([key]) => (key === "publicLocalArea") === isOptional)
                .map(([key, label]) => (
                  <label className="legal-choice" key={key}>
                    <input
                      type="checkbox"
                      checked={value[key]}
                      required={key !== "publicLocalArea"}
                      onChange={(event) =>
                        onChange({ ...value, [key]: event.target.checked })
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
            </div>
          ),
      )}
      {optional && (
        <p>
          {ko
            ? "선택 거부 시에도 회원 기능을 이용할 수 있습니다. 라벨은 철회·계정 종료까지 공개하며 동의 설정에서 해제할 수 있습니다. 예약 프로필 저장·위치·마케팅 동의는 포함하지 않습니다."
            : "Optional refusal does not limit membership. The label stays public until withdrawal/account closure; turn it off in consent settings. This does not include booking-profile, location or marketing consent."}
        </p>
      )}
    </fieldset>
  );
}
