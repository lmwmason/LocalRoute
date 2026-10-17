// Isolated browser fixtures: no API, keys, real venue/photo or database access.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MenuPhotoAssistant } from "../src/ai-assistance/MenuPhotoAssistant";
import { ContributionReviewAid } from "../src/ai-assistance/ContributionReviewAid";
import type { ConfirmedMenu, MenuExtraction } from "../shared/ai-assistance";

const params = new URLSearchParams(location.search);
const language = params.get("lang") === "ko" ? "ko" : "en";
const scenario = params.get("scenario");
const extraction: MenuExtraction = {
  items: [
    {
      name: "Fixture 비빔밥",
      price: null,
      priceText: null,
      currency: null,
      visibleText: "Fixture 비빔밥",
      confidence: "uncertain",
      uncertainty: ["price_unreadable", "currency_unreadable"],
    },
  ],
  unreadable_regions: ["bottom"],
  notes: ["partial_image"],
};
function Fixture() {
  const [output, setOutput] = useState<ConfirmedMenu | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [confirms, setConfirms] = useState(0);
  return (
    <main style={{ maxWidth: 720, margin: "auto", padding: 16 }}>
      <p>MOCK · Component fixture only</p>
      <MenuPhotoAssistant
        language={language}
        onExtract={async () => {
          if (scenario === "slow")
            await new Promise((done) => setTimeout(done, 500));
          if (scenario === "failure")
            return { status: "failed", code: "timeout" };
          return {
            status: "ready",
            data: extraction,
            metadata: {
              model: "fixture",
              promptVersion: "menu-visible-v1",
              source: "gemini",
              completedAt: "2026-10-17T01:00:00Z",
              requiresHumanReview: true,
            },
          };
        }}
        onConfirm={async (data) => {
          setConfirms((value) => value + 1);
          if (scenario === "confirmfail")
            throw new Error("private provider error must never be shown");
          setOutput(data);
        }}
        onSkip={() => setSkipped(true)}
      />
      <output
        id="confirmed"
        style={{ display: "block", overflowWrap: "anywhere" }}
      >
        {JSON.stringify(output)}
      </output>
      <output id="count">{confirms}</output>
      {skipped && (
        <p role="status">
          Fixture contribution continued without a menu photo.
        </p>
      )}
      <ContributionReviewAid
        language={language}
        result={{
          status: "ready",
          data: {
            recommendedAction: "human_review",
            signals: [
              {
                category: "factual_claim_needs_check",
                evidence: [
                  {
                    ref: "body",
                    quote: `<script>never run</script>${"긴본문".repeat(80)}`,
                  },
                ],
              },
            ],
            uncertainty: ["cannot_verify_visit", "not_fraud_probability"],
          },
          metadata: {
            model: "fixture",
            promptVersion: "review-evidence-v1",
            completedAt: "2026-10-17T01:00:00Z",
            source: "gemini",
            requiresHumanReview: true,
          },
        }}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
