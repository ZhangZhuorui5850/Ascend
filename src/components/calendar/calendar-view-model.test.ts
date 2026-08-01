import { describe, expect, it, vi } from "vitest";
import {
  calendarRescheduleModes,
  resolveCalendarWorkspace,
  settleCalendarMutation,
} from "./calendar-view-model";

describe("Calendar responsive and mutation contracts", () => {
  it("defaults 390px Calendar to agenda and uses a bottom sheet for creation", () => {
    expect(resolveCalendarWorkspace(390)).toEqual({
      initialView: "agenda",
      context: "sheet",
      toolbar: "compact",
    });
  });

  it("uses a right drawer on tablet and a context rail on desktop", () => {
    expect(resolveCalendarWorkspace(900).context).toBe("drawer");
    expect(resolveCalendarWorkspace(1440).context).toBe("rail");
  });

  it("reverts drag and resize mutations after a failed write", () => {
    const revert = vi.fn();
    const previous = { id: "event-1", start: "2026-07-31T09:00:00Z" };
    const optimistic = { id: "event-1", start: "2026-07-31T10:00:00Z" };

    const result = settleCalendarMutation({
      ok: false,
      previous,
      optimistic,
      revert,
    });

    expect(revert).toHaveBeenCalledOnce();
    expect(result.entity).toEqual(previous);
    expect(result.status).toBe("restored");
  });

  it("provides a click-based date and time path beside drag and resize", () => {
    expect(calendarRescheduleModes).toEqual(["drag", "resize", "click"]);
  });
});
