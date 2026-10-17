// Local UI fixture only; no Auth, database or provider calls.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { HomeRegionFields } from "../src/components/HomeRegionFields";
import { I18nProvider } from "../src/i18n";
import { loadRegions } from "../src/regions/administrative-regions";
import type { Locality } from "../shared/locality";
import { ConsentFields, emptyChoices } from "../src/legal/ConsentFields";
import "../src/styles.css";
import "../src/components/Login.css";
const params = new URLSearchParams(location.search);
localStorage.setItem(
  "localroute.language",
  params.get("lang") === "en" ? "en" : "ko",
);
let attempts = 0;
const loader = async () => {
  attempts++;
  if (params.has("error") && attempts === 1) throw new Error("fixture failure");
  if (params.has("loading"))
    await new Promise((resolve) => setTimeout(resolve, 700));
  return loadRegions();
};
function Harness() {
  const [value, setValue] = useState<Locality>({
    homeCity: params.get("city") ?? "",
    homeArea: params.get("area") ?? "",
    localityScope: "auto",
  });
  const [valid, setValid] = useState(false);
  const [choices, setChoices] = useState(emptyChoices);
  return (
    <main style={{ maxWidth: 480, margin: "auto", padding: 16 }}>
      <HomeRegionFields
        value={value}
        onChange={setValue}
        onValidityChange={setValid}
        load={loader}
      />
      <button type="button" disabled={!valid} style={{ minHeight: 44 }}>
        Save fixture
      </button>
      {params.has("consent") && (
        <form className="login-form">
          <ConsentFields
            value={choices}
            onChange={setChoices}
            optional={false}
          />
        </form>
      )}
      <output
        data-testid="locality"
        style={{ overflowWrap: "anywhere", display: "block" }}
      >
        {JSON.stringify(value)}
      </output>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <Harness />
  </I18nProvider>,
);
