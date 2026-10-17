// Local browser fixture: submissions stay in memory and never call a server.
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Feedback } from "../src/components/Feedback";
import { I18nProvider } from "../src/i18n";
import type { Place } from "../shared/domain";
import type { Feedback as Payload } from "../shared/community";
import "../src/styles.css";
import "../src/community.css";
const params = new URLSearchParams(location.search);
localStorage.setItem(
  "localroute.language",
  params.get("lang") === "en" ? "en" : "ko",
);
const place: Place = {
  id: "70000000-0000-4000-8000-000000000001",
  name: "Test place / 테스트 장소",
  category: "culture",
  kind: "culture",
  address: "Test address",
  lat: 37,
  lng: 127,
  tags: [],
  source: "demo",
  rating: null,
  reviewCount: 0,
  endorsements: params.has("empty")
    ? []
    : [
        {
          id: "a",
          versionId: "70000000-0000-4000-8000-000000000002",
          userId: "a",
          author: "Curator A",
          text: "A recommendation to visit in the morning. 아침 방문 추천",
          helpfulCount: 0,
        },
        {
          id: "b",
          versionId: "70000000-0000-4000-8000-000000000003",
          userId: "b",
          author: "Curator B",
          text: "A different recommendation for a quiet afternoon. 조용한 오후 추천",
          helpfulCount: 0,
        },
        {
          id: "self",
          versionId: "70000000-0000-4000-8000-000000000004",
          userId: "visitor",
          author: "My own recommendation",
          text: "Self",
          helpfulCount: 0,
        },
      ],
};
function Harness() {
  const [calls, setCalls] = useState<Payload[]>([]);
  const count = useRef(0);
  const pending = useRef<(() => void) | null>(null);
  const [other, setOther] = useState(false);
  return (
    <main style={{ maxWidth: 520, padding: 16, margin: "auto" }}>
      <p>TEST FIXTURE — no server writes</p>
      <Feedback
        place={
          other
            ? { ...place, id: "70000000-0000-4000-8000-000000000005" }
            : place
        }
        userId="visitor"
        onLogin={() => {}}
        submitFeedback={async (payload) => {
          count.current++;
          setCalls((previous) => [...previous, payload]);
          if (params.has("defer"))
            await new Promise<void>((resolve) => {
              pending.current = resolve;
            });
          if (params.has("fail") && count.current === 1)
            throw new Error("Simulated network failure");
        }}
      />
      <button onClick={() => pending.current?.()}>Resolve test save</button>
      <button onClick={() => setOther(!other)}>Switch test place</button>
      <output data-testid="calls" style={{ display: "none" }}>
        {JSON.stringify(calls)}
      </output>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <Harness />
  </I18nProvider>,
);
