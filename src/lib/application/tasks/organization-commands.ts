import type Database from "better-sqlite3";
import type { WorkspaceScope } from "../../access-context";
import type {
  PlannerTask,
  TaskSeries,
  TaskSeriesGenerationMode,
} from "../../planner/types";
import { setPlannerTaskLabels } from "../../repo/planner-labels";
import { createTaskSeries } from "../../repo/planner-series";

export type CreateRecurringTaskInput = {
  clientMutationId: string;
  rrule: string;
  timezone: string;
  generationMode: TaskSeriesGenerationMode;
  firstOccurrenceAt: string;
  template: {
    listId: string;
    title: string;
    notes?: string;
    subjectCode?: string | null;
    priority?: 1 | 2 | 3;
    estimatedMinutes?: number;
  };
};

/** Owns the atomic boundary spanning task_series and its first planner_tasks occurrence. */
export function createRecurringTask(
  db: Database.Database,
  scope: WorkspaceScope,
  input: CreateRecurringTaskInput,
): { series: TaskSeries; task: PlannerTask } {
  return db.transaction(() => createTaskSeries(db, scope, input))();
}

/** Owns the atomic boundary between planner_task_labels and the task version. */
export function setTaskLabels(
  db: Database.Database,
  scope: WorkspaceScope,
  input: { taskId: string; expectedVersion: number; labelIds: string[] },
): PlannerTask {
  return db.transaction(() => setPlannerTaskLabels(db, scope, input))();
}
