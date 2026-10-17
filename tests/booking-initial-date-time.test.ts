import { describe, expect, it } from "vitest";
import { initialBookingDateTime } from "../src/booking/initial-date-time";

describe("booking itinerary wall-clock prefill", () => {
  it.each([20, 21, 22, 23])(
    "keeps October %s at its planned Korean visit time",
    (day) => {
      expect(initialBookingDateTime(`2026-10-${day}`, "13:15")).toBe(
        `2026-10-${day}T13:15`,
      );
    },
  );
  it("preserves midnight and leap dates without browser timezone conversion", () => {
    expect(initialBookingDateTime("2028-02-29", "00:00")).toBe(
      "2028-02-29T00:00",
    );
    expect(initialBookingDateTime("2026-10-20", "23:59")).toBe(
      "2026-10-20T23:59",
    );
  });
  it.each([
    [undefined, undefined],
    ["2026-10-20", undefined],
    [undefined, "13:15"],
    ["2026-02-29", "13:15"],
    ["2026-13-01", "13:15"],
    ["2026-10-20", "24:00"],
    ["2026-10-20", "13:60"],
    ["2026-10-20", "13:15:00"],
    ["2026-10-20T00:00Z", "13:15"],
  ])(
    "leaves incomplete or invalid planned values empty: %s %s",
    (date, time) => {
      expect(initialBookingDateTime(date, time)).toBe("");
    },
  );
});
