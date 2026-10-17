import {
  LEGAL_VERSION,
  legalDocuments,
  type LegalDocument,
} from "../../shared/legal";
import { useI18n } from "../i18n";
import { notices, legalSources } from "./content";
import "./legal.css";

export function LegalPage({
  document = "privacy",
  language: chosenLanguage,
}: {
  document?: LegalDocument;
  language?: "ko" | "en";
}) {
  const { language: currentLanguage } = useI18n();
  const language = chosenLanguage || currentLanguage;
  const notice = notices[language][document];
  return (
    <article className="legal-page" lang={language}>
      <h2>{notice.title}</h2>
      <p>
        {language === "ko"
          ? "시행일·자료 확인일"
          : "Effective / sources checked"}
        : 2026-10-17 · {LEGAL_VERSION}
      </p>
      {notice.sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <p>{section.text}</p>
        </section>
      ))}
      <section>
        <h3>{language === "ko" ? "공식 참고 자료" : "Official references"}</h3>
        <ul>
          {legalSources.map(([title, url]) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer">
                {title}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

/** Works inside Login without requiring an App/router change. */
export function LegalNotices() {
  const { language } = useI18n();
  return (
    <nav
      className="legal-notices"
      aria-label={language === "ko" ? "법적 고지" : "Legal notices"}
    >
      {legalDocuments.map((document) => (
        <details key={document}>
          <summary>{notices[language][document].title}</summary>
          <LegalPage document={document} />
        </details>
      ))}
    </nav>
  );
}
