import { useI18n } from "../i18n";
import { useState } from "react";
import { Mail } from "lucide-react";
import { supabase } from "../supabase";
import { localitySchema, type Locality } from "../../shared/locality";
import { HomeRegionFields } from "./HomeRegionFields";
import {
  ConsentFields,
  emptyChoices,
  requiredAccepted,
} from "../legal/ConsentFields";
import { LegalNotices } from "../legal/LegalPage";
import { saveSignupConsent } from "../legal/signup-consent";
import "./Login.css";

export function Login() {
  const { t, language } = useI18n();
  const [choices, setChoices] = useState(emptyChoices);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [locality, setLocality] = useState<Locality>({
    homeCity: "",
    homeArea: "",
    localityScope: "auto",
  });
  const [status, setStatus] = useState("");
  const [regionValid, setRegionValid] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="login-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!supabase || busy) return;
        if (mode === "signup" && !requiredAccepted(choices)) {
          setStatus(
            language === "ko"
              ? "필수 동의를 모두 확인해 주세요."
              : "Please confirm all required choices.",
          );
          return;
        }
        if (
          mode === "signup" &&
          (!regionValid || !localitySchema.safeParse(locality).success)
        ) {
          setStatus(t("profile.regionRequired"));
          return;
        }
        setBusy(true);
        setStatus("");
        try {
          const { data, error } = await supabase.auth.signInWithOtp({
            email,
            options: {
              emailRedirectTo: window.location.origin,
              shouldCreateUser: mode === "signup",
              ...(mode === "signup"
                ? {
                    data: {
                      home_city: locality.homeCity.trim(),
                      home_area: locality.homeArea.trim(),
                      locality_scope: locality.localityScope,
                      // Publication consent is recorded only after email verification.
                      public_local_area: false,
                    },
                  }
                : {}),
            },
          });
          if (data.session) {
            await supabase.auth.signOut();
            setStatus(
              t(
                "이메일 확인 설정을 점검하고 있어요. 잠시 후 다시 시도해 주세요.",
              ),
            );
            return;
          }
          if (!error && mode === "signup") {
            const saved = saveSignupConsent({ email, language, choices });
            if (!saved) {
              setStatus(
                language === "ko"
                  ? "인증 링크를 보냈어요. 이 브라우저가 임시 저장을 허용하지 않아 이메일 확인 후 동의를 다시 확인해야 해요."
                  : "Verification link sent. This browser blocks temporary storage, so confirm consent again after verifying your email.",
              );
              return;
            }
          }
          setStatus(
            error
              ? t(
                  "로그인 메일을 보내지 못했어요. 이메일 주소와 서비스 설정을 확인해 주세요.",
                )
              : t(
                  "인증 링크를 보냈어요. 이메일의 링크를 눌러야 가입·로그인이 완료돼요. 만료되었다면 다시 요청해 주세요.",
                ),
          );
        } catch {
          setStatus(t("연결하지 못했어요. 잠시 후 다시 시도해 주세요."));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="login-icon">
        <Mail size={28} />
      </div>
      <div className="auth-tabs" role="group" aria-label={t("계정 이용 방식")}>
        <button
          type="button"
          aria-pressed={mode === "login"}
          onClick={() => {
            setMode("login");
            setStatus("");
          }}
        >
          {t("로그인")}
        </button>
        <button
          type="button"
          aria-pressed={mode === "signup"}
          onClick={() => {
            setMode("signup");
            setStatus("");
          }}
        >
          {t("회원가입")}
        </button>
      </div>
      <h3>{t("나만의 발견을 함께 나눠요")}</h3>
      <p className="muted">
        {t(
          "이메일 소유 확인이 필요해요. 받은 인증 링크를 누른 뒤 이용할 수 있어요.",
        )}
      </p>
      <label>
        {t("이메일")}
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </label>
      {mode === "signup" && (
        <>
          <HomeRegionFields
            value={locality}
            onChange={setLocality}
            onValidityChange={setRegionValid}
          />
          <p id="signup-region-help" className="fine-print">
            {t("profile.regionHelp")}
          </p>
          <ConsentFields
            value={choices}
            onChange={setChoices}
            optional={false}
            disabled={busy}
          />
          <p className="fine-print">
            {language === "ko"
              ? "선택한 동의는 이 브라우저에 최대 1시간 임시 보관하고 이메일 확인 후 서버에 기록해요. 다른 브라우저에서 열거나 임시 저장이 불가능하면 다시 확인해야 해요. 지역 공개는 동의 설정에서 별도로 선택할 수 있어요. 예약자명·전화번호는 가입에 필요하지 않습니다."
              : "Your choices are kept temporarily in this browser for up to one hour and recorded on the server after email verification. Another browser or blocked storage requires confirmation again. Area publication is optional in consent settings. Booking names and phone numbers are not required to sign up."}
          </p>
        </>
      )}
      {mode === "signup" && (
        <p className="fine-print">{t("booking.signupHint")}</p>
      )}
      <button
        className="primary full"
        disabled={
          !supabase ||
          busy ||
          (mode === "signup" && (!regionValid || !requiredAccepted(choices)))
        }
      >
        {busy ? t("보내는 중…") : t("로그인 링크 받기")}
      </button>
      {!supabase && (
        <p className="error-message">
          {t(
            "로그인 연결이 아직 설정되지 않았어요. 지도와 데모는 계속 이용할 수 있어요.",
          )}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {mode === "login" && <LegalNotices />}
    </form>
  );
}
