import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import { ShareItinerary } from "../src/planner/ShareItinerary";
import SharedItineraryPage from "../src/planner/SharedItineraryPage";
import { sharePlan } from "./share-ui-fixture";
import "../src/styles.css";
import "../src/planner/planner.css";
function Fixture() {
  const [open, setOpen] = useState(true);
  const [plan, setPlan] = useState(sharePlan);
  Reflect.set(window, "__sharePlan", setPlan);
  return location.pathname.startsWith("/s/") ? (
    <SharedItineraryPage />
  ) : (
    <>
      <button onClick={() => setOpen(true)}>Open share</button>
      {open && (
        <ShareItinerary itinerary={plan} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <I18nProvider>
      <Fixture />
    </I18nProvider>
  </BrowserRouter>,
);
