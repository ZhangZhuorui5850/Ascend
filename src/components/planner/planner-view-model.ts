export type PlannerInspectorSurface = "inline" | "drawer" | "sheet";
export type PlannerNavigationSurface = "sidebar" | "segmented";

export type PlannerWorkspacePresentation = {
  columns: 1 | 2 | 3;
  navigation: PlannerNavigationSurface;
  inspector: PlannerInspectorSurface;
};

export type PlannerListItem = {
  id: string;
  status: string;
};

type PlannerMutationSettlement<T extends PlannerListItem> = {
  current: T[];
  previous: T[];
  selectedId: string | null;
  ok: boolean;
};

export function resolveTaskWorkspace(width: number): PlannerWorkspacePresentation {
  if (width <= 760) {
    return {
      columns: 1,
      navigation: "segmented",
      inspector: "sheet",
    };
  }
  if (width < 1180) {
    return {
      columns: 2,
      navigation: "sidebar",
      inspector: "drawer",
    };
  }
  return {
    columns: 3,
    navigation: "sidebar",
    inspector: "inline",
  };
}

export function settleTaskMutation<T extends PlannerListItem>({
  current,
  previous,
  selectedId,
  ok,
}: PlannerMutationSettlement<T>): {
  items: T[];
  selectedId: string | null;
  status: "saved" | "restored";
} {
  if (ok) {
    return {
      items: current,
      selectedId: keepValidSelection(current, selectedId),
      status: "saved",
    };
  }
  return {
    items: previous,
    selectedId: keepValidSelection(previous, selectedId),
    status: "restored",
  };
}

export function resolveOverlayDismissal(
  reason: "escape" | "outside-press" | "close-button" | "programmatic",
): { close: true; restoreFocus: true } {
  void reason;
  return {
    close: true,
    restoreFocus: true,
  };
}

export function findPlannerMotionLiteralViolations(css: string): string[] {
  return [...new Set(css.match(/\b\d+(?:\.\d+)?m?s\b/g) ?? [])];
}

function keepValidSelection<T extends PlannerListItem>(
  items: T[],
  selectedId: string | null,
): string | null {
  if (selectedId && items.some((item) => item.id === selectedId)) return selectedId;
  return items[0]?.id ?? null;
}
