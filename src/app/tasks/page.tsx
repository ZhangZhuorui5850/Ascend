import { PlannerTasks } from "@/components/PlannerTasks";
import { PlannerShell } from "@/components/planner/PlannerShell";
import { shiftDateKey } from "@/lib/dates";
import { isPlannerTaskView } from "@/lib/planner/task-views";
import { dateKeyInTimeZone } from "@/lib/planner/time";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { listPlannerLabels, listPlannerTaskLabelIds } from "@/lib/repo/planner-labels";
import { listTaskLists } from "@/lib/repo/planner-lists";
import { listTaskViewSource } from "@/lib/repo/planner-tasks";
import { listWorkspaceReminders } from "@/lib/repo/planner-reminders";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string; list?: string }> }) {
  const access = await requirePageWorkspace("/tasks");
  const db = getDb();
  const query = await searchParams;
  const requestedView = isPlannerTaskView(query.view) ? query.view : "inbox";
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?").get(access.workspaceId) as {
    timezone: string;
  };
  const now = new Date();
  const today = dateKeyInTimeZone(now, workspace.timezone);
  const lists = listTaskLists(db, access);
  const listId = query.list && lists.some((list) => list.id === query.list) ? query.list : undefined;
  const view = listId ? "all" : requestedView;
  const taskSource = listTaskViewSource(db, access);
  const taskViewContext = {
    today,
    upcomingEnd: shiftDateKey(today, 30),
    now: now.toISOString(),
    inboxId: taskSource.inboxId,
  };

  return (
    <PlannerShell
      active="tasks"
      description="从收集箱收集任务，分离到期与排期，并保留完成轨迹。"
      title="任务"
    >
      <div className="plannerTasksPage">
        <PlannerTasks
          initialReminders={listWorkspaceReminders(db, access)}
          initialListId={listId}
          initialTaskLabelIds={listPlannerTaskLabelIds(db, access)}
          initialTasks={taskSource.tasks}
          initialView={view}
          labels={listPlannerLabels(db, access)}
          lists={lists}
          taskViewContext={taskViewContext}
          timeZone={workspace.timezone}
        />
      </div>
    </PlannerShell>
  );
}
