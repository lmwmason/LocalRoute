// Test-only mount. Account switching here does not perform authentication.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../src/i18n";
import { LegalConsentGate } from "../src/legal/LegalConsentGate";
import "../src/styles.css";
function Fixture() {
  const [userId, setUserId] = useState("fixture-a");
  Reflect.set(window, "__consentAccount", setUserId);
  return (
    <I18nProvider>
      <main style={{ maxWidth: 640, margin: "auto", padding: 16 }}>
        <LegalConsentGate
          userId={userId}
          settings={new URLSearchParams(location.search).has("settings")}
        >
          <h2>MEMBER_CONTENT</h2>
          <button type="button">Member action</button>
        </LegalConsentGate>
      </main>
    </I18nProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
