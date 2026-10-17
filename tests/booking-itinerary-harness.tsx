import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nProvider } from "../src/i18n";
import { ItineraryEditor } from "../src/planner/ItineraryEditor";
import { BookingButton } from "../src/booking/BookingButton";
import { createBookingApi } from "../src/booking/api";
import { euljiroExample } from "../shared/euljiro-example";
import {
  evaluateSchedule,
  type Candidate,
  type Itinerary,
} from "../shared/planner";
import { plannerInput } from "./fixtures/planning";
import "../src/styles.css";

// All API calls are intercepted by the browser test; no production imports or keys.
const api = createBookingApi(async () => undefined);
const dates = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
const cafeId = "70000000-0000-4000-8000-000000000003";
const catalog: Candidate[] = euljiroExample.stops.map((stop, index) => ({
  id: index === 1 ? cafeId : `fixture-${index}`,
  name: stop.name,
  kind: stop.kind,
  address: stop.address,
  lat: stop.lat,
  lng: stop.lng,
  tags: [],
  endorsements: [],
  source: {
    provider: "localroute",
    observedAt: "2026-10-17",
    verification: "canonical",
  },
  externalIds:
    index === 1
      ? [
          {
            provider: "heyyumi",
            externalId: "fixture-cafe",
            observedAt: "2026-10-17T00:00:00Z",
            possiblyClosed: false,
          },
        ]
      : [],
}));
function plan(date: string, multi: boolean): Itinerary {
  const input = {
    ...plannerInput,
    startDate: date,
    endDate: multi ? dates[3] : date,
  };
  const schedule = {
    title: "Mock booking itinerary",
    summary: "Mock only; no booking or LP operations.",
    days: (multi ? dates : [date]).map((date) => ({
      date,
      stops: euljiroExample.stops.map((stop, index) => ({
        candidateId: catalog[index].id,
        start: stop.start,
        end: stop.end,
        purpose: stop.purpose,
        explanation: "Mock stop",
      })),
    })),
  };
  return {
    id: "71000000-0000-4000-8000-000000000003",
    revision: 1,
    input,
    schedule,
    catalog,
    evaluation: evaluateSchedule(schedule, input, catalog),
    createdAt: "2026-10-17T00:00:00Z",
    model: "mock",
    provenance: "operator_example",
    cost: 0,
  };
}
function Fixture() {
  const params = new URLSearchParams(location.search),
    language = params.get("lang") === "en" ? "en" : "ko";
  const [date, setDate] = useState<string | undefined>(dates[0]);
  const [time, setTime] = useState<string | undefined>("13:15");
  const [revision, setRevision] = useState(0);
  const form = params.get("mode") === "form";
  return (
    <main style={{ maxWidth: 900, margin: "auto", padding: 12 }}>
      <div
        role="group"
        aria-label="Fixture plans"
        style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
      >
        {dates.map((value) => (
          <button
            key={value}
            style={{ minHeight: 44 }}
            onClick={() => setDate(value)}
          >
            {value}
          </button>
        ))}
        {form && (
          <>
            <button onClick={() => setTime("14:30")}>
              Change planned time
            </button>
            <button
              onClick={() => {
                setDate(undefined);
                setTime(undefined);
              }}
            >
              Clear prefill
            </button>
            <button onClick={() => setRevision(revision + 1)}>
              Unchanged context
            </button>
          </>
        )}
      </div>
      {form ? (
        <BookingButton
          api={api}
          placeId={cafeId}
          language={language}
          initialDate={date}
          initialTime={time}
        />
      ) : (
        <ItineraryEditor
          key={date}
          itinerary={plan(date!, params.has("multi"))}
          onSaved={() => {}}
          onRegenerate={() => {}}
        />
      )}
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
