import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import EuljiroExamplePage from "../src/examples/EuljiroExamplePage";
import "../src/styles.css";
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <I18nProvider>
      <EuljiroExamplePage
        canonicalPlaceIds={{
          wooraeok: "00000000-0000-4000-8000-000000000099",
          "hidemeplease-euljiro": "not-a-real-canonical-id",
        }}
      />
    </I18nProvider>
  </BrowserRouter>,
);
