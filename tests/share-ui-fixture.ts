import { demoCatalog, demoSchedule } from "../shared/planner-demo";
import { evaluateSchedule, type Itinerary } from "../shared/planner";
import { plannerInput } from "./fixtures/planning";
import { shareSnapshot } from "../shared/sharing";
// Synthetic fixture only; never imported by the application entry.
const input = {
  ...plannerInput,
  dietary: "PRIVATE_DIETARY",
  language: "en" as const,
};
const schedule = demoSchedule(input);
export const sharePlan: Itinerary = {
  id: "71000000-0000-4000-8000-000000000003",
  revision: 1,
  input,
  schedule: {
    ...schedule,
    title: "PRIVATE_MODEL_TITLE",
    summary: "PRIVATE_MODEL_SUMMARY",
  },
  catalog: demoCatalog,
  evaluation: evaluateSchedule(schedule, input, demoCatalog),
  createdAt: "2026-10-17T00:00:00Z",
  model: "fixture",
  provenance: "gemini",
  cost: 10,
};
Object.assign(sharePlan, {
  guestName: "PRIVATE_BOOKING_NAME",
  guestPhone: "PRIVATE_PHONE",
  accountEmail: "PRIVATE_EMAIL@example.invalid",
});
export const sharedSnapshot = shareSnapshot(sharePlan, "2026-10-17T00:00:00Z");
export const shareToken = "a".repeat(43);
export const shareLink = {
  id: "72000000-0000-4000-8000-000000000001",
  revision: 1,
  createdAt: "2026-10-17T00:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
  revokedAt: null,
};
