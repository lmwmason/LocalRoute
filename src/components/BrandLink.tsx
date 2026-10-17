import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export function BrandLink() {
  const { t } = useI18n();
  return (
    <Link to="/plan" className="brand" aria-label={t("LocalRoute 홈")}>
      <img src="/localroute-logo.png" alt="" />
      <span className="brand-word">
        Local<span>Route</span>
        <small>{t("동네의 발견, 여행의 시작")}</small>
      </span>
    </Link>
  );
}
