import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readTripDraft, writeTripDraft } from "../src/planner/trip-draft";
import { plannerInput } from "./fixtures/planning";
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("trip draft privacy and recovery", () => {
  it("preserves choices even before a destination is selected", () => {
    const draft = {
      ...plannerInput,
      destination: null,
      activities: ["art", "nature"] as const,
    };
    writeTripDraft({ ...draft, activities: [...draft.activities] });
    expect(readTripDraft()).toMatchObject({
      destination: null,
      activities: ["art", "nature"],
    });
  });
  it("adopts a guest draft once and never exposes one member's input to another", () => {
    writeTripDraft({ ...plannerInput, dietary: "private guest preference" });
    expect(readTripDraft("member-a")?.dietary).toBe("private guest preference");
    expect(readTripDraft()).toBeNull();
    expect(readTripDraft("member-b")).toBeNull();
    expect(readTripDraft("member-a")?.dietary).toBe("private guest preference");
  });
  it("survives malformed or blocked optional storage without crashing", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => "{invalid",
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readTripDraft("member-a")).toBeNull();
    expect(() => writeTripDraft(plannerInput, "member-a")).not.toThrow();
  });
});
