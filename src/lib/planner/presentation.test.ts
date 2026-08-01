import { describe, expect, it } from "vitest";
import {
  plannerReminderAnchorLabel,
  plannerReminderChannelLabel,
  plannerReminderStatusLabel,
} from "@/lib/planner/presentation";

describe("Planner visible reminder labels", () => {
  it("covers every reminder anchor", () => {
    expect((["due", "scheduled_start", "event_start", "exact"] as const).map(plannerReminderAnchorLabel)).toEqual([
      "到期时间", "计划开始", "事件开始", "指定时间",
    ]);
  });

  it("covers every reminder channel", () => {
    expect((["in_app", "web_push"] as const).map(plannerReminderChannelLabel)).toEqual(["应用内", "Web Push"]);
  });

  it("covers every reminder status", () => {
    expect((["pending", "leased", "sent", "failed", "canceled"] as const).map(plannerReminderStatusLabel)).toEqual([
      "待发送", "发送中", "已发送", "发送失败", "已取消",
    ]);
  });
});
