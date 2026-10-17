import { afterEach, describe, expect, it, vi } from "vitest";
import { persistPending, readPending } from "../src/planner/pending";
import { plannerInput } from "./fixtures/planning";
afterEach(() => vi.unstubAllGlobals());
describe("paid request recovery", () => {
  it("preserves the same idempotency key across a reload and isolates it by user", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => values.get(k) || null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
    });
    const payload = {
      requestId: crypto.randomUUID(),
      input: plannerInput,
      expectedCost: 100,
      policyVersion: "pilot-v1",
      consent: true as const,
    };
    persistPending("user-a", payload);
    expect(readPending("user-a")).toEqual(payload);
    expect(readPending("user-b")).toBeNull();
    persistPending("user-a", null);
    expect(readPending("user-a")).toBeNull();
  });
  it("fails closed before issuing a paid request when tab storage is unavailable", () => {
    vi.stubGlobal("sessionStorage", {
      setItem: () => {
        throw new Error("quota");
      },
      getItem: () => "{bad-json",
    });
    expect(readPending("user-a")).toBeNull();
    expect(() =>
      persistPending("user-a", {
        requestId: crypto.randomUUID(),
        input: plannerInput,
        expectedCost: 100,
        policyVersion: "pilot-v1",
        consent: true,
      }),
    ).toThrow("PENDING_STORAGE_UNAVAILABLE");
  });
});
