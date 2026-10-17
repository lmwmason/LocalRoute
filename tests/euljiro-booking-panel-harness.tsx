import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import { EuljiroBookingPanel } from "../src/examples/EuljiroBookingPanel";
const id = "70000000-0000-4000-8000-000000000003";
function Fixture() {
  const [placeId, setPlaceId] = useState<string | undefined>(
    new URLSearchParams(location.search).has("missing") ? undefined : id,
  );
  Reflect.set(window, "__bookingPlace", setPlaceId);
  return (
    <main style={{ maxWidth: 600, padding: 8, margin: "auto" }}>
      <EuljiroBookingPanel placeId={placeId} />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <I18nProvider>
      <Fixture />
    </I18nProvider>
  </BrowserRouter>,
);
