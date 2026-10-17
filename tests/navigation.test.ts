import { describe, expect, it } from "vitest";
import { readAppRoute } from "../src/navigation";
import { toggleChoice } from "../shared/preferences";
describe("URL navigation and selections", () => {
  it("keeps a contribution draft open behind sign in", () => {
    const route = readAppRoute("/login", "", {
      overlay: true,
      backgroundPath: "/contribute?place=one",
    });
    expect(route.panel).toBe("contribute");
    expect(route.loginOverlay).toBe(true);
    expect(route.targetId).toBe("one");
  });
  it("supports deep links and rejects external back destinations", () => {
    expect(readAppRoute("/places/%oops", "", {}).placeId).toBe("%oops");
    expect(
      readAppRoute("/login", "", { backgroundPath: "//evil.example" })
        .background,
    ).toBe("/discover");
    expect(readAppRoute("/plan/new/2", "", null).tab).toBe("plan");
    expect(readAppRoute("/saved", "", null).tab).toBe("trip");
  });
  it("retains independent choices and supports deselection without mutation", () => {
    const original = ["food"];
    const chosen = toggleChoice(toggleChoice(original, "art"), "nature");
    expect(chosen).toEqual(["food", "art", "nature"]);
    expect(toggleChoice(chosen, "art")).toEqual(["food", "nature"]);
    expect(original).toEqual(["food"]);
  });
});
