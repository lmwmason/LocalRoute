import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ContributorOutcomes } from "../src/ContributorOutcomes";
import {
  ContributorOutcomesError,
  type LoadContributorOutcomes,
} from "../src/visit-rewards/contributor-outcomes-api";
import { contributorOutcomesSchema } from "../shared/contributor-outcomes";

const load: LoadContributorOutcomes = async (owner, signal) => {
  const response = await fetch(`/api/fixture/outcomes?owner=${owner}`, {
    signal,
  });
  if (!response.ok) throw new ContributorOutcomesError(response.status);
  return contributorOutcomesSchema.parse(await response.json());
};
function Fixture() {
  const params = new URLSearchParams(location.search);
  const [owner, setOwner] = useState<string | null>("owner");
  return (
    <>
      <button
        style={{ minHeight: 44 }}
        onClick={() => setOwner(owner === "owner" ? "other" : null)}
      >
        Switch account
      </button>
      <ContributorOutcomes
        userId={owner}
        language={params.get("lang") === "en" ? "en" : "ko"}
        load={load}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
