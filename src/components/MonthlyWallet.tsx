import { useEffect, useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";

type Quote = Awaited<ReturnType<typeof api.quote>>;
type WalletState = {
  owner: string;
  quote?: Quote;
  error?: boolean;
};

/** Mount only inside the verified member's current LegalConsentGate. The server
 * checks identity/consent again and atomically claims at most one monthly grant.
 */
export function MonthlyWallet({ userId }: { userId: string }) {
  const { language, t } = useI18n();
  const [state, setState] = useState<WalletState>({ owner: userId });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api.quote(userId).then(
      (quote) => {
        if (active) setState({ owner: userId, quote });
      },
      () => {
        if (active) setState({ owner: userId, error: true });
      },
    );
    return () => {
      active = false;
    };
  }, [userId, attempt]);
  const current = state.owner === userId ? state : { owner: userId };
  const loading = !current.quote && !current.error;
  const amount = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value)
      ? value.toLocaleString(language === "ko" ? "ko-KR" : "en-US")
      : "—";
  return (
    <section aria-label={t("wallet.title")}>
      <h3>{t("wallet.title")}</h3>
      {loading ? (
        <p role="status">{t("wallet.loading")}</p>
      ) : current.error ? (
        <p role="alert">{t("errors.MONTHLY_ALLOWANCE_UNAVAILABLE")}</p>
      ) : (
        <div className="lp-confirm" aria-live="polite">
          <div>
            <span>{t("planner.promo")}</span>
            <strong>{amount(current.quote?.promo)} LP</strong>
          </div>
          <div>
            <span>{t("planner.earned")}</span>
            <strong>{amount(current.quote?.earned)} LP</strong>
          </div>
          {Boolean(current.quote?.held) && (
            <div>
              <span>{t("wallet.held")}</span>
              <strong>{amount(current.quote?.held)} LP</strong>
            </div>
          )}
        </div>
      )}
      <p>{t("planner.expiry")}</p>
      <button
        type="button"
        className="secondary full"
        disabled={loading}
        onClick={() => {
          setState({ owner: userId });
          setAttempt((previous) => previous + 1);
        }}
      >
        {t("wallet.refresh")}
      </button>
      <a className="secondary full" href="/checkout/test">
        {t("wallet.checkout")}
      </a>
    </section>
  );
}
