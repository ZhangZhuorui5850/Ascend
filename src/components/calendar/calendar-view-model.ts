export const calendarRescheduleModes = ["drag", "resize", "click"] as const;

export type CalendarWorkspacePresentation = {
  initialView: "month" | "agenda";
  context: "rail" | "drawer" | "sheet";
  toolbar: "full" | "compact";
};

export function resolveCalendarWorkspace(width: number): CalendarWorkspacePresentation {
  if (width <= 760) {
    return {
      initialView: "agenda",
      context: "sheet",
      toolbar: "compact",
    };
  }
  if (width < 1180) {
    return {
      initialView: "month",
      context: "drawer",
      toolbar: "compact",
    };
  }
  return {
    initialView: "month",
    context: "rail",
    toolbar: "full",
  };
}

export function settleCalendarMutation<T>({
  ok,
  optimistic,
  previous,
  revert,
}: {
  ok: boolean;
  optimistic: T;
  previous: T;
  revert: () => void;
}): { entity: T; status: "saved" | "restored" } {
  if (ok) {
    return {
      entity: optimistic,
      status: "saved",
    };
  }
  revert();
  return {
    entity: previous,
    status: "restored",
  };
}
