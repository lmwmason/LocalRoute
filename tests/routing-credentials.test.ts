import express from "express";
import { expect, it, vi } from "vitest";
import { readConfig } from "../server/config";
import { attachPlanner } from "../server/planner/routes";
import { createKakaoRouting } from "../server/routing";

vi.mock("../server/routing", () => ({
  createKakaoRouting: vi.fn(() => ({ lookup: vi.fn() })),
}));

it("uses the Mobility credential for car routes and the Local credential for transit", () => {
  const config = readConfig({
    KAKAO_REST_API_KEY: "test-local-credential",
    KAKAO_MOBILITY_API_KEY: "test-mobility-credential",
  });
  attachPlanner(express(), config, undefined, async () => {
    throw new Error("No authentication calls expected");
  });
  expect(createKakaoRouting).toHaveBeenCalledWith(
    expect.objectContaining({
      carKey: "test-mobility-credential",
      transitKey: "test-local-credential",
    }),
  );
});
