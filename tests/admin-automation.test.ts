import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { createAdminAutomation } from "../server/admin-automation";
import { createAiAssistance } from "../server/ai-assistance";
import type { Actor, Repository } from "../server/repository";
import type { AssistanceModel } from "../server/ai-assistance/model";

function fixture(count = 2) {
  let role: Actor["role"] = "admin";
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `a0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    kind: i === 0 ? "report" : "endorsement",
    title: "Fixture",
    body: "Useful recommendation; private@example.com 010-1234-5678",
  }));
  const authenticate = vi.fn(async (): Promise<Actor> => ({
    id: "owner",
    role,
  }));
  const community = vi.fn(
    async (
      _actor: Actor,
      _action: string,
      _request: string | null,
      _payload: Record<string, unknown>,
    ) => ({ queue: rows }),
  );
  const repository = { authenticate, community } as unknown as Repository;
  const inputs: unknown[] = [];
  const structured = vi.fn(
    async <T>(schema: z.ZodType<T>, _system: string, data: unknown) => {
      inputs.push(data);
      return schema.parse({
        recommendedAction: "human_review",
        signals: [],
        uncertainty: ["cannot_verify_authenticity"],
      });
    },
  );
  const model: AssistanceModel = {
    modelId: "test-fixture",
    structured: async (schema, system, data) =>
      schema.parse(await structured(schema, system, data)),
  };
  const assistance = createAiAssistance({
    repository,
    enabled: true,
    model,
    maxCalls: 20,
    perUserCalls: 20,
  });
  const automation = createAdminAutomation({
    repository,
    assistance,
    enabled: true,
  });
  return {
    automation,
    repository,
    assistance,
    authenticate,
    community,
    rows,
    structured,
    model,
    inputs,
    role: (value: Actor["role"]) => {
      role = value;
    },
  };
}
describe("operator-screen automatic evidence triage", () => {
  it("revalidates server roles before cached results and never accepts a traveler", async () => {
    const f = fixture();
    await f.automation.run("server-token", { language: "en" });
    f.role("traveler");
    await expect(
      f.automation.run("server-token", { language: "en" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.authenticate).toHaveBeenCalledTimes(4); // run + assessment per two rows, then second run.
    expect(f.structured).toHaveBeenCalledTimes(2);
  });
  it("fails closed when disabled without loading evidence or invoking Gemini", async () => {
    const f = fixture();
    const disabled = createAdminAutomation({
      repository: f.repository,
      assistance: f.assistance,
      enabled: false,
    });
    await expect(
      disabled.run("server-token", { language: "ko" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(f.community).not.toHaveBeenCalled();
    expect(f.structured).not.toHaveBeenCalled();
  });
  it("deduplicates concurrent identical items in a single process and sends only redacted text", async () => {
    const f = fixture();
    const results = await Promise.all([
      f.automation.run("a", { language: "en" }),
      f.automation.run("b", { language: "en" }),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(f.structured).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(f.inputs)).not.toContain("private@example.com");
    expect(JSON.stringify(f.inputs)).not.toContain("010-1234-5678");
    expect(JSON.stringify(f.inputs)).toContain("[REDACTED]");
    expect(results[0]).toMatchObject({
      mode: "automatic_triage_only",
      persistence: "process_cache_only",
    });
    expect(results[0].items[0].priority).toBe("high");
    expect(
      f.community.mock.calls.every(
        (call) => call.length === 4 && call[1] === "queue",
      ),
    ).toBe(true);
  });
  it("invalidates cached analysis when actual queue evidence changes", async () => {
    const f = fixture(1);
    await f.automation.run("token", { language: "en" });
    f.rows[0].body = "New evidence for this same item";
    await f.automation.run("token", { language: "en" });
    expect(f.structured).toHaveBeenCalledTimes(2);
  });
  it("bounds new work to three items per run and advances through remaining items", async () => {
    const f = fixture(5);
    const first = await f.automation.run("token", { language: "ko" });
    expect(first.items).toHaveLength(3);
    expect(first.remaining).toBe(2);
    const second = await f.automation.run("token", { language: "ko" });
    expect(second.items).toHaveLength(5);
    expect(second.remaining).toBe(0);
    expect(f.structured).toHaveBeenCalledTimes(5);
    expect(f.community.mock.calls.every((call) => call[1] === "queue")).toBe(
      true,
    );
  });
  it("keeps existing AI budgets and returns explicit failures without decisions", async () => {
    const f = fixture(2);
    const assistance = createAiAssistance({
      repository: f.repository,
      enabled: true,
      model: f.model,
      maxCalls: 1,
      perUserCalls: 1,
    });
    const automation = createAdminAutomation({
      repository: f.repository,
      assistance,
      enabled: true,
    });
    const result = await automation.run("token", { language: "en" });
    expect(result.items[1].assessment).toMatchObject({
      status: "failed",
      code: "rate_limited",
    });
    expect(result.items[1].priority).toBe("needs_information");
    expect(f.structured).toHaveBeenCalledOnce();
  });
});
