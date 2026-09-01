"use client";

import { PlannerTasksWorkspace } from "@/components/planner/PlannerTasksWorkspace";
import type { PlannerLabel, PlannerReminder, PlannerTask, TaskList } from "@/lib/planner/types";
import type { PlannerTaskView, PlannerTaskViewContext } from "@/lib/planner/task-views";

export function PlannerTasks(props: {
  initialListId?: string;
  initialTaskLabelIds: Record<string, string[]>;
  initialReminders: PlannerReminder[];
  initialTasks: PlannerTask[];
  initialView: PlannerTaskView;
  labels: PlannerLabel[];
  lists: TaskList[];
  taskViewContext: PlannerTaskViewContext;
  timeZone: string;
}) {
  return <PlannerTasksWorkspace {...props} />;
}
