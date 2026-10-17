// Browser-only test fixture. The production entry never imports this file.
import { createRoot } from "react-dom/client";
import { I18nProvider, LanguageSwitch } from "../src/i18n";
import { LegalConsentGate } from "../src/legal";
import { Login } from "../src/components/Login";
import "../src/styles.css";
const params = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <main style={{ maxWidth: 520, margin: "auto", padding: 16 }}>
      <LanguageSwitch />
      {params.get("screen") === "login" ? (
        <Login />
      ) : (
        <LegalConsentGate
          userId="fixture-only"
          settings={params.has("settings")}
        >
          <p>MEMBER_CONTENT</p>
        </LegalConsentGate>
      )}
    </main>
  </I18nProvider>,
);
