import { createRoot } from "react-dom/client";
import { I18nProvider } from "../src/i18n";
import { ContributionForm } from "../src/components/ContributionForm";
import type { Place } from "../shared/domain";
import "../src/styles.css";
const places: Place[] = [
  {
    id: "00000000-0000-4000-8000-000000000099",
    name: "Local restaurant",
    address: "Seoul local address",
    lat: 37.56,
    lng: 126.99,
    kind: "restaurant",
    category: "한식",
    source: "localroute",
    tags: [],
    endorsements: [],
    rating: null,
    reviewCount: 0,
  },
];
createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <ContributionForm places={places} loggedIn onLogin={() => {}} />
  </I18nProvider>,
);
