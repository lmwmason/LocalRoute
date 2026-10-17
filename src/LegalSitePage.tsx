import { Link, useLocation } from "react-router-dom";
import { legalDocuments, type LegalDocument } from "../shared/legal";
import { LegalPage } from "./legal";
import { LanguageSwitch, useI18n } from "./i18n";
import { BrandLink } from "./components/BrandLink";
export default function LegalSitePage() {
  const { language } = useI18n();
  const path = useLocation().pathname.split("/")[2];
  const document = legalDocuments.includes(path as LegalDocument)
    ? (path as LegalDocument)
    : null;
  return (
    <div className="app-shell">
      <header className="topbar">
        <BrandLink />
        <LanguageSwitch />
      </header>
      <main className="legal-site">
        <Link to="/plan" className="text-button">
          ← {language === "ko" ? "LocalRoute로 돌아가기" : "Back to LocalRoute"}
        </Link>
        <nav className="legal-page-links">
          {legalDocuments.map((doc) => (
            <Link
              key={doc}
              to={`/legal/${doc}`}
              aria-current={doc === document ? "page" : undefined}
            >
              {
                {
                  privacy: ["개인정보 처리방침", "Privacy"],
                  terms: ["이용약관", "Terms"],
                  transfers: ["국외 이전 안내", "Overseas processing"],
                  location: ["위치정보 안내", "Location"],
                }[doc][language === "ko" ? 0 : 1]
              }
            </Link>
          ))}
        </nav>
        {document ? (
          <LegalPage document={document} />
        ) : (
          <h1>
            {language === "ko" ? "페이지를 찾을 수 없어요" : "Page not found"}
          </h1>
        )}
      </main>
    </div>
  );
}
