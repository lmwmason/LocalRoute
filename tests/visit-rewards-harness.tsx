import { createRoot } from "react-dom/client";
import { createVisitRewardsApi } from "../src/visit-rewards/api";
import {
  VisitRewardAdminPanel,
  VisitRewardRequestPanel,
} from "../src/visit-rewards/VisitRewards";
const params = new URLSearchParams(location.search);
const api = createVisitRewardsApi(async () => "test-only");
const Component =
  params.get("admin") === "1" ? VisitRewardAdminPanel : VisitRewardRequestPanel;
createRoot(document.getElementById("root")!).render(
  <main style={{ maxWidth: 600, padding: 8, margin: "auto" }}>
    <Component api={api} language={params.get("lang") === "en" ? "en" : "ko"} />
  </main>,
);
