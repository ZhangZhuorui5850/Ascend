import { describe, expect, it } from "vitest";
import { runPlannerMutation } from "@/components/planner/planner-mutations";

describe("runPlannerMutation", () => {
  it("returns successful action results unchanged", async () => {
    const result = await runPlannerMutation(
      async () => ({ ok: true as const, entity: { id: "task-1" } }),
      "网络异常",
    );

    expect(result).toEqual({ ok: true, entity: { id: "task-1" } });
  });

  it("turns transport failures into recoverable mutation results", async () => {
    const result = await runPlannerMutation(
      async () => {
        throw new Error("connection reset");
      },
      "网络异常，已恢复原状态",
    );

    expect(result).toEqual({
      ok: false,
      error: "网络异常，已恢复原状态",
      transportFailure: true,
    });
  });
});
