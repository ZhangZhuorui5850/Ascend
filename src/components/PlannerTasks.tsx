"use client";

import { PlannerTasksWorkspace } from "@/components/planner/PlannerTasksWorkspace";
import type {
  PlannerLabel,
  PlannerReminder,
  PlannerTask,
  TaskList,
} from "@/lib/planner/types";
import type { PlannerTaskView } from "@/lib/repo/planner-tasks";

export function PlannerTasks(props: {
  initialTaskLabelIds: Record<string, string[]>;
  initialReminders: PlannerReminder[];
  initialTasks: PlannerTask[];
  labels: PlannerLabel[];
  lists: TaskList[];
  timeZone: string;
  view: PlannerTaskView;
}) {
  return <PlannerTasksWorkspace {...props} />;
}
