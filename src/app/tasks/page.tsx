import { PlannerTasks } from "@/components/PlannerTasks";
import { PlannerShell } from "@/components/planner/PlannerShell";
import { dateKeyInTimeZone } from "@/lib/planner/time";
import type { PlannerTaskView } from "@/lib/repo/planner-tasks";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { listPlannerLabels, listPlannerTaskLabelIds } from "@/lib/repo/planner-labels";
import { listTaskLists } from "@/lib/repo/planner-lists";
import { listTaskView } from "@/lib/repo/planner-tasks";
import { listWorkspaceReminders } from "@/lib/repo/planner-reminders";

export const dynamic = "force-dynamic";

const VIEWS = new Set<PlannerTaskView>([
  "inbox",
  "today",
  "upcoming",
  "anytime",
  "overdue",
  "waiting",
  "completed",
  "trash",
  "all",
]);

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; list?: string }>;
}) {
  const access = await requirePageWorkspace("/tasks");
  const db = getDb();
  const query = await searchParams;
  const view = VIEWS.has(query.view as PlannerTaskView)
    ? query.view as PlannerTaskView
    : "inbox";
  const workspace = db.prepare("SELECT timezone FROM workspaces WHERE id = ?")
    .get(access.workspaceId) as { timezone: string };
  const today = dateKeyInTimeZone(new Date(), workspace.timezone);
  const lists = listTaskLists(db, access);
  const listId = query.list && lists.some((list) => list.id === query.list) ? query.list : undefined;
  const tasks = listTaskView(db, access, {
    view,
    today,
    listId,
    limit: 500,
  });

  return (
    <PlannerShell
      active="tasks"
      description="从收集箱收集任务，分离到期与排期，并保留完成轨迹。"
      title="任务"
    >
      <div className="plannerTasksPage">
      <PlannerTasks
        initialReminders={listWorkspaceReminders(db, access)}
        initialTaskLabelIds={listPlannerTaskLabelIds(db, access)}
        initialTasks={tasks}
        labels={listPlannerLabels(db, access)}
        lists={lists}
        timeZone={workspace.timezone}
        view={view}
      />
      </div>
    </PlannerShell>
  );
}
