import { useState } from "react";
import { Mail } from "lucide-react";
import { supabase } from "../supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="login-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!supabase || busy) return;
        setBusy(true);
        setStatus("");
        try {
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.location.origin },
          });
          setStatus(
            error
              ? "로그인 메일을 보내지 못했어요. 이메일 주소와 서비스 설정을 확인해 주세요."
              : "로그인 링크를 보냈어요. 이메일을 확인해 주세요.",
          );
        } catch {
          setStatus("연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="login-icon">
        <Mail size={28} />
      </div>
      <h3>나만의 발견을 함께 나눠요</h3>
      <p className="muted">이메일 링크로 간편하게 로그인할 수 있어요.</p>
      <label>
        이메일
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </label>
      <button className="primary full" disabled={!supabase || busy}>
        {busy ? "보내는 중…" : "로그인 링크 받기"}
      </button>
      {!supabase && (
        <p className="error-message">
          로그인 연결이 아직 설정되지 않았어요. 지도와 데모는 계속 이용할 수
          있어요.
        </p>
      )}
      {status && <p role="status">{status}</p>}
    </form>
  );
}
